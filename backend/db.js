const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'skillsetu.db'));

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('youth','msme','admin')),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  trade TEXT,
  business_name TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS history_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('assessment','gig_complete')),
  trade TEXT,
  label TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  ref_id TEXT,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gigs (
  id TEXT PRIMARY KEY,
  msme_id TEXT NOT NULL,
  title TEXT NOT NULL,
  trade TEXT NOT NULL,
  description TEXT,
  pay INTEGER,
  duration TEXT,
  slots INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  gig_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','completed')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','escrowed','released')),
  worker_rating_stars INTEGER,
  worker_rating_comment TEXT,
  msme_rating_stars INTEGER,
  msme_rating_comment TEXT,
  applied_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE(gig_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  body TEXT NOT NULL,
  ts INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  ts INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hist_user ON history_events(user_id);
CREATE INDEX IF NOT EXISTS idx_apps_gig ON applications(gig_id);
CREATE INDEX IF NOT EXISTS idx_apps_cand ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_msg_app ON messages(application_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_gigs_msme ON gigs(msme_id);
`);

module.exports = db;
