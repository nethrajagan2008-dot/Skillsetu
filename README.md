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
  escrowed, gig completed, referral bonus, AI match invite)
- **Referral program** — every user gets a referral code; referrer and referee both
  earn trust points
- **Payment/escrow tracking** — pending → escrowed → released, per application
- **Skill Passport PDF export** (via `pdfkit`) in addition to print/save
- **Admin panel** — platform overview, deactivate/reactivate users, delete gigs
- **Full multilingual coverage** across 11 languages instead of 4 partial ones,
  including two RTL languages (Urdu, Arabic)

**AI matching & trust layer (this pass):**
- **Explainable AI Match Score** — every gig a worker sees, and every candidate a
  business sees, carries a 0–100 score blending trade fit (exact or skill-graph-
  adjacent), verified skill score, and track record, plus a human-readable list of
  *why* ("87% skill overlap with your trade", "rated 4.6/5 across 6 gigs"). This is
  the concrete answer to the "AI-driven skill matching" half of the problem
  statement — see `backend/util.js#computeMatch`.
- **AI Suggested Candidates** — businesses get a ranked shortlist of *every*
  verified worker who fits a gig, not just the ones who happened to apply, with a
  one-click "Invite to apply" (`GET/POST /api/candidates/for-gig/:gigId`,
  `/api/gigs/:id/invite/:candidateId`).
- **Trust Leaderboard** (`/api/leaderboard`, `#/leaderboard`) — a composite trust
  score (skill score + real client ratings + completed gigs) so topping the board
  takes more than gaming one assessment.
- **Personalized Upskilling Roadmap** (`/api/upskill/me`, shown on the Passport) —
  surfaces each worker's weakest rubric criterion from their last assessment and
  their highest-overlap bridge course, turning the existing skill graph into an
  actionable "do this next" recommendation.
- **Skill Passport QR code** — the passport screen now renders a scannable QR
  (generated client-side) pointing straight at the public verification page, so a
  business can verify a physical/printed passport in one scan.
- **Admin trust-anomaly flag** — flags accounts with a verified score but no
  assessment record behind it, a cheap but real signal for reviewing data
  integrity without a full ML pipeline.

**User feedback & polish (latest pass):**
- **In-app Feedback** (`/api/feedback`, `#/feedback`) — a star-rating +
  category + message form reachable from every role's nav, and even by
  logged-out visitors. Submissions notify all admins in real time.
- **Admin Feedback inbox** (`#/admin/feedback`) — filter by status/category,
  mark reviewed, curate which entries get **featured**, or delete spam. The
  admin overview shows a live "new feedback" count.
- **Landing-page testimonials** — the homepage now pulls real, admin-featured
  (or simply highly-rated) feedback into a social-proof section with an
  aggregate rating, instead of static marketing copy.
- **Saved / bookmarked gigs** (`/api/gigs/saved`, `#/saved-gigs`) — workers
  can star a gig from the Find Gigs feed and come back to it later, even
  after it's closed, without losing its AI match explanation.
- Average feedback rating is folded into the public Impact dashboard
  (`/api/impact`) alongside the existing marketplace metrics.

## Project layout

```
skillsetu/
  backend/
    server.js          Express app + static frontend serving
    db.js               SQLite schema (auto-created on first run)
    config.js           Trades, rubric criteria, skill-graph adjacency
    util.js             Shared helpers: ids, badges, ratings, notifications,
                         AI match scoring, trust score, upskilling roadmap
    seed.js             Demo data seeding script
    middleware/auth.js   Bearer-token session auth (+ optionalAuth for
                         public endpoints that personalize when logged in)
    routes/              auth, assessments, gigs (+ match scores + invites),
                         applications, candidates (+ AI ranked matches),
                         passport (+ PDF), misc (chat, notifications,
                         referrals, impact, admin, skill-graph, leaderboard,
                         upskilling roadmap)
  frontend/
    index.html
    css/styles.css       Shared design system (paper/stamp/passport visual language)
    js/i18n.js            Translation loader (fetches /i18n/<lang>.json)
    js/api.js             Fetch wrapper + auth token storage
    js/app.js             Hash-router SPA with all screens
    i18n/*.json           One file per language (new AI-feature strings are in
                         en.json; other languages fall back to English until
                         translated — i18n.js does this automatically)
```

## Pitching this for a hackathon

If you're presenting against a rubric like *innovation / functionality /
feasibility / impact*, the strongest demo path is:

1. Log in as the seeded worker, open **Find Gigs** — point out the explainable
   match % and reason chips (innovation: real scoring logic, not just a keyword
   filter). Star a gig to show **Saved Gigs**.
2. Open the **Passport** — show the QR code and the Upskilling Roadmap (impact:
   this is the "personalized upskilling" the problem statement asks for).
3. Log in as the seeded business, open a gig's **Applicants** page — scroll to
   **AI Suggested Candidates** and invite someone who hasn't applied yet
   (functionality: this is a feature most rival teams won't have — matching
   *before* the worker searches, not just after).
4. Open **Leaderboard** and the **Admin** panel's trust flag (feasibility: shows
   you've thought about gaming/fraud, not just the happy path).
5. Submit a quick **Feedback** entry (even logged out), then show the
   **Admin → Feedback** inbox and feature it — it now shows up on the landing
   page testimonials in real time (impact: you've closed the feedback loop,
   not just built a one-way product).
6. Everything above runs on a plain `npm install && npm run seed && npm start` —
   no external AI API keys, no paid services, nothing that breaks on a venue
   with bad wifi.

## Notes on this being a demo

- OTP is simulated — no real SMS is sent, the code is returned directly by the API.
- The skill "assessment" simulates rubric scoring from slider inputs rather than
  running real video/audio analysis, matching the original prototype's approach.
- Session tokens are opaque random strings stored in SQLite (not JWTs) — fine for a
  local demo; swap in a real auth provider before any production use.
- To reset all data, stop the server and delete `backend/data/skillsetu.db`.
