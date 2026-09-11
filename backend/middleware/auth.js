const db = require('../db');
const { now } = require('../util');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session || session.expires_at < now()) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user || !user.active) return res.status(401).json({ error: 'Account not found' });
  req.user = user;
  req.token = token;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not permitted for this role' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
