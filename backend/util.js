const crypto = require('crypto');
const db = require('./db');

function uid(prefix = 'x') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

function passportId() {
  return 'SS-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function now() { return Date.now(); }

/** Compute badge keys earned by a user, mirroring the original client logic. */
function computeBadges(user, history, ratingsAvg, ratingsCount) {
  const badges = [];
  const assessments = history.filter(h => h.type === 'assessment');
  const gigCompletions = history.filter(h => h.type === 'gig_complete');
  const trades = new Set(assessments.map(h => h.trade).filter(Boolean));
  if (assessments.length >= 1) badges.push('first_verified');
  if (gigCompletions.length >= 1) badges.push('gig_starter');
  if (gigCompletions.length >= 3) badges.push('gig_pro');
  if ((user.score || 0) >= 80) badges.push('high_score');
  if (trades.size >= 2) badges.push('multi_skill');
  if (ratingsCount > 0 && ratingsAvg >= 4.5) badges.push('top_rated');
  return badges;
}

function getHistory(userId) {
  const rows = db.prepare(
    'SELECT * FROM history_events WHERE user_id = ? ORDER BY ts DESC'
  ).all(userId);
  return rows;
}

function getWorkerRatings(candidateId) {
  const rows = db.prepare(
    `SELECT worker_rating_stars AS stars, worker_rating_comment AS comment, completed_at AS ts
     FROM applications WHERE candidate_id = ? AND worker_rating_stars IS NOT NULL`
  ).all(candidateId);
  return rows;
}

function getMsmeRatings(msmeId) {
  const rows = db.prepare(
    `SELECT a.msme_rating_stars AS stars, a.msme_rating_comment AS comment, a.completed_at AS ts
     FROM applications a JOIN gigs g ON g.id = a.gig_id
     WHERE g.msme_id = ? AND a.msme_rating_stars IS NOT NULL`
  ).all(msmeId);
  return rows;
}

function avgRating(rows) {
  if (!rows.length) return 0;
  return rows.reduce((a, r) => a + r.stars, 0) / rows.length;
}

function notify(userId, type, title, body, link) {
  db.prepare(
    `INSERT INTO notifications (id,user_id,type,title,body,link,ts,read) VALUES (?,?,?,?,?,?,?,0)`
  ).run(uid('nt_'), userId, type, title, body || null, link || null, now());
}

function publicUser(u) {
  if (!u) return null;
  const { id, role, name, phone, lang, trade, business_name, score, referral_code, created_at } = u;
  return { id, role, name, phone, lang, trade, businessName: business_name, score, referralCode: referral_code, createdAt: created_at };
}

module.exports = {
  uid, passportId, now, computeBadges, getHistory, getWorkerRatings, getMsmeRatings, avgRating, notify, publicUser,
};
