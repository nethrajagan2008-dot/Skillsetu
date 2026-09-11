const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/assessments', require('./routes/assessments'));
app.use('/api/gigs', require('./routes/gigs'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/passport', require('./routes/passport'));
app.use('/api', require('./routes/misc')); // skill-graph, trades, messages, notifications, referrals, impact, admin

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// Serve the frontend (static SPA) in production/local-run mode
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`SkillSetu API + frontend running on http://localhost:${PORT}`));
