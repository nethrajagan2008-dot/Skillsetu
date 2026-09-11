const express = require('express');
const db = require('../db');
const { uid, now, notify } = require('../util');
const { requireAuth, requireRole } = require('../middleware/auth');
const { RUBRIC } = require('../config');

const router = express.Router();

// POST /api/assessments { trade, criteriaScores: {seam: 82, ...} }
// Simulates NSQF-style rubric scoring against a submitted video/voice sample.
router.post('/', requireAuth, requireRole('youth'), (req, res) => {
  const { trade, criteriaScores } = req.body || {};
  if (!trade || !RUBRIC[trade]) return res.status(400).json({ error: 'Unknown trade' });

  const criteria = RUBRIC[trade];
  let score;
  if (criteriaScores && typeof criteriaScores === 'object') {
    const vals = criteria.map(c => Number(criteriaScores[c]) || 0);
    score = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  } else {
    // No client-side rubric provided — simulate a plausible score.
    score = 62 + Math.floor(Math.random() * 33);
  }
  score = Math.max(0, Math.min(100, score));

  const isFirstInTrade = !db.prepare(
    "SELECT 1 FROM history_events WHERE user_id = ? AND trade = ? AND type = 'assessment' LIMIT 1"
  ).get(req.user.id, trade);

  db.prepare(
    `INSERT INTO history_events (id, user_id, type, trade, label, points, ref_id, ts) VALUES (?,?,?,?,?,?,?,?)`
  ).run(uid('h_'), req.user.id, 'assessment', trade, `Skill assessment — ${trade} (${score}/100)`, 0, null, now());

  // Blend new score into running average, weighted toward the latest attempt.
  const current = req.user.score || 0;
  const blended = current ? Math.round(current * 0.4 + score * 0.6) : score;
  db.prepare('UPDATE users SET score = ? WHERE id = ?').run(blended, req.user.id);

  if (isFirstInTrade) {
    notify(req.user.id, 'assessment', 'Assessment complete', `You scored ${score}/100 in ${trade}.`, '/passport');
  }

  res.json({ score, blendedScore: blended, criteria: criteria.map(k => ({ key: k, score: criteriaScores ? Number(criteriaScores[k]) || 0 : null })) });
});

// GET /api/assessments/rubric/:trade
router.get('/rubric/:trade', (req, res) => {
  const criteria = RUBRIC[req.params.trade];
  if (!criteria) return res.status(404).json({ error: 'Unknown trade' });
  res.json({ trade: req.params.trade, criteria });
});

module.exports = router;
