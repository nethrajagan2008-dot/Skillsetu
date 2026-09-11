const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { computeBadges, getHistory, getWorkerRatings, avgRating } = require('../util');

const router = express.Router();

// GET /api/candidates?search=&trade=&minScore=
router.get('/', requireAuth, requireRole('msme'), (req, res) => {
  const { search = '', trade = '', minScore = 0 } = req.query;
  let sql = "SELECT * FROM users WHERE role = 'youth' AND active = 1 AND score >= ?";
  const params = [Number(minScore) || 0];
  if (trade) { sql += ' AND trade = ?'; params.push(trade); }
  if (search) { sql += ' AND (name LIKE ? OR trade LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY score DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ candidates: rows.map(summarize) });
});

function summarize(u) {
  const history = getHistory(u.id);
  const ratings = getWorkerRatings(u.id);
  const avg = avgRating(ratings);
  return {
    id: u.id, name: u.name, trade: u.trade, score: u.score,
    badges: computeBadges(u, history, avg, ratings.length),
    avgRating: avg, ratingsCount: ratings.length,
    historyCount: history.length,
  };
}

module.exports = router;
