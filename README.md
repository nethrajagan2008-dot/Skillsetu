# SkillSetu — full-stack skill verification & gig marketplace

SkillSetu turns a short skill assessment into a portable, verifiable **Skill Passport**
for India's informal skilled workforce (tailors, electricians, carpenters, and more),
and lets small businesses (MSMEs) post gigs, browse verified candidates, and hire with
confidence. This is a complete rewrite of the original single-file prototype into a
real full-stack app.

## Stack

- **Backend:** Node.js + Express + SQLite (using Node's built-in `node:sqlite` — no
  native build step, no external DB server to install).
- **Frontend:** Vanilla JS single-page app (no build step) served as static files by
  the same Express server, calling a REST API.
- **Languages:** 11 fully translated languages — English, Hindi, Tamil, Telugu,
  Bengali, Marathi, Gujarati, Urdu, Spanish, French, Arabic (Urdu & Arabic render
  right-to-left automatically). Adding another language is just dropping a new
  `frontend/i18n/<code>.json` file (copy `en.json` and translate) and registering it
  in `frontend/js/i18n.js`.

## Quick start

```bash
cd backend
npm install
npm run seed     # creates a demo admin, a demo worker, and a demo business + gig
npm start         # http://localhost:4000
```

Then open **http://localhost:4000** in your browser.

There's no real SMS gateway wired up (this is a demo), so **OTP login just hands you
the code back in the API response** — the UI shows it in a toast ("Demo OTP sent to
...") so you can log straight in. To log in as one of the seeded demo accounts, use:

| Role | Phone |
|---|---|
| Admin | `+910000000000` |
| Worker (Meena Kumari, tailoring, score 78) | `+919999900001` |
| Business (Ramesh Traders) | `+919999900002` |

## What's included

**Core (from the original prototype, rebuilt on real endpoints):**
- Phone/OTP onboarding for two roles: worker ("youth") and business ("MSME")
- Skill assessment against an NSQF-style rubric per trade, producing a blended skill score
- Skill Passport: score, badges, verified history, trust rating
- Skill graph: adjacent trades with overlap % and a bridge-course nudge
- Gig marketplace: browse/search/apply (worker side), post/manage (business side)
- Two-way ratings: businesses rate workers, workers rate businesses
- Public passport verification by Passport ID (no login needed)
- Marketplace impact dashboard (aggregate, public)

**New in this rebuild:**
- **Real backend & persistence** — SQLite database, not browser-only storage
- **Per-application chat** between worker and business, with unread badges
- **Notifications center** (new applicant, new message, rating received, payment
  escrowed, gig completed, referral bonus)
- **Referral program** — every user gets a referral code; referrer and referee both
  earn trust points
- **Payment/escrow tracking** — pending → escrowed → released, per application
- **Skill Passport PDF export** (via `pdfkit`) in addition to print/save
- **Admin panel** — platform overview, deactivate/reactivate users, delete gigs
- **Full multilingual coverage** across 11 languages instead of 4 partial ones,
  including two RTL languages (Urdu, Arabic)

## Project layout

```
skillsetu/
  backend/
    server.js          Express app + static frontend serving
    db.js               SQLite schema (auto-created on first run)
    config.js           Trades, rubric criteria, skill-graph adjacency
    util.js             Shared helpers (ids, badges, ratings, notifications)
    seed.js             Demo data seeding script
    middleware/auth.js   Bearer-token session auth
    routes/              auth, assessments, gigs, applications, candidates,
                         passport (+ PDF), misc (chat, notifications, referrals,
                         impact, admin, skill-graph)
  frontend/
    index.html
    css/styles.css       Shared design system (paper/stamp/passport visual language)
    js/i18n.js            Translation loader (fetches /i18n/<lang>.json)
    js/api.js             Fetch wrapper + auth token storage
    js/app.js             Hash-router SPA with all screens
    i18n/*.json           One file per language
```

## Notes on this being a demo

- OTP is simulated — no real SMS is sent, the code is returned directly by the API.
- The skill "assessment" simulates rubric scoring from slider inputs rather than
  running real video/audio analysis, matching the original prototype's approach.
- Session tokens are opaque random strings stored in SQLite (not JWTs) — fine for a
  local demo; swap in a real auth provider before any production use.
- To reset all data, stop the server and delete `backend/data/skillsetu.db`.
