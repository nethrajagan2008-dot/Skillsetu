const express = require('express');
const db = require('../db');
const { uid, now, notify, publicUser } = require('../util');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function genOtp() { return String(Math.floor(1000 + Math.random() * 9000)); }

// POST /api/auth/send-otp { phone }
router.post('/send-otp', (req, res) => {
  const { phone } = req.body || {};
  if (!phone || String(phone).replace(/\D/g, '').length < 6) {
    return res.status(400).json({ error: 'Enter a valid phone number' });
  }
  const code = genOtp();
  db.prepare(
    'INSERT INTO otp_codes (phone, code, created_at) VALUES (?,?,?) ON CONFLICT(phone) DO UPDATE SET code=excluded.code, created_at=excluded.created_at'
  ).run(phone, code, now());
  // Demo mode: no real SMS gateway wired up, so we hand the OTP back directly.
  res.json({ ok: true, demoOtp: code });
});

// POST /api/auth/verify-otp { phone, code, role, name, trade, businessName, lang, referralCode }
router.post('/verify-otp', (req, res) => {
  const { phone, code, role, name, trade, businessName, lang, referralCode } = req.body || {};
  if (!phone || !code) return res.status(400).json({ error: 'Phone and code are required' });
  const row = db.prepare('SELECT * FROM otp_codes WHERE phone = ?').get(phone);
  if (!row || row.code !== String(code)) return res.status(400).json({ error: 'Incorrect code' });
  db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(phone);

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    if (!role || !['youth', 'msme'].includes(role) || !name) {
      return res.status(400).json({ error: 'role and name are required for new accounts' });
    }
    const id = uid('u_');
    const rc = 'REF-' + id.slice(-6).toUpperCase();
    let referredBy = null;
    if (referralCode) {
      const referrer = db.prepare('SELECT * FROM users WHERE referral_code = ?').get(referralCode);
      if (referrer) referredBy = referrer.id;
    }
    db.prepare(`
      INSERT INTO users (id, role, name, phone, lang, trade, business_name, score, referral_code, referred_by, active, created_at)
      VALUES (?,?,?,?,?,?,?,0,?,?,1,?)
    `).run(id, role, name, phone, lang || 'en', role === 'youth' ? (trade || null) : null, role === 'msme' ? (businessName || null) : null, rc, referredBy, now());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    if (referredBy) {
      db.prepare('UPDATE users SET score = score + 5 WHERE id = ?').run(referredBy);
      notify(referredBy, 'referral', 'Referral bonus', `${name} joined using your referral code. +5 trust points.`, null);
    }
  } else if (lang) {
    db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(lang, user.id);
    user.lang = lang;
  }

  if (!user.active) {
    return res.status(403).json({ error: 'This account has been deactivated. Contact an admin for help.' });
  }

  const token = uid('tok_');
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(token, user.id, now(), now() + SESSION_TTL_MS);

  res.json({ token, user: publicUser(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// PATCH /api/auth/me { lang, name, trade, businessName }
router.patch('/me', requireAuth, (req, res) => {
  const { lang, name, trade, businessName } = req.body || {};
  const u = req.user;
  db.prepare(`UPDATE users SET lang = COALESCE(?, lang), name = COALESCE(?, name), trade = COALESCE(?, trade), business_name = COALESCE(?, business_name) WHERE id = ?`)
    .run(lang || null, name || null, trade || null, businessName || null, u.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ user: publicUser(updated) });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

module.exports = router;
