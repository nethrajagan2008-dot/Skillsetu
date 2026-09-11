const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uid, now, notify, computeBadges, getHistory, getWorkerRatings, avgRating } = require('../util');
const { GRAPH_MAP, TRADES } = require('../config');

const router = express.Router();

// ---------- Skill graph ----------
router.get('/skill-graph/:trade', (req, res) => {
  const neighbours = GRAPH_MAP[req.params.trade];
  if (!neighbours) return res.status(404).json({ error: 'Unknown trade' });
  res.json({ trade: req.params.trade, neighbours: neighbours.map(([trade, overlap, weeks]) => ({ trade, overlap, bridgeWeeks: weeks })) });
});
router.get('/trades', (req, res) => res.json({ trades: TRADES }));

// ---------- Messages (per-application chat) ----------
router.get('/messages/thread/:applicationId', requireAuth, (req, res) => {
  const app = db.prepare(`SELECT a.*, g.msme_id FROM applications a JOIN gigs g ON g.id=a.gig_id WHERE a.id=?`).get(req.params.applicationId);
  if (!app || (app.candidate_id !== req.user.id && app.msme_id !== req.user.id)) return res.status(404).json({ error: 'Thread not found' });
  const rows = db.prepare('SELECT * FROM messages WHERE application_id = ? ORDER BY ts ASC').all(req.params.applicationId);
  db.prepare('UPDATE messages SET read = 1 WHERE application_id = ? AND recipient_id = ?').run(req.params.applicationId, req.user.id);
  res.json({ messages: rows.map(m => ({ id: m.id, senderId: m.sender_id, body: m.body, ts: m.ts, read: !!m.read })) });
});

router.post('/messages/thread/:applicationId', requireAuth, (req, res) => {
  const app = db.prepare(`SELECT a.*, g.msme_id, g.title FROM applications a JOIN gigs g ON g.id=a.gig_id WHERE a.id=?`).get(req.params.applicationId);
  if (!app || (app.candidate_id !== req.user.id && app.msme_id !== req.user.id)) return res.status(404).json({ error: 'Thread not found' });
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message body required' });
  const recipientId = app.candidate_id === req.user.id ? app.msme_id : app.candidate_id;
  const id = uid('m_');
  db.prepare('INSERT INTO messages (id, application_id, sender_id, recipient_id, body, ts, read) VALUES (?,?,?,?,?,?,0)')
    .run(id, req.params.applicationId, req.user.id, recipientId, body.trim(), now());
  notify(recipientId, 'message', 'New message', `${req.user.name}: ${body.trim().slice(0, 60)}`, `/chat/${req.params.applicationId}`);
  res.status(201).json({ message: { id, senderId: req.user.id, body: body.trim(), ts: now(), read: false } });
});

router.get('/messages/unread-count', requireAuth, (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE recipient_id = ? AND read = 0').get(req.user.id);
  res.json({ count: row.c });
});

