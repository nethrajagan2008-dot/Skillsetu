const express = require('express');
const db = require('../db');
const { uid, now, notify } = require('../util');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/applications { gigId }
router.post('/', requireAuth, requireRole('youth'), (req, res) => {
  const { gigId } = req.body || {};
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(gigId);
  if (!gig || gig.status !== 'open') return res.status(400).json({ error: 'Gig is not open' });
  const existing = db.prepare('SELECT * FROM applications WHERE gig_id = ? AND candidate_id = ?').get(gigId, req.user.id);
  if (existing) return res.status(409).json({ error: 'Already applied', application: mapApp(existing) });
  const id = uid('a_');
  db.prepare(`INSERT INTO applications (id, gig_id, candidate_id, status, payment_status, applied_at) VALUES (?,?,?,'applied','pending',?)`)
    .run(id, gigId, req.user.id, now());
  notify(gig.msme_id, 'application', 'New applicant', `${req.user.name} applied for "${gig.title}".`, '/candidates');
  res.status(201).json({ application: mapApp(db.prepare('SELECT * FROM applications WHERE id = ?').get(id)) });
});

// GET /api/applications/mine (youth)
router.get('/mine', requireAuth, requireRole('youth'), (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, g.title AS gig_title, g.trade AS gig_trade, g.pay AS gig_pay, u.business_name AS msme_business, u.name AS msme_name
    FROM applications a JOIN gigs g ON g.id = a.gig_id JOIN users u ON u.id = g.msme_id
    WHERE a.candidate_id = ? ORDER BY a.applied_at DESC
  `).all(req.user.id);
  res.json({ applications: rows.map(mapApp) });
});

// GET /api/applications/for-gig/:gigId (msme, owner only)
router.get('/for-gig/:gigId', requireAuth, requireRole('msme'), (req, res) => {
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(req.params.gigId);
  if (!gig || gig.msme_id !== req.user.id) return res.status(404).json({ error: 'Gig not found' });
  const rows = db.prepare(`
    SELECT a.*, u.name AS candidate_name, u.trade AS candidate_trade, u.score AS candidate_score
    FROM applications a JOIN users u ON u.id = a.candidate_id
    WHERE a.gig_id = ? ORDER BY a.applied_at DESC
  `).all(req.params.gigId);
  res.json({ applications: rows.map(mapApp) });
});

// GET /api/applications/mine-as-msme (all applications across the msme's gigs, for "My gigs")
router.get('/mine-as-msme', requireAuth, requireRole('msme'), (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, g.title AS gig_title, g.trade AS gig_trade, u.name AS candidate_name, u.score AS candidate_score
    FROM applications a JOIN gigs g ON g.id = a.gig_id JOIN users u ON u.id = a.candidate_id
    WHERE g.msme_id = ? ORDER BY a.applied_at DESC
  `).all(req.user.id);
  res.json({ applications: rows.map(mapApp) });
});

// PATCH /api/applications/:id/payment { status: pending|escrowed|released }
router.patch('/:id/payment', requireAuth, requireRole('msme'), (req, res) => {
  const app = getOwnedApp(req, res); if (!app) return;
  const { status } = req.body || {};
  if (!['pending', 'escrowed', 'released'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE applications SET payment_status = ? WHERE id = ?').run(status, app.id);
  if (status === 'escrowed') notify(app.candidate_id, 'payment', 'Payment escrowed', 'The business has escrowed your pay for this gig.', '/find-gigs');
  res.json({ application: mapApp(db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id)) });
});

// PATCH /api/applications/:id/complete { stars, comment }  — msme marks gig complete + rates worker
router.patch('/:id/complete', requireAuth, requireRole('msme'), (req, res) => {
  const app = getOwnedApp(req, res); if (!app) return;
  const { stars, comment } = req.body || {};
  const pts = 5 + Math.floor(Math.random() * 6);
  db.prepare(`UPDATE applications SET status='completed', payment_status='released', completed_at=?, worker_rating_stars=?, worker_rating_comment=? WHERE id=?`)
    .run(now(), stars ? Number(stars) : null, comment || null, app.id);

  const gig = db.prepare(`SELECT g.*, u.business_name AS msme_business, u.name AS msme_name FROM gigs g JOIN users u ON u.id = g.msme_id WHERE g.id = ?`).get(app.gig_id);
  const candidate = db.prepare('SELECT * FROM users WHERE id = ?').get(app.candidate_id);
  db.prepare('UPDATE users SET score = MIN(100, score + ?) WHERE id = ?').run(pts, candidate.id);
  db.prepare(`INSERT INTO history_events (id,user_id,type,trade,label,points,ref_id,ts) VALUES (?,?,?,?,?,?,?,?)`)
    .run(uid('h_'), candidate.id, 'gig_complete', gig.trade, `${gig.title} — ${gig.msme_business || gig.msme_name} ✓`, pts, app.id, now());

  notify(candidate.id, 'gig_complete', 'Gig completed', `"${gig.title}" was marked complete. +${pts} trust points.`, '/passport');
  res.json({ application: mapApp(db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id)) });
});

// PATCH /api/applications/:id/rate-msme { stars, comment } — worker rates the business back
router.patch('/:id/rate-msme', requireAuth, requireRole('youth'), (req, res) => {
  const app = db.prepare('SELECT * FROM applications WHERE id = ? AND candidate_id = ?').get(req.params.id, req.user.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  const { stars, comment } = req.body || {};
  if (!stars) return res.status(400).json({ error: 'stars is required' });
  db.prepare('UPDATE applications SET msme_rating_stars=?, msme_rating_comment=? WHERE id=?').run(Number(stars), comment || null, app.id);
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(app.gig_id);
  notify(gig.msme_id, 'rating', 'New rating received', `${req.user.name} rated your business ${stars}★.`, '/my-gigs');
  res.json({ application: mapApp(db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id)) });
});

function getOwnedApp(req, res) {
  const app = db.prepare('SELECT a.*, g.msme_id AS owner_id FROM applications a JOIN gigs g ON g.id = a.gig_id WHERE a.id = ?').get(req.params.id);
  if (!app || app.owner_id !== req.user.id) { res.status(404).json({ error: 'Application not found' }); return null; }
  return app;
}

function mapApp(a) {
  return {
    id: a.id, gigId: a.gig_id, candidateId: a.candidate_id, status: a.status, paymentStatus: a.payment_status,
    workerRating: a.worker_rating_stars ? { stars: a.worker_rating_stars, comment: a.worker_rating_comment } : null,
    msmeRating: a.msme_rating_stars ? { stars: a.msme_rating_stars, comment: a.msme_rating_comment } : null,
    appliedAt: a.applied_at, completedAt: a.completed_at,
    gigTitle: a.gig_title, gigTrade: a.gig_trade, gigPay: a.gig_pay,
    msmeName: a.msme_business || a.msme_name, candidateName: a.candidate_name, candidateScore: a.candidate_score,
  };
}

module.exports = router;
