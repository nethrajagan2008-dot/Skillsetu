const express = require('express');
const db = require('../db');
const { uid, now, notify } = require('../util');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/gigs?search=&trade=&status=open
router.get('/', (req, res) => {
  const { search = '', trade = '', status = 'open' } = req.query;
  let sql = `SELECT g.*, u.name AS msme_name, u.business_name AS msme_business
             FROM gigs g JOIN users u ON u.id = g.msme_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND g.status = ?'; params.push(status); }
  if (trade) { sql += ' AND g.trade = ?'; params.push(trade); }
  if (search) { sql += ' AND (g.title LIKE ? OR g.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY g.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ gigs: rows.map(mapGig) });
});

// GET /api/gigs/mine (msme)
router.get('/mine', requireAuth, requireRole('msme'), (req, res) => {
  const rows = db.prepare('SELECT * FROM gigs WHERE msme_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ gigs: rows.map(mapGig) });
});

// GET /api/gigs/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT g.*, u.name AS msme_name, u.business_name AS msme_business
                           FROM gigs g JOIN users u ON u.id = g.msme_id WHERE g.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Gig not found' });
  res.json({ gig: mapGig(row) });
});

// POST /api/gigs { title, trade, description, pay, duration, slots }
router.post('/', requireAuth, requireRole('msme'), (req, res) => {
  const { title, trade, description, pay, duration, slots } = req.body || {};
  if (!title || !trade) return res.status(400).json({ error: 'title and trade are required' });
  const id = uid('g_');
  db.prepare(`INSERT INTO gigs (id, msme_id, title, trade, description, pay, duration, slots, status, created_at)
              VALUES (?,?,?,?,?,?,?,?,'open',?)`)
    .run(id, req.user.id, title, trade, description || '', Number(pay) || 0, duration || '', Number(slots) || 1, now());
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(id);
  res.status(201).json({ gig: mapGig(gig) });
});

// PATCH /api/gigs/:id { status }
router.patch('/:id', requireAuth, requireRole('msme'), (req, res) => {
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(req.params.id);
  if (!gig || gig.msme_id !== req.user.id) return res.status(404).json({ error: 'Gig not found' });
  const { status } = req.body || {};
  if (status && ['open', 'closed'].includes(status)) {
    db.prepare('UPDATE gigs SET status = ? WHERE id = ?').run(status, gig.id);
  }
  res.json({ gig: mapGig(db.prepare('SELECT * FROM gigs WHERE id = ?').get(gig.id)) });
});

function mapGig(g) {
  return {
    id: g.id, msmeId: g.msme_id, msmeName: g.msme_business || g.msme_name || undefined,
    title: g.title, trade: g.trade, description: g.description, pay: g.pay,
    duration: g.duration, slots: g.slots, status: g.status, createdAt: g.created_at,
  };
}

module.exports = router;