// ---------- Notifications ----------
router.get('/notifications', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY ts DESC LIMIT 50').all(req.user.id);
  res.json({ notifications: rows.map(n => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, ts: n.ts, read: !!n.read })) });
});
router.post('/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});
router.post('/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// ---------- Referrals ----------
router.get('/referrals/mine', requireAuth, (req, res) => {
  const referred = db.prepare('SELECT id, name, role, created_at FROM users WHERE referred_by = ?').all(req.user.id);
  res.json({ referralCode: req.user.referral_code, referred, bonusPointsEarned: referred.length * 5 });
});

// ---------- Impact / marketplace analytics (public) ----------
router.get('/impact', (req, res) => {
  const verifiedWorkers = db.prepare("SELECT COUNT(*) c FROM users WHERE role='youth' AND score > 0").get().c;
  const gigsCompleted = db.prepare("SELECT COUNT(*) c FROM applications WHERE status='completed'").get().c;
  const wagesRouted = db.prepare("SELECT COALESCE(SUM(g.pay),0) s FROM applications a JOIN gigs g ON g.id=a.gig_id WHERE a.status='completed'").get().s;
  const avgScore = db.prepare("SELECT COALESCE(AVG(score),0) a FROM users WHERE role='youth' AND score > 0").get().a;
  const activeGigs = db.prepare("SELECT COUNT(*) c FROM gigs WHERE status='open'").get().c;
  const avgRatingRow = db.prepare("SELECT COALESCE(AVG(worker_rating_stars),0) a FROM applications WHERE worker_rating_stars IS NOT NULL").get().a;
  const byTrade = db.prepare("SELECT trade, COUNT(*) c FROM users WHERE role='youth' AND trade IS NOT NULL AND score > 0 GROUP BY trade ORDER BY c DESC").all();

  res.json({
    verifiedWorkers, gigsCompleted, wagesRouted,
    avgScore: Math.round(avgScore), activeGigs, avgRating: Math.round(avgRatingRow * 10) / 10,
    byTrade,
  });
});

// ---------- Admin ----------
function mapAdminUser(u) {
  return {
    id: u.id, role: u.role, name: u.name, phone: u.phone, lang: u.lang,
    trade: u.trade, businessName: u.business_name, score: u.score,
    referralCode: u.referral_code, referredBy: u.referred_by,
    active: !!u.active, createdAt: u.created_at,
  };
}

router.get('/admin/overview', requireAuth, requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(mapAdminUser);
  const gigs = db.prepare('SELECT id, title, trade, status, pay, msme_id, created_at FROM gigs ORDER BY created_at DESC').all();
  const applications = db.prepare('SELECT id, gig_id, candidate_id, status, payment_status FROM applications').all();
  res.json({ users, gigs, applications });
});

// GET /api/admin/users?search=&role= — dedicated, filterable user directory
router.get('/admin/users', requireAuth, requireRole('admin'), (req, res) => {
  const { search = '', role = '' } = req.query || {};
  let sql = 'SELECT * FROM users WHERE 1=1';
  const params = [];
  if (role && ['youth', 'msme', 'admin'].includes(role)) { sql += ' AND role = ?'; params.push(role); }
  if (search) {
    sql += ' AND (name LIKE ? OR phone LIKE ? OR business_name LIKE ? OR referral_code LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY created_at DESC';
  const users = db.prepare(sql).all(...params).map(mapAdminUser);
  res.json({ users });
});

router.patch('/admin/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { active } = req.body || {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id && !active) {
    return res.status(400).json({ error: "You can't deactivate your own admin account" });
  }
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  res.json({ user: mapAdminUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)) });
});

// DELETE /api/admin/users/:id — removes the user and their related records
router.delete('/admin/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't delete your own admin account" });
  if (target.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) return res.status(400).json({ error: 'Cannot delete the last remaining admin' });
  }

  const gigIds = db.prepare('SELECT id FROM gigs WHERE msme_id = ?').all(target.id).map(g => g.id);
  const appIdsAsCandidate = db.prepare('SELECT id FROM applications WHERE candidate_id = ?').all(target.id).map(a => a.id);
  const appIdsForGigs = gigIds.length
    ? db.prepare(`SELECT id FROM applications WHERE gig_id IN (${gigIds.map(() => '?').join(',')})`).all(...gigIds).map(a => a.id)
    : [];
  const allAppIds = [...new Set([...appIdsAsCandidate, ...appIdsForGigs])];

  // node:sqlite's DatabaseSync has no .transaction() helper (unlike
  // better-sqlite3), so wrap the cascade manually with BEGIN/COMMIT.
  db.exec('BEGIN');
  try {
    if (allAppIds.length) {
      const placeholders = allAppIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM messages WHERE application_id IN (${placeholders})`).run(...allAppIds);
      db.prepare(`DELETE FROM applications WHERE id IN (${placeholders})`).run(...allAppIds);
    }
    if (gigIds.length) {
      const placeholders = gigIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM gigs WHERE id IN (${placeholders})`).run(...gigIds);
    }
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM history_events WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  res.json({ ok: true });
});

router.delete('/admin/gigs/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM gigs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
