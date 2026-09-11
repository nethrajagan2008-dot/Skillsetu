const db = require('./db');
const { uid, now } = require('./util');

function upsertUser({ id, role, name, phone, trade, businessName, score }) {
  const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (existing) return existing;
  const rc = 'REF-' + id.slice(-6).toUpperCase();
  db.prepare(`INSERT INTO users (id, role, name, phone, lang, trade, business_name, score, referral_code, active, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,1,?)`)
    .run(id, role, name, phone, 'en', trade || null, businessName || null, score || 0, rc, now());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

const admin = upsertUser({ id: 'u_admin000001', role: 'admin', name: 'Admin', phone: '+910000000000', score: 0 });
const worker = upsertUser({ id: 'u_demo_worker1', role: 'youth', name: 'Meena Kumari', phone: '+919999900001', trade: 'tailoring', score: 78 });
const msme = upsertUser({ id: 'u_demo_msme001', role: 'msme', name: 'Ramesh Traders', phone: '+919999900002', businessName: 'Ramesh Traders', score: 0 });

const existingGig = db.prepare('SELECT * FROM gigs WHERE msme_id = ?').get(msme.id);
if (!existingGig) {
  const gigId = uid('g_');
  db.prepare(`INSERT INTO gigs (id, msme_id, title, trade, description, pay, duration, slots, status, created_at)
              VALUES (?,?,?,?,?,?,?,?, 'open', ?)`)
    .run(gigId, msme.id, 'Stitch 20 school uniform sets', 'tailoring', 'Cut and stitch 20 uniform sets to sample.', 3500, '3 days', 2, now());
}

if (!db.prepare("SELECT 1 FROM history_events WHERE user_id = ? AND type='assessment'").get(worker.id)) {
  db.prepare(`INSERT INTO history_events (id,user_id,type,trade,label,points,ref_id,ts) VALUES (?,?,?,?,?,?,?,?)`)
    .run(uid('h_'), worker.id, 'assessment', 'tailoring', 'Skill assessment — tailoring (78/100)', 0, null, now());
}

console.log('Seed complete.');
console.log('Demo admin phone:  +910000000000');
console.log('Demo worker phone: +919999900001 (trade: tailoring, score 78)');
console.log('Demo business phone: +919999900002 (Ramesh Traders)');
console.log('Use POST /api/auth/send-otp then /api/auth/verify-otp with the returned demoOtp to log in as any of these.');
