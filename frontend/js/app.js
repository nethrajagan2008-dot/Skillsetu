/* ==========================================================================
   SkillSetu frontend app.
   Vanilla JS SPA (hash router) talking to the Express/SQLite backend in /backend.
   ========================================================================== */

const TRADES = ['tailoring','electrical','carpentry','embroidery','packing','plumbing','masonry','welding'];
const RUBRIC = {
  tailoring: ['seam','density','fabric','safety'],
  electrical: ['insul','load','safety','finish'],
  carpentry: ['measure','joint','finish','safety'],
  embroidery: ['pattern','tension','finish','safety'],
  packing: ['accuracy','speed','labeling','safety'],
  plumbing: ['fitting','sealing','pressure','safety'],
  masonry: ['alignment','mortar','finish','safety'],
  welding: ['bead','penetration','alignment','safety'],
};

const app = document.getElementById('app');
let pollHandle = null;

function t(k){ return I18N.t(k); }

function toast(msg){
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function fmtMoney(n){ return '₹' + Number(n || 0).toLocaleString('en-IN'); }
function fmtDate(ts){ return new Date(ts).toLocaleDateString(); }

function navigate(hash){ location.hash = hash; }

/* ---------------------------- Layout / chrome ---------------------------- */

function renderChrome(){
  const user = Store.user;
  const header = document.getElementById('topbar');
  const langOptions = LANGS.map(l => {
    const d = I18N.dicts[l.code];
    const native = d ? d.meta.native : l.code;
    return `<option value="${l.code}" ${I18N.current === l.code ? 'selected' : ''}>${esc(native)}</option>`;
  }).join('');

  let navLinks = '';
  if (user) {
    if (user.role === 'youth') {
      navLinks = [
        ['#/dashboard', t('dashboard')],
        ['#/assessment', t('getVerified')],
        ['#/passport', t('myPassport')],
        ['#/find-gigs', t('findGigs')],
        ['#/skill-graph', t('skillGraph')],
        ['#/notifications', t('notifications')],
        ['#/referrals', t('referrals')],
      ];
    } else if (user.role === 'msme') {
      navLinks = [
        ['#/dashboard', t('dashboard')],
        ['#/post-gig', t('postGig')],
        ['#/my-gigs', t('myGigs')],
        ['#/candidates', t('candidates')],
        ['#/notifications', t('notifications')],
        ['#/referrals', t('referrals')],
      ];
    } else if (user.role === 'admin') {
      navLinks = [
        ['#/dashboard', t('dashboard')],
        ['#/admin', t('adminPanel')],
        ['#/admin/users', t('adminManageUsers')],
        ['#/impact', t('impact')],
      ];
    }
  } else {
    navLinks = [ ['#/', t('home')], ['#/impact', t('impact')], ['#/verify', t('verifyPassportLink')] ];
  }

  const current = location.hash || '#/';
  const tabs = navLinks.map(([href, label]) =>
    `<a href="${href}" class="${current === href ? 'active' : ''}">${esc(label)}</a>`
  ).join('');

  header.innerHTML = `
    <div class="container bar">
      <a href="${user ? '#/dashboard' : '#/'}" class="brand">
        <span class="stamp-mark">SS</span> ${esc(t('appName'))}
      </a>
      <div class="nav-actions">
        <select class="lang-select" id="lang-switch">${langOptions}</select>
        ${user ? `
          <button class="icon-btn" title="${esc(t('notifications'))}" data-action="go-notifications">
            🔔<span class="badge-dot" id="notif-dot" style="display:none">0</span>
          </button>
          <button class="btn btn-outline btn-sm" data-action="logout">${esc(t('logout'))}</button>
        ` : `<a class="btn btn-sm" href="#/onboard">${esc(t('ctaGetStarted'))}</a>`}
      </div>
    </div>
    <div class="container"><nav class="tabs">${tabs}</nav></div>
  `;

  document.getElementById('lang-switch').addEventListener('change', async (e) => {
    await I18N.setLanguage(e.target.value);
    if (Store.user) { try { await api('/auth/me', { method: 'PATCH' }); } catch {} }
    router();
  });

  if (user) refreshNotifDot();
}

async function refreshNotifDot(){
  try {
    const { count } = await api('/messages/unread-count');
    const { notifications } = await api('/notifications');
    const unread = notifications.filter(n => !n.read).length + count;
    const dot = document.getElementById('notif-dot');
    if (dot) {
      if (unread > 0) { dot.style.display = 'flex'; dot.textContent = unread > 9 ? '9+' : unread; }
      else dot.style.display = 'none';
    }
  } catch { /* not logged in or offline — ignore */ }
}

function render(html){
  app.innerHTML = html;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* -------------------------------- Router --------------------------------- */

const routes = [
  [/^#\/$/, viewLanding],
  [/^#\/onboard$/, viewOnboardRole],
  [/^#\/onboard\/(youth|msme)$/, viewOnboardForm],
  [/^#\/onboard\/otp$/, viewOnboardOtp],
  [/^#\/dashboard$/, viewDashboard],
  [/^#\/assessment$/, viewAssessment],
  [/^#\/passport$/, viewPassport],
  [/^#\/verify$/, viewVerify],
  [/^#\/verify\/(.+)$/, viewVerifyResult],
  [/^#\/find-gigs$/, viewFindGigs],
  [/^#\/my-applications$/, viewMyApplications],
  [/^#\/post-gig$/, viewPostGig],
  [/^#\/my-gigs$/, viewMyGigs],
  [/^#\/gig\/([^/]+)$/, viewGigApplicants],
  [/^#\/candidates$/, viewCandidates],
  [/^#\/chat\/([^/]+)$/, viewChat],
  [/^#\/notifications$/, viewNotifications],
  [/^#\/referrals$/, viewReferrals],
  [/^#\/skill-graph$/, viewSkillGraph],
  [/^#\/skill-graph\/([^/]+)$/, viewSkillGraph],
  [/^#\/impact$/, viewImpact],
  [/^#\/admin$/, viewAdmin],
  [/^#\/admin\/users$/, viewAdminUsers],
];

function renderRouteError(err){
  console.error(err);
  render(`
    <div class="container empty-state">
      <h2>${esc(t('errorGeneric'))}</h2>
      <p class="muted">${esc((err && err.message) || '')}</p>
      <div class="hero-actions" style="justify-content:center">
        <a class="btn" href="#/dashboard">${esc(t('dashboard'))}</a>
        <button class="btn btn-outline" onclick="router()">${esc(t('retry'))}</button>
      </div>
    </div>
  `);
}

function router(){
  clearInterval(pollHandle);
  const hash = location.hash || '#/';
  renderChrome();
  for (const [re, handler] of routes) {
    const m = hash.match(re);
    if (m) {
      // Wrap in Promise.resolve so a thrown/rejected handler never leaves the
      // page stuck on a "Loading…" placeholder — it always resolves to either
      // real content or a visible, recoverable error.
      try {
        Promise.resolve(handler(...m.slice(1))).catch(renderRouteError);
      } catch (err) { renderRouteError(err); }
      return;
    }
  }
  render(`<div class="container empty-state"><h2>404</h2><a href="#/">${esc(t('home'))}</a></div>`);
}

window.addEventListener('hashchange', router);

// Final safety net: catch any stray unhandled promise rejection (e.g. from
// fire-and-forget calls like refreshNotifDot or the live gig search) so it's
// surfaced in the console/toast instead of failing completely silently.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled error:', e.reason);
});

/* ------------------------------ Delegation -------------------------------- */

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'logout') { Store.clear(); navigate('#/'); }
  if (action === 'go-notifications') { navigate('#/notifications'); }
});

/* ------------------------------ Onboarding -------------------------------- */

function viewOnboardRole(){
  render(`
    <div class="container narrow">
      <h1 class="center">${esc(t('appName'))}</h1>
      <p class="center">${esc(t('tagline'))}</p>
      <div class="grid grid-2 mt-24">
        <div class="card center" style="cursor:pointer" onclick="location.hash='#/onboard/youth'">
          <h3>🧵 ${esc(t('iAmYouth'))}</h3>
        </div>
        <div class="card center" style="cursor:pointer" onclick="location.hash='#/onboard/msme'">
          <h3>🏭 ${esc(t('iAmMsme'))}</h3>
        </div>
      </div>
      <p class="center mt-24"><a href="#/">${esc(t('back'))}</a></p>
    </div>
  `);
}

function tradeOptions(selected){
  return TRADES.map(tr => `<option value="${tr}" ${tr === selected ? 'selected' : ''}>${esc(t('trade_' + tr))}</option>`).join('');
}

function viewOnboardForm(role){
  render(`
    <div class="container narrow">
      <h2>${esc(t(role === 'youth' ? 'iAmYouth' : 'iAmMsme'))}</h2>
      <form id="onboard-form" class="card">
        <label>${esc(t('yourName'))}</label>
        <input type="text" name="name" required />
        <label>${esc(t('phoneNumber'))}</label>
        <input type="tel" name="phone" placeholder="+91XXXXXXXXXX" required />
        ${role === 'youth' ? `
          <label>${esc(t('primaryTrade'))}</label>
          <select name="trade">${tradeOptions()}</select>
        ` : `
          <label>${esc(t('businessName'))}</label>
          <input type="text" name="businessName" />
        `}
        <label>${esc(t('referralCodeLabel'))}</label>
        <input type="text" name="referralCode" placeholder="REF-XXXXXX" />
        <button class="btn btn-block" type="submit">${esc(t('sendOtp'))}</button>
      </form>
      <p class="center mt-24"><a href="#/onboard">${esc(t('back'))}</a></p>
    </div>
  `);

  document.getElementById('onboard-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      role, name: fd.get('name'), phone: fd.get('phone'),
      trade: fd.get('trade') || null, businessName: fd.get('businessName') || null,
      referralCode: fd.get('referralCode') || null,
    };
    try {
      const { demoOtp } = await api('/auth/send-otp', { method: 'POST', body: { phone: payload.phone }, auth: false });
      sessionStorage.setItem('ss_pending_signup', JSON.stringify(payload));
      toast(`${t('otpSentTo')} ${payload.phone} (${demoOtp})`);
      navigate('#/onboard/otp');
    } catch (err) { toast(err.message); }
  });
}

function viewOnboardOtp(){
  const pending = JSON.parse(sessionStorage.getItem('ss_pending_signup') || 'null');
  if (!pending) { navigate('#/onboard'); return; }
  render(`
    <div class="container narrow">
      <h2>${esc(t('enterOtp'))}</h2>
      <p class="muted">${esc(t('otpSentTo'))} ${esc(pending.phone)}</p>
      <form id="otp-form" class="card">
        <input type="text" name="code" maxlength="4" inputmode="numeric" placeholder="1234" required style="text-align:center;font-size:1.6rem;letter-spacing:8px;" />
        <button class="btn btn-block" type="submit">${esc(t('verifyContinue'))}</button>
      </form>
      <p class="center mt-24"><a href="#" id="resend">${esc(t('resendOtp'))}</a></p>
    </div>
  `);

  document.getElementById('otp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code');
    try {
      const { token, user } = await api('/auth/verify-otp', {
        method: 'POST', auth: false,
        body: { ...pending, code, lang: I18N.current },
      });
      Store.token = token; Store.user = user;
      sessionStorage.removeItem('ss_pending_signup');
      toast(t('welcomeBack'));
      navigate('#/dashboard');
    } catch (err) { toast(err.message || t('otpIncorrect')); }
  });

  document.getElementById('resend').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const { demoOtp } = await api('/auth/send-otp', { method: 'POST', body: { phone: pending.phone }, auth: false });
      toast(`${t('otpSentTo')} ${pending.phone} (${demoOtp})`);
    } catch (err) { toast(err.message); }
  });
}

function requireAuth(roles){
  const user = Store.user;
  if (!user || !Store.token) { navigate('#/onboard'); return null; }
  if (roles && !roles.includes(user.role)) { navigate('#/dashboard'); return null; }
  return user;
}

/* -------------------------------- Landing --------------------------------- */

async function viewLanding(){
  render(`<div class="center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  let impact = null;
  try { impact = await api('/impact', { auth: false }); } catch {}

  render(`
    <section class="hero container">
      <span class="eyebrow">${esc(t('landingBadge'))}</span>
      <h1>${esc(t('landingHeadline'))}</h1>
      <p class="sub">${esc(t('landingSub'))}</p>
      <div class="hero-actions">
        <a class="btn" href="#/onboard">${esc(t('ctaGetStarted'))}</a>
        <a class="btn btn-outline" href="#/impact">${esc(t('ctaTryDemo'))}</a>
      </div>
      <div class="hero-actions mt-24">
        <a class="btn btn-outline btn-sm" href="#/onboard/youth" data-demo="youth">${esc(t('demoWorkerBtn'))}</a>
        <a class="btn btn-outline btn-sm" href="#/onboard/msme" data-demo="msme">${esc(t('demoMsmeBtn'))}</a>
      </div>
      <p class="muted" style="margin-top:8px">${esc(t('demoBadge'))}</p>
    </section>

    <div class="container divider"></div>

    <section class="section container">
      <div class="section-kicker">${esc(t('landingProblemKicker'))}</div>
      <h2>${esc(t('landingProblemHeadline'))}</h2>
      <div class="grid grid-3">
        <div class="card"><h3>${esc(t('landingProblem1T'))}</h3><p>${esc(t('landingProblem1D'))}</p></div>
        <div class="card"><h3>${esc(t('landingProblem2T'))}</h3><p>${esc(t('landingProblem2D'))}</p></div>
        <div class="card"><h3>${esc(t('landingProblem3T'))}</h3><p>${esc(t('landingProblem3D'))}</p></div>
      </div>
    </section>

    <section class="section container">
      <div class="section-kicker">${esc(t('landingHowKicker'))}</div>
      <h2>${esc(t('landingHeadline'))}</h2>
      <div class="grid grid-3">
        <div class="card"><div class="step-num">1</div><h3>${esc(t('landingStep1T'))}</h3><p>${esc(t('landingStep1D'))}</p></div>
        <div class="card"><div class="step-num">2</div><h3>${esc(t('landingStep2T'))}</h3><p>${esc(t('landingStep2D'))}</p></div>
        <div class="card"><div class="step-num">3</div><h3>${esc(t('landingStep3T'))}</h3><p>${esc(t('landingStep3D'))}</p></div>
      </div>
    </section>

    <section class="section container">
      <div class="section-kicker">${esc(t('landingWhyKicker'))}</div>
      <div class="grid grid-3">
        <div class="card"><h3>${esc(t('landingWhy1T'))}</h3><p>${esc(t('landingWhy1D'))}</p></div>
        <div class="card"><h3>${esc(t('landingWhy2T'))}</h3><p>${esc(t('landingWhy2D'))}</p></div>
        <div class="card"><h3>${esc(t('landingWhy3T'))}</h3><p>${esc(t('landingWhy3D'))}</p></div>
      </div>
    </section>

    ${impact ? `
    <section class="section container">
      <h2>${esc(t('impactTitle'))}</h2>
      <p class="muted">${esc(t('demoLive'))}</p>
      <div class="grid grid-3">
        <div class="card stat"><div class="num">${impact.verifiedWorkers}</div><div class="label">${esc(t('statVerifiedWorkers'))}</div></div>
        <div class="card stat"><div class="num">${impact.gigsCompleted}</div><div class="label">${esc(t('statGigsCompleted'))}</div></div>
        <div class="card stat"><div class="num">${fmtMoney(impact.wagesRouted)}</div><div class="label">${esc(t('statWagesRouted'))}</div></div>
      </div>
    </section>` : ''}

    <section class="section container center">
      <h2>${esc(t('landingCta'))}</h2>
      <div class="hero-actions">
        <a class="btn" href="#/onboard">${esc(t('ctaGetStarted'))}</a>
        <a class="btn btn-outline" href="#/verify">${esc(t('verifyPassportLink'))}</a>
      </div>
    </section>

    <footer><div class="container">${esc(t('footerTag'))}</div></footer>
  `);
}

/* ------------------------------- Dashboard --------------------------------- */

async function viewDashboard(){
  const user = requireAuth(); if (!user) return;
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);

  if (user.role === 'youth') return dashboardYouth(user);
  if (user.role === 'msme') return dashboardMsme(user);
  if (user.role === 'admin') return dashboardAdmin(user);
}

async function dashboardYouth(user){
  let passport, applications;
  try {
    const [passportRes, applicationsRes] = await Promise.all([
      api('/passport/me'), api('/applications/mine'),
    ]);
    passport = passportRes.passport;
    applications = applicationsRes.applications;
  } catch (err) { toast(err.message); }

  const recent = (applications || []).slice(0, 5);

  render(`
    <div class="container">
      <div class="flex-between">
        <h2>${esc(t('welcomeBack'))}, ${esc(user.name)}</h2>
      </div>
      <div class="grid grid-3 mt-24">
        <div class="card stat"><div class="num">${passport ? passport.score : 0}</div><div class="label">${esc(t('skillScoreLabel'))}</div></div>
        <div class="card stat"><div class="num">${passport ? passport.badges.length : 0}</div><div class="label">${esc(t('badgesTitle'))}</div></div>
        <div class="card stat"><div class="num">${(applications || []).filter(a=>a.status==='completed').length}</div><div class="label">${esc(t('statHires'))}</div></div>
      </div>

      <div class="grid grid-2 mt-24">
        <a class="btn btn-verified btn-block" href="#/assessment">${esc(t('startAssessment'))}</a>
        <a class="btn btn-outline btn-block" href="#/find-gigs">${esc(t('findGigs'))}</a>
      </div>

      <h3 class="mt-24">${esc(t('recentActivity'))}</h3>
      <div class="card">
        ${recent.length ? recent.map(a => `
          <div class="list-row">
            <div>
              <div class="list-title">${esc(a.gigTitle)}</div>
              <div class="list-sub">${esc(a.msmeName || '')} · ${statusPill(a)}</div>
            </div>
            <a class="btn btn-sm btn-outline" href="#/chat/${a.id}">${esc(t('messages'))}</a>
          </div>
        `).join('') : `<p class="muted">${esc(t('noActivity'))}</p>`}
      </div>
      <p class="center mt-24"><a href="#/my-applications">${esc(t('myGigs'))} →</a></p>
    </div>
  `);
}

function statusPill(a){
  const map = { applied: ['status-pending', t('paymentPending')], completed: ['status-open', t('paymentReleased')] };
  const [cls, label] = a.status === 'completed' ? ['status-open', t('completedToast')] : ['status-pending', t('applied')];
  return `<span class="status-pill ${cls}">${esc(label)}</span>`;
}

async function dashboardMsme(user){
  let gigs, apps;
  try {
    const [gigsRes, appsRes] = await Promise.all([ api('/gigs/mine'), api('/applications/mine-as-msme') ]);
    gigs = gigsRes.gigs;
    apps = appsRes.applications;
  } catch (err) { toast(err.message); }

  const openGigs = (gigs || []).filter(g => g.status === 'open').length;
  const applicants = (apps || []).length;
  const hires = (apps || []).filter(a => a.status === 'completed').length;
  const recent = (apps || []).slice(0, 5);

  render(`
    <div class="container">
      <h2>${esc(t('welcomeBack'))}, ${esc(user.businessName || user.name)}</h2>
      <div class="grid grid-3 mt-24">
        <div class="card stat"><div class="num">${openGigs}</div><div class="label">${esc(t('statOpenGigs'))}</div></div>
        <div class="card stat"><div class="num">${applicants}</div><div class="label">${esc(t('statApplicants'))}</div></div>
        <div class="card stat"><div class="num">${hires}</div><div class="label">${esc(t('statHires'))}</div></div>
      </div>
      <div class="grid grid-2 mt-24">
        <a class="btn btn-verified btn-block" href="#/post-gig">${esc(t('postGig'))}</a>
        <a class="btn btn-outline btn-block" href="#/candidates">${esc(t('candidates'))}</a>
      </div>
      <h3 class="mt-24">${esc(t('recentActivity'))}</h3>
      <div class="card">
        ${recent.length ? recent.map(a => `
          <div class="list-row">
            <div><div class="list-title">${esc(a.candidateName)}</div><div class="list-sub">${esc(a.gigTitle)}</div></div>
            <a class="btn btn-sm btn-outline" href="#/gig/${a.gigId}">${esc(t('applicants'))}</a>
          </div>
        `).join('') : `<p class="muted">${esc(t('noActivity'))}</p>`}
      </div>
    </div>
  `);
}

async function dashboardAdmin(user){
  let overview;
  try { overview = await api('/admin/overview'); } catch (err) { toast(err.message); }
  render(`
    <div class="container">
      <h2>${esc(t('adminOverviewTitle'))}</h2>
      <div class="grid grid-3 mt-24">
        <div class="card stat"><div class="num">${overview ? overview.users.length : 0}</div><div class="label">${esc(t('adminUsers'))}</div></div>
        <div class="card stat"><div class="num">${overview ? overview.gigs.length : 0}</div><div class="label">${esc(t('adminGigs'))}</div></div>
        <div class="card stat"><div class="num">${overview ? overview.applications.length : 0}</div><div class="label">${esc(t('applicants'))}</div></div>
      </div>
      <p class="center mt-24"><a class="btn" href="#/admin">${esc(t('adminPanel'))}</a></p>
    </div>
  `);
}

/* ------------------------------ Assessment --------------------------------- */

function viewAssessment(){
  const user = requireAuth(['youth']); if (!user) return;
  let trade = user.trade || TRADES[0];

  function criteriaHtml(tr){
    return RUBRIC[tr].map(c => `
      <label>${esc(t('rubric_' + c))} <span class="muted" id="val-${c}">70</span></label>
      <input type="range" min="0" max="100" value="70" data-criterion="${c}" oninput="document.getElementById('val-${c}').textContent=this.value" style="margin-bottom:16px" />
    `).join('');
  }

  render(`
    <div class="container narrow">
      <h2>${esc(t('startAssessment'))}</h2>
      <p class="muted">${esc(t('assessmentIntro'))}</p>
      <div class="card">
        <label>${esc(t('primaryTrade'))}</label>
        <select id="assess-trade">${tradeOptions(trade)}</select>
        <div class="card" style="background:var(--paper-dark);border:none;box-shadow:none">
          <p class="muted">${esc(t('recordVideo'))} — <em>${esc(t('videoSentLabel'))}</em></p>
        </div>
        <h3 class="mt-24">${esc(t('rubric_seam') ? '' : '')}</h3>
        <div id="rubric-fields">${criteriaHtml(trade)}</div>
        <button class="btn btn-block" id="submit-assessment">${esc(t('analyzeVideo'))}</button>
      </div>
      <div id="assess-result"></div>
    </div>
  `);

  document.getElementById('assess-trade').addEventListener('change', (e) => {
    trade = e.target.value;
    document.getElementById('rubric-fields').innerHTML = criteriaHtml(trade);
  });

  document.getElementById('submit-assessment').addEventListener('click', async () => {
    const btn = document.getElementById('submit-assessment');
    btn.disabled = true; btn.textContent = t('analyzing');
    const criteriaScores = {};
    document.querySelectorAll('[data-criterion]').forEach(inp => { criteriaScores[inp.dataset.criterion] = Number(inp.value); });
    try {
      const result = await api('/assessments', { method: 'POST', body: { trade, criteriaScores } });
      render(`
        <div class="container narrow center">
          <div class="passport-card">
            <div class="stamp-seal">${esc(t('stage_new').toUpperCase())}</div>
            <p class="muted">${esc(t('analysisDone'))}</p>
            <div class="passport-score">${result.score}<span style="font-size:1.4rem;color:var(--ink-soft)">/100</span></div>
            <p>${esc(t('trade_' + trade))}</p>
          </div>
          <div class="hero-actions mt-24">
            <a class="btn" href="#/passport">${esc(t('viewPassport'))}</a>
            <a class="btn btn-outline" href="#/skill-graph/${trade}">${esc(t('skillGraph'))}</a>
          </div>
        </div>
      `);
    } catch (err) {
      toast(err.message);
      btn.disabled = false; btn.textContent = t('analyzeVideo');
    }
  });
}

/* -------------------------------- Passport --------------------------------- */

const BADGE_KEYS = ['first_verified','gig_starter','gig_pro','high_score','multi_skill','top_rated'];

function badgeCard(key){
  return `
    <div class="badge-earned">
      <div class="medal">★</div>
      <div>
        <div class="list-title">${esc(t('badge_' + key))}</div>
        <div class="list-sub">${esc(t('badge_' + key + '_d'))}</div>
      </div>
    </div>
  `;
}

async function viewPassport(){
  const user = requireAuth(['youth']); if (!user) return;
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  let p;
  try { const res = await api('/passport/me'); p = res.passport; } catch (err) { toast(err.message); return; }

  render(`
    <div class="container narrow">
      <div class="passport-card">
        <div class="stamp-seal">SKILLSETU<br/>VERIFIED</div>
        <p class="muted">${esc(p.id)}</p>
        <h2>${esc(p.name)}</h2>
        <p>${esc(t('trade_' + p.trade))}</p>
        <div class="passport-score">${p.score}<span style="font-size:1.2rem;color:var(--ink-soft)">/100</span></div>
        <p class="muted">${esc(t('avgRatingLabel'))}: ${p.ratingsCount ? '★ ' + p.avgRating.toFixed(1) + ' (' + p.ratingsCount + ')' : esc(t('noRatingsYet'))}</p>
      </div>

      <div class="hero-actions mt-24">
        <a class="btn btn-outline" href="${apiDownloadUrl('/passport/me/pdf')}" target="_blank">${esc(t('downloadPdf'))}</a>
        <button class="btn btn-outline" onclick="window.print()">${esc(t('printPassport'))}</button>
      </div>

      <h3 class="mt-24">${esc(t('badgesTitle'))}</h3>
      <div class="grid grid-2">
        ${p.badges.length ? p.badges.map(badgeCard).join('') : `<p class="muted">${esc(t('noRatingsYet'))}</p>`}
      </div>

      <h3 class="mt-24">${esc(t('verifiedGigHistory'))}</h3>
      <div class="card">
        ${p.history.length ? p.history.map(h => `
          <div class="list-row">
            <div><div class="list-title">${esc(h.label)}</div><div class="list-sub">${fmtDate(h.ts)}</div></div>
          </div>
        `).join('') : `<p class="muted">${esc(t('noActivity'))}</p>`}
      </div>
    </div>
  `);
}

/* -------------------------------- Verify ------------------------------------ */

function viewVerify(){
  render(`
    <div class="container narrow">
      <h2>${esc(t('verifyTitle'))}</h2>
      <p class="muted">${esc(t('verifyDesc'))}</p>
      <form id="verify-form" class="card">
        <label>${esc(t('verifyInputLabel'))}</label>
        <input type="text" name="id" placeholder="${esc(t('verifyPlaceholder'))}" required />
        <button class="btn btn-block" type="submit">${esc(t('verifyBtn'))}</button>
      </form>
    </div>
  `);
  document.getElementById('verify-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = new FormData(e.target).get('id').trim();
    navigate('#/verify/' + encodeURIComponent(id));
  });
}

async function viewVerifyResult(id){
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  let p;
  try {
    const res = await api(`/passport/verify/${encodeURIComponent(id)}`, { auth: false });
    p = res.passport;
  } catch {
    render(`
      <div class="container narrow center">
        <p>${esc(t('verifyNotFound'))}</p>
        <a class="btn btn-outline" href="#/verify">${esc(t('verifyBackHome'))}</a>
      </div>
    `);
    return;
  }
  render(`
    <div class="container narrow">
      <div class="passport-card">
        <div class="stamp-seal" style="border-color:var(--verified);color:var(--verified)">✓ ${esc(t('verifyResultVerified')).slice(0,20)}</div>
        <p class="muted">${esc(p.id)}</p>
        <h2>${esc(p.name)}</h2>
        <p>${esc(t('trade_' + p.trade))}</p>
        <div class="passport-score">${p.score}<span style="font-size:1.2rem;color:var(--ink-soft)">/100</span></div>
        <p class="muted">${esc(t('avgRatingLabel'))}: ${p.ratingsCount ? '★ ' + p.avgRating.toFixed(1) + ' (' + p.ratingsCount + ')' : esc(t('noRatingsYet'))}</p>
      </div>
      <p class="center" style="color:var(--verified);font-weight:600">✓ ${esc(t('verifyResultVerified'))}</p>
      <div class="grid grid-2">
        ${p.badges.map(badgeCard).join('')}
      </div>
      <p class="center mt-24"><a class="btn" href="#/">${esc(t('verifyOpenApp'))}</a></p>
    </div>
  `);
}

/* -------------------------------- Find gigs ---------------------------------- */

async function viewFindGigs(){
  const user = requireAuth(['youth']); if (!user) return;
  let search = '', trade = '';

  async function load(){
    const qs = new URLSearchParams({ status: 'open' });
    if (search) qs.set('search', search);
    if (trade) qs.set('trade', trade);
    const { gigs } = await api(`/gigs?${qs}`, { auth: false });
    document.getElementById('gigs-list').innerHTML = gigs.length ? gigs.map(gigRow).join('') : `<div class="empty-state">${esc(t('noGigsYet'))}</div>`;
    attachApplyHandlers();
  }

  function gigRow(g){
    return `
      <div class="card">
        <div class="flex-between">
          <div>
            <div class="list-title">${esc(g.title)}</div>
            <div class="list-sub">${esc(g.msmeName || '')} · ${esc(t('trade_' + g.trade))} · ${fmtMoney(g.pay)} · ${esc(g.duration || '')}</div>
          </div>
          <button class="btn btn-sm" data-apply="${g.id}">${esc(t('applyBtn'))}</button>
        </div>
        ${g.description ? `<p class="mt-24">${esc(g.description)}</p>` : ''}
      </div>
    `;
  }

  function attachApplyHandlers(){
    document.querySelectorAll('[data-apply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api('/applications', { method: 'POST', body: { gigId: btn.dataset.apply } });
          btn.textContent = t('applied');
          toast(t('applied'));
        } catch (err) { toast(err.message); btn.disabled = false; }
      });
    });
  }

  render(`
    <div class="container">
      <h2>${esc(t('findGigs'))}</h2>
      <div class="card">
        <div class="grid grid-2">
          <input type="text" id="gig-search" placeholder="${esc(t('searchPlaceholder'))}" />
          <select id="gig-trade"><option value="">${esc(t('filterAllTrades'))}</option>${tradeOptions()}</select>
        </div>
      </div>
      <div id="gigs-list" class="mt-24"></div>
    </div>
  `);
  document.getElementById('gig-search').addEventListener('input', (e) => { search = e.target.value; load(); });
  document.getElementById('gig-trade').addEventListener('change', (e) => { trade = e.target.value; load(); });
  load();
}

async function viewMyApplications(){
  const user = requireAuth(['youth']); if (!user) return;
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  const { applications } = await api('/applications/mine');
  render(`
    <div class="container">
      <h2>${esc(t('myGigs'))}</h2>
      ${applications.length ? applications.map(a => `
        <div class="card">
          <div class="flex-between">
            <div>
              <div class="list-title">${esc(a.gigTitle)}</div>
              <div class="list-sub">${esc(a.msmeName || '')} · ${fmtMoney(a.gigPay)}</div>
            </div>
            <div>
              <span class="status-pill status-${a.paymentStatus}">${esc(t('payment' + a.paymentStatus.charAt(0).toUpperCase() + a.paymentStatus.slice(1)))}</span>
            </div>
          </div>
          <div class="hero-actions mt-24" style="justify-content:flex-start">
            <a class="btn btn-sm btn-outline" href="#/chat/${a.id}">${esc(t('chatTitle'))}</a>
            ${a.status === 'completed' && !a.msmeRating ? `<button class="btn btn-sm" data-rate-msme="${a.id}">${esc(t('rateMsme'))}</button>` : ''}
          </div>
        </div>
      `).join('') : `<div class="empty-state">${esc(t('noActivity'))}</div>`}
    </div>
  `);

  document.querySelectorAll('[data-rate-msme]').forEach(btn => {
    btn.addEventListener('click', () => openRatingModal(btn.dataset.rateMsme, 'msme'));
  });
}

function openRatingModal(applicationId, target){
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px';
  overlay.innerHTML = `
    <div class="card" style="max-width:360px;width:100%">
      <h3>${esc(t(target === 'msme' ? 'rateMsme' : 'rateWorker'))}</h3>
      <div class="star-input" id="star-input">${[1,2,3,4,5].map(n => `<span data-star="${n}">★</span>`).join('')}</div>
      <textarea id="rating-comment" placeholder="${esc(t('yourRatingLabel'))}"></textarea>
      <div class="hero-actions">
        <button class="btn btn-outline" id="rating-cancel">${esc(t('close'))}</button>
        <button class="btn" id="rating-submit">${esc(t('submitRating'))}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  let stars = 5;
  const starEls = overlay.querySelectorAll('[data-star]');
  function paint(){ starEls.forEach(s => s.classList.toggle('on', Number(s.dataset.star) <= stars)); }
  paint();
  starEls.forEach(s => s.addEventListener('click', () => { stars = Number(s.dataset.star); paint(); }));
  overlay.querySelector('#rating-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#rating-submit').addEventListener('click', async () => {
    const comment = overlay.querySelector('#rating-comment').value;
    try {
      const path = target === 'msme' ? `/applications/${applicationId}/rate-msme` : `/applications/${applicationId}/complete`;
      await api(path, { method: 'PATCH', body: { stars, comment } });
      toast(t('ratingThanks'));
      overlay.remove();
      router();
    } catch (err) { toast(err.message); }
  });
}

/* -------------------------------- Post gig / My gigs -------------------------- */

function viewPostGig(){
  const user = requireAuth(['msme']); if (!user) return;
  render(`
    <div class="container narrow">
      <h2>${esc(t('postAGigTitle'))}</h2>
      <form id="gig-form" class="card">
        <label>${esc(t('gigTitleLabel'))}</label>
        <input type="text" name="title" required />
        <label>${esc(t('gigTradeLabel'))}</label>
        <select name="trade">${tradeOptions()}</select>
        <label>${esc(t('gigDescLabel'))}</label>
        <textarea name="description"></textarea>
        <div class="grid grid-2">
          <div><label>${esc(t('gigPayLabel'))}</label><input type="number" name="pay" min="0" /></div>
          <div><label>${esc(t('gigDurationLabel'))}</label><input type="text" name="duration" placeholder="3 days" /></div>
        </div>
        <label>${esc(t('gigSlotsLabel'))}</label>
        <input type="number" name="slots" min="1" value="1" />
        <button class="btn btn-block" type="submit">${esc(t('postBtn'))}</button>
      </form>
    </div>
  `);
  document.getElementById('gig-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/gigs', { method: 'POST', body: Object.fromEntries(fd.entries()) });
      toast(t('gigPostedToast'));
      navigate('#/my-gigs');
    } catch (err) { toast(err.message); }
  });
}

async function viewMyGigs(){
  const user = requireAuth(['msme']); if (!user) return;
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  const { gigs } = await api('/gigs/mine');
  render(`
    <div class="container">
      <div class="flex-between"><h2>${esc(t('myGigs'))}</h2><a class="btn btn-sm" href="#/post-gig">${esc(t('postGig'))}</a></div>
      ${gigs.length ? gigs.map(g => `
        <div class="card">
          <div class="flex-between">
            <div>
              <div class="list-title">${esc(g.title)}</div>
              <div class="list-sub">${esc(t('trade_' + g.trade))} · ${fmtMoney(g.pay)} · <span class="status-pill status-${g.status}">${g.status}</span></div>
            </div>
            <a class="btn btn-sm btn-outline" href="#/gig/${g.id}">${esc(t('applicants'))}</a>
          </div>
        </div>
      `).join('') : `<div class="empty-state">${esc(t('myGigsEmpty'))}</div>`}
    </div>
  `);
}

async function viewGigApplicants(gigId){
  const user = requireAuth(['msme']); if (!user) return;
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  let gig, applications;
  try {
    [{ gig }, { applications }] = await Promise.all([
      api(`/gigs/${gigId}`, { auth: false }), api(`/applications/for-gig/${gigId}`),
    ]);
  } catch (err) { toast(err.message); navigate('#/my-gigs'); return; }

  render(`
    <div class="container">
      <h2>${esc(gig.title)}</h2>
      <p class="muted">${esc(t('trade_' + gig.trade))} · ${fmtMoney(gig.pay)} · ${esc(gig.duration || '')}</p>
      <div class="grid grid-2 mb-24" style="margin-bottom:20px">
        ${gig.status === 'open'
          ? `<button class="btn btn-outline" data-close-gig="${gig.id}">${esc(t('adminDeactivate'))}</button>`
          : `<span class="status-pill status-closed">${esc(gig.status)}</span>`}
      </div>
      <h3>${esc(t('applicants'))}</h3>
      ${applications.length ? applications.map(a => `
        <div class="card">
          <div class="flex-between">
            <div>
              <div class="list-title">${esc(a.candidateName)}</div>
              <div class="list-sub">${esc(t('skillScoreLabel'))}: ${a.candidateScore}</div>
            </div>
            <div class="hero-actions" style="justify-content:flex-end">
              <a class="btn btn-sm btn-outline" href="#/chat/${a.id}">${esc(t('chatTitle'))}</a>
              <span class="status-pill status-${a.paymentStatus}">${esc(t('payment' + a.paymentStatus.charAt(0).toUpperCase() + a.paymentStatus.slice(1)))}</span>
            </div>
          </div>
          ${a.status !== 'completed' ? `
            <div class="hero-actions mt-24" style="justify-content:flex-start">
              ${a.paymentStatus === 'pending' ? `<button class="btn btn-sm btn-outline" data-escrow="${a.id}">${esc(t('markEscrowed'))}</button>` : ''}
              <button class="btn btn-sm btn-verified" data-complete="${a.id}">${esc(t('verifyComplete'))}</button>
            </div>
          ` : `<p class="muted mt-24">${a.workerRating ? '★ '.repeat(a.workerRating.stars) : ''}</p>`}
        </div>
      `).join('') : `<div class="empty-state">${esc(t('noCandidates'))}</div>`}
    </div>
  `);

  document.querySelectorAll('[data-complete]').forEach(btn =>
    btn.addEventListener('click', () => openRatingModal(btn.dataset.complete, 'worker')));
  document.querySelectorAll('[data-escrow]').forEach(btn =>
    btn.addEventListener('click', async () => {
      try { await api(`/applications/${btn.dataset.escrow}/payment`, { method: 'PATCH', body: { status: 'escrowed' } }); toast(t('paymentEscrowed')); router(); }
      catch (err) { toast(err.message); }
    }));
  const closeBtn = document.querySelector('[data-close-gig]');
  if (closeBtn) closeBtn.addEventListener('click', async () => {
    try { await api(`/gigs/${gig.id}`, { method: 'PATCH', body: { status: 'closed' } }); toast(t('close')); router(); }
    catch (err) { toast(err.message); }
  });
}

/* -------------------------------- Candidates ---------------------------------- */

async function viewCandidates(){
  const user = requireAuth(['msme']); if (!user) return;
  let search = '', trade = '', minScore = 0;

  async function load(){
    const qs = new URLSearchParams({ minScore: String(minScore) });
    if (search) qs.set('search', search);
    if (trade) qs.set('trade', trade);
    const { candidates } = await api(`/candidates?${qs}`);
    document.getElementById('cand-list').innerHTML = candidates.length ? candidates.map(c => `
      <div class="card">
        <div class="flex-between">
          <div>
            <div class="list-title">${esc(c.name)}</div>
            <div class="list-sub">${esc(t('trade_' + c.trade))} · ${esc(t('skillScoreLabel'))}: ${c.score} ${c.ratingsCount ? '· ★' + c.avgRating.toFixed(1) : ''}</div>
          </div>
          <a class="btn btn-sm btn-outline" href="#/verify/${c.id}">${esc(t('viewPassport'))}</a>
        </div>
        ${c.badges.length ? `<div class="hero-actions mt-24" style="justify-content:flex-start">${c.badges.map(b => `<span class="chip on">${esc(t('badge_' + b))}</span>`).join('')}</div>` : ''}
      </div>
    `).join('') : `<div class="empty-state">${esc(t('noCandidates'))}</div>`;
  }

  render(`
    <div class="container">
      <h2>${esc(t('candidates'))}</h2>
      <div class="card">
        <div class="grid grid-3">
          <input type="text" id="c-search" placeholder="${esc(t('searchPlaceholder'))}" />
          <select id="c-trade"><option value="">${esc(t('filterAllTrades'))}</option>${tradeOptions()}</select>
          <div>
            <label>${esc(t('minScoreLabel'))}: <span id="c-min-label">0</span></label>
            <input type="range" id="c-min" min="0" max="100" value="0" />
          </div>
        </div>
      </div>
      <div id="cand-list" class="mt-24"></div>
    </div>
  `);
  document.getElementById('c-search').addEventListener('input', (e) => { search = e.target.value; load(); });
  document.getElementById('c-trade').addEventListener('change', (e) => { trade = e.target.value; load(); });
  document.getElementById('c-min').addEventListener('input', (e) => { minScore = e.target.value; document.getElementById('c-min-label').textContent = minScore; load(); });
  load();
}

/* ---------------------------------- Chat --------------------------------------- */

async function viewChat(applicationId){
  const user = requireAuth(); if (!user) return;
  render(`
    <div class="container narrow">
      <h2>${esc(t('chatTitle'))}</h2>
      <div class="chat-window" id="chat-window"></div>
      <div class="chat-input-row">
        <input type="text" id="chat-input" placeholder="${esc(t('chatPlaceholder'))}" />
        <button class="btn" id="chat-send">${esc(t('chatSend'))}</button>
      </div>
    </div>
  `);

  async function load(){
    try {
      const { messages } = await api(`/messages/thread/${applicationId}`);
      const win = document.getElementById('chat-window');
      if (!win) return;
      win.innerHTML = messages.length ? messages.map(m => `
        <div class="msg ${m.senderId === user.id ? 'mine' : 'theirs'}">${esc(m.body)}</div>
      `).join('') : `<p class="muted center">${esc(t('chatEmpty'))}</p>`;
      win.scrollTop = win.scrollHeight;
    } catch (err) { toast(err.message); }
  }

  async function send(){
    const input = document.getElementById('chat-input');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try { await api(`/messages/thread/${applicationId}`, { method: 'POST', body: { body } }); load(); }
    catch (err) { toast(err.message); }
  }

  document.getElementById('chat-send').addEventListener('click', send);
  document.getElementById('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  load();
  pollHandle = setInterval(load, 4000);
}

/* ------------------------------ Notifications ----------------------------------- */

async function viewNotifications(){
  const user = requireAuth(); if (!user) return;
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  const { notifications } = await api('/notifications');
  render(`
    <div class="container narrow">
      <div class="flex-between">
        <h2>${esc(t('notifications'))}</h2>
        ${notifications.length ? `<button class="btn btn-sm btn-outline" id="mark-all">${esc(t('notifMarkAllRead'))}</button>` : ''}
      </div>
      ${notifications.length ? notifications.map(n => `
        <div class="card" style="${n.read ? '' : 'border-color:var(--indigo)'}">
          <div class="list-title">${esc(n.title)}</div>
          ${n.body ? `<div class="list-sub">${esc(n.body)}</div>` : ''}
          <div class="muted" style="font-size:.78rem;margin-top:6px">${fmtDate(n.ts)}</div>
        </div>
      `).join('') : `<div class="empty-state">${esc(t('notifEmpty'))}</div>`}
    </div>
  `);
  const markAll = document.getElementById('mark-all');
  if (markAll) markAll.addEventListener('click', async () => {
    await api('/notifications/read-all', { method: 'POST' });
    router();
  });
}

/* -------------------------------- Referrals -------------------------------------- */

async function viewReferrals(){
  const user = requireAuth(); if (!user) return;
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  const data = await api('/referrals/mine');
  render(`
    <div class="container narrow">
      <h2>${esc(t('referralsTitle'))}</h2>
      <p class="muted">${esc(t('referralsDesc'))}</p>
      <div class="card center">
        <div class="muted">${esc(t('yourReferralCode'))}</div>
        <div style="font-family:var(--font-mono);font-size:1.6rem;font-weight:700;margin:10px 0">${esc(data.referralCode)}</div>
        <button class="btn btn-outline btn-sm" id="copy-code">${esc(t('copyCode'))}</button>
      </div>
      <div class="grid grid-2 mt-24">
        <div class="card stat"><div class="num">${data.referred.length}</div><div class="label">${esc(t('referredCount'))}</div></div>
        <div class="card stat"><div class="num">${data.bonusPointsEarned}</div><div class="label">${esc(t('bonusEarned'))}</div></div>
      </div>
    </div>
  `);
  document.getElementById('copy-code').addEventListener('click', () => {
    navigator.clipboard?.writeText(data.referralCode);
    toast(t('codeCopied'));
  });
}

/* -------------------------------- Skill graph ------------------------------------- */

async function viewSkillGraph(tradeParam){
  const user = requireAuth(['youth']); if (!user) return;
  const trade = tradeParam || user.trade || TRADES[0];
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  const { neighbours } = await api(`/skill-graph/${trade}`, { auth: false });
  render(`
    <div class="container narrow">
      <h2>${esc(t('skillGraph'))}</h2>
      <div class="card center">
        <div class="list-title" style="font-size:1.2rem">${esc(t('trade_' + trade))}</div>
      </div>
      <h3 class="mt-24">${esc(t('adjacentSkillNudge'))}</h3>
      ${neighbours.map(n => `
        <div class="card">
          <div class="flex-between">
            <div>
              <div class="list-title">${esc(t('trade_' + n.trade))}</div>
              <div class="list-sub">${n.overlap}% ${esc(t('overlapLabel'))} · ${n.bridgeWeeks} ${esc(t('bridgeWeeksLabel'))}</div>
            </div>
            <button class="btn btn-sm btn-outline" data-bridge="${n.trade}">${esc(t('startBridgeCourse'))}</button>
          </div>
        </div>
      `).join('')}
    </div>
  `);
  document.querySelectorAll('[data-bridge]').forEach(btn =>
    btn.addEventListener('click', () => { toast(t('startBridgeCourse') + ': ' + t('trade_' + btn.dataset.bridge)); }));
}

/* ---------------------------------- Impact ----------------------------------------- */

async function viewImpact(){
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  let impact;
  try { impact = await api('/impact', { auth: false }); } catch (err) { toast(err.message); return; }

  const maxCount = Math.max(1, ...impact.byTrade.map(r => r.c));
  render(`
    <div class="container">
      <h2>${esc(t('impactTitle'))}</h2>
      <p class="muted">${esc(t('impactSub'))}</p>
      <div class="grid grid-3 mt-24">
        <div class="card stat"><div class="num">${impact.verifiedWorkers}</div><div class="label">${esc(t('statVerifiedWorkers'))}</div></div>
        <div class="card stat"><div class="num">${impact.gigsCompleted}</div><div class="label">${esc(t('statGigsCompleted'))}</div></div>
        <div class="card stat"><div class="num">${fmtMoney(impact.wagesRouted)}</div><div class="label">${esc(t('statWagesRouted'))}</div></div>
        <div class="card stat"><div class="num">${impact.avgScore}</div><div class="label">${esc(t('statAvgScore'))}</div></div>
        <div class="card stat"><div class="num">${impact.activeGigs}</div><div class="label">${esc(t('statActiveGigs'))}</div></div>
        <div class="card stat"><div class="num">${impact.avgRating || '–'}</div><div class="label">${esc(t('statAvgRating'))}</div></div>
      </div>
      <h3 class="mt-24">${esc(t('impactByTradeTitle'))}</h3>
      <div class="card">
        ${impact.byTrade.length ? impact.byTrade.map(r => `
          <div class="bar-row">
            <div class="bar-label">${esc(t('trade_' + r.trade))}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(r.c / maxCount) * 100}%"></div></div>
            <div class="bar-val">${r.c}</div>
          </div>
        `).join('') : `<p class="muted">${esc(t('impactEmpty'))}</p>`}
      </div>
    </div>
  `);
}

/* ---------------------------------- Admin ------------------------------------------- */

async function viewAdmin(){
  const user = requireAuth(['admin']); if (!user) return;
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);
  const overview = await api('/admin/overview');

  render(`
    <div class="container">
      <h2>${esc(t('adminOverviewTitle'))}</h2>
      <div class="flex-between mt-24">
        <h3>${esc(t('adminUsers'))}</h3>
        <a class="btn btn-sm btn-outline" href="#/admin/users">${esc(t('adminManageUsers'))} →</a>
      </div>
      <div class="card">
        ${overview.users.slice(0, 8).map(u => `
          <div class="list-row">
            <div><div class="list-title">${esc(u.name)} <span class="muted">(${esc(t('roleLabel_' + u.role))})</span></div><div class="list-sub">${esc(u.phone)} · ${esc(t('skillScoreLabel'))}: ${u.score}</div></div>
            <button class="btn btn-sm ${u.active ? 'btn-danger' : 'btn-outline'}" data-toggle-user="${u.id}" data-active="${u.active}">
              ${esc(t(u.active ? 'adminDeactivate' : 'adminActivate'))}
            </button>
          </div>
        `).join('')}
        ${overview.users.length > 8 ? `<p class="center mt-24"><a href="#/admin/users">${esc(t('adminManageUsers'))} (${overview.users.length}) →</a></p>` : ''}
      </div>
      <h3 class="mt-24">${esc(t('adminGigs'))}</h3>
      <div class="card">
        ${overview.gigs.map(g => `
          <div class="list-row">
            <div><div class="list-title">${esc(g.title)}</div><div class="list-sub">${esc(t('trade_' + g.trade))} · ${fmtMoney(g.pay)} · ${esc(g.status)}</div></div>
            <button class="btn btn-sm btn-danger" data-delete-gig="${g.id}">${esc(t('adminDelete'))}</button>
          </div>
        `).join('')}
      </div>
    </div>
  `);

  document.querySelectorAll('[data-toggle-user]').forEach(btn => btn.addEventListener('click', async () => {
    const active = btn.dataset.active === '1' || btn.dataset.active === 'true';
    try { await api(`/admin/users/${btn.dataset.toggleUser}`, { method: 'PATCH', body: { active: !active } }); router(); }
    catch (err) { toast(err.message); }
  }));
  document.querySelectorAll('[data-delete-gig]').forEach(btn => btn.addEventListener('click', async () => {
    try { await api(`/admin/gigs/${btn.dataset.deleteGig}`, { method: 'DELETE' }); router(); }
    catch (err) { toast(err.message); }
  }));
}

async function viewAdminUsers(){
  const user = requireAuth(['admin']); if (!user) return;
  render(`<div class="container center" style="padding:60px 0"><p class="muted">${esc(t('loading'))}</p></div>`);

  let search = '', role = '';
  let debounceHandle = null;

  async function load(){
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (role) qs.set('role', role);
    const { users } = await api(`/admin/users?${qs}`);
    const list = document.getElementById('admin-users-list');
    if (!list) return; // page navigated away before this resolved
    list.innerHTML = users.length ? users.map(userRow).join('') : `<div class="empty-state">${esc(t('adminNoUsersFound'))}</div>`;
    attachRowHandlers();
  }

  function userRow(u){
    const subtitle = u.role === 'youth'
      ? (u.trade ? esc(t('trade_' + u.trade)) : '')
      : (u.role === 'msme' ? esc(u.businessName || '') : '');
    return `
      <div class="list-row">
        <div>
          <div class="list-title">${esc(u.name)} <span class="muted">(${esc(t('roleLabel_' + u.role))})</span>${u.active ? '' : ` · <span class="status-pill status-pending">${esc(t('adminDeactivate'))}d</span>`}</div>
          <div class="list-sub">
            ${esc(u.phone)}${subtitle ? ' · ' + subtitle : ''}
            ${u.role === 'youth' ? ` · ${esc(t('skillScoreLabel'))}: ${u.score}` : ''}
            ${u.referralCode ? ` · ${esc(u.referralCode)}` : ''}
            · ${esc(t('adminJoined'))} ${fmtDate(u.createdAt)}
          </div>
        </div>
        <div class="hero-actions" style="gap:8px">
          <button class="btn btn-sm ${u.active ? 'btn-danger' : 'btn-outline'}" data-toggle-user="${u.id}" data-active="${u.active}">
            ${esc(t(u.active ? 'adminDeactivate' : 'adminActivate'))}
          </button>
          <button class="btn btn-sm btn-danger" data-delete-user="${u.id}">${esc(t('adminDelete'))}</button>
        </div>
      </div>
    `;
  }

  function attachRowHandlers(){
    document.querySelectorAll('[data-toggle-user]').forEach(btn => btn.addEventListener('click', async () => {
      const active = btn.dataset.active === '1' || btn.dataset.active === 'true';
      try { await api(`/admin/users/${btn.dataset.toggleUser}`, { method: 'PATCH', body: { active: !active } }); load(); }
      catch (err) { toast(err.message); }
    }));
    document.querySelectorAll('[data-delete-user]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm(t('adminConfirmDeleteUser'))) return;
      try { await api(`/admin/users/${btn.dataset.deleteUser}`, { method: 'DELETE' }); toast(t('adminDelete')); load(); }
      catch (err) { toast(err.message); }
    }));
  }

  render(`
    <div class="container">
      <div class="flex-between">
        <h2>${esc(t('adminManageUsers'))}</h2>
        <a class="btn btn-sm btn-outline" href="#/admin">← ${esc(t('adminBackToOverview'))}</a>
      </div>
      <div class="card">
        <div class="grid grid-2">
          <input type="text" id="admin-user-search" placeholder="${esc(t('adminSearchUsers'))}" />
          <select id="admin-user-role">
            <option value="">${esc(t('filterAllRoles'))}</option>
            <option value="youth">${esc(t('roleLabel_youth'))}</option>
            <option value="msme">${esc(t('roleLabel_msme'))}</option>
            <option value="admin">${esc(t('roleLabel_admin'))}</option>
          </select>
        </div>
      </div>
      <div id="admin-users-list" class="mt-24"></div>
    </div>
  `);

  document.getElementById('admin-user-search').addEventListener('input', (e) => {
    search = e.target.value;
    clearTimeout(debounceHandle);
    debounceHandle = setTimeout(load, 250);
  });
  document.getElementById('admin-user-role').addEventListener('change', (e) => { role = e.target.value; load(); });

  await load();
}

/* ------------------------------------ Boot ------------------------------------------- */

async function boot(){
  const initial = I18N.detectInitial();
  if (initial) {
    await I18N.setLanguage(initial);
    router();
  } else {
    await I18N.load('en'); I18N.current = 'en';
    renderLanguagePicker();
  }
}

function renderLanguagePicker(){
  document.getElementById('topbar').innerHTML = '';
  const opts = LANGS.map(l => `<option value="${l.code}">${l.code}</option>`);
  render(`
    <div class="container narrow center" style="padding-top:60px">
      <h1>SkillSetu</h1>
      <p>${esc(t('chooseLanguage'))}</p>
      <div class="lang-grid" id="lang-grid"></div>
    </div>
  `);
  const grid = document.getElementById('lang-grid');
  (async () => {
    for (const l of LANGS) {
      const d = await I18N.load(l.code);
      const div = document.createElement('div');
      div.className = 'lang-opt';
      div.innerHTML = `<div class="native">${esc(d.meta.native)}</div><div class="code">${esc(l.code)}</div>`;
      div.addEventListener('click', async () => {
        await I18N.setLanguage(l.code);
        location.hash = '#/';
        router();
      });
      grid.appendChild(div);
    }
  })();
}

boot();
