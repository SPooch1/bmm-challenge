// Drives the harness in headless Chromium. Usage: node tests/harness/run.js [scenario...]
// Needs the server from build.sh on :8765. Playwright comes from the gstack skill's
// node_modules (no install in this repo); screenshots land in tests/harness/shots/.
const { chromium } = require(process.env.HOME + '/.claude/skills/gstack/node_modules/playwright');
const BASE = 'http://localhost:8765';
const SHOTS = __dirname + '/shots';
require('fs').mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  :: ' + JSON.stringify(detail) : ''));
}

async function open(browser, url, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // A blocked network (fonts, video host) is not an app error: skip resource-load failures
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE + url);
  return { ctx, page, errors };
}
const store = (page, p) => page.evaluate(path => window.__fake.read(path), p);
const denied = page => page.evaluate(() => window.__fake.log.filter(x => x.denied));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const scenarios = {
  async legacy(browser) {
    const { ctx, page, errors } = await open(browser, '/?seed=legacy&rules=transitional');
    await page.waitForSelector('#app', { state: 'visible' });
    await sleep(1200);
    // savings fall back to the user-doc array
    check('legacy: savings total from pre-split data', (await page.textContent('#savings-amount')).trim() === '$100.00', await page.textContent('#savings-amount'));
    // progress history shows stress from legacy shells
    await page.click('.nav-item[data-view="progress"]');
    await sleep(500);
    const hist = await page.textContent('#log-history');
    check('legacy: progress history shows legacy stress', hist.includes('Stress: 8') && hist.includes('Stress: 4'), hist.slice(0, 120));
    // reconcile-on-load built the aggregates from legacy data
    const a0 = await store(page, 'companies/acme/aggregates/d0'), a4 = await store(page, 'companies/acme/aggregates/d4');
    check('legacy: reconcile built day aggregates', a0 && a0.sum_d0 === 8 && a4 && a4.n_d4 === 1, [a0, a4]);
    const pre = await store(page, 'companies/acme/aggregates/pre');
    check('legacy: reconcile built pre aggregates', pre && pre.sum_stress === 7 && pre.n_p_jobskills === 1, pre && pre.sum_stress);
    const sav = await store(page, 'companies/acme/aggregates/savings');
    check('legacy: savings aggregate in cents', sav && sav.sum_cents === 10000, sav);
    // a check-in under transitional rules: dual write
    await page.click('.nav-item[data-view="today"]');
    await page.evaluate(() => { document.getElementById('checkin-details').style.display = 'block'; });
    await page.fill('#checkin-stress', '3');
    await page.fill('#checkin-notes', 'harness note');
    await page.click('#checkin-submit');
    await sleep(800);
    const shell = await store(page, 'users/amy/dailyLogs/5');
    const priv = await store(page, 'users/amy/dailyLogs/5/private/data');
    check('legacy: check-in wrote private subdoc', priv && priv.stress === 3 && priv.notes === 'harness note', priv);
    check('legacy: dual write kept legacy copy on shell', shell && shell.stress === 3 && shell.completed !== undefined, shell);
    const d1b = await store(page, 'companies/acme/aggregates/d5');
    check('legacy: check-in counted into d5', d1b && d1b.sum_d5 === 3 && d1b.n_d5 === 1, d1b && [d1b.sum_d5, d1b.n_d5]);
    check('legacy: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async company(browser) {
    const { ctx, page, errors } = await open(browser, '/?seed=company&rules=final');
    await page.waitForSelector('#app', { state: 'visible' });
    await sleep(1200);
    check('company/final: savings from private doc', (await page.textContent('#savings-amount')).trim() === '$75.00');
    await page.evaluate(() => { document.getElementById('checkin-details').style.display = 'block'; });
    await page.fill('#checkin-stress', '6');
    await page.fill('#checkin-notes', 'private words');
    await page.click('#checkin-submit');
    await sleep(800);
    const saved = await page.textContent('#checkin-saved');
    check('company/final: check-in saved (dual refused, lean retry)', saved.includes('Saved'), saved);
    const shell = await store(page, 'users/amy/dailyLogs/5');
    check('company/final: shell has engagement only', shell && shell.stress === undefined && shell.notes === undefined && 'completed' in shell, shell);
    const d1 = await store(page, 'companies/acme/aggregates/d5');
    check('company/final: aggregate counted day 5', d1 && d1.sum_d5 === 6, d1);
    // edit the same day: delta only
    await page.fill('#checkin-stress', '2');
    await page.click('#checkin-submit');
    await sleep(800);
    const d1b = await store(page, 'companies/acme/aggregates/d5');
    check('company/final: edit moves aggregate by the delta', d1b.sum_d5 === 2 && d1b.n_d5 === 1, [d1b.sum_d5, d1b.n_d5]);
    // savings deposit
    await page.click('.nav-item[data-view="savings"]');
    await page.fill('#savings-input', '25');
    await page.click('#savings-add');
    await sleep(600);
    const sp = await store(page, 'users/amy/private/savings');
    const su = await store(page, 'users/amy');
    check('company/final: savings saved privately, not on user doc', sp.entries.length === 2 && su.savingsEntries === undefined, [sp.entries.length, su.savingsEntries]);
    const sa = await store(page, 'companies/acme/aggregates/savings');
    check('company/final: savings aggregate = 100.00', sa && sa.sum_cents === 10000, sa);
    // reload: values come back from the private paths
    await page.reload();
    await page.waitForSelector('#app', { state: 'visible' });
    await sleep(1000);
    check('company/final: reload shows private stress', (await page.inputValue('#checkin-stress')) === '2');
    check('company/final: reload shows private notes', (await page.inputValue('#checkin-notes')) === 'private words');
    const den = (await denied(page)).filter(x => !(x.path.includes('/dailyLogs/5') && x.denied !== 'get') && !(x.path === 'users/amy' && x.denied === 'update'));
    check('company/final: no unexpected rule denials', den.length === 0, den);
    check('company/final: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async day21(browser) {
    const { ctx, page, errors } = await open(browser, '/?seed=day21&rules=final');
    await page.waitForSelector('#survey-form', { state: 'visible' });
    check('day21: post survey shown', await page.isVisible('#survey-form'));
    await page.fill('#survey-stress', '3');
    await page.click('#survey-form button[type=submit]');
    await sleep(800);
    const txt = await page.textContent('#survey-container');
    check('day21: payoff comparison rendered from private pre-survey', txt.includes('Your Progress') && /7\s*→\s*3/.test(txt.replace(/\s+/g, ' ')), txt.replace(/\s+/g, ' ').slice(0, 160));
    const post = await store(page, 'users/dee/assessments/post');
    const postP = await store(page, 'users/dee/assessments/post/private/data');
    check('day21: post responses private, shell completedAt only', postP.responses.stress === 3 && Object.keys(post).join() === 'completedAt', post);
    check('day21: individual -> no aggregates written', (await store(page, 'users/dee/aggLedger/post')) === null);
    await page.screenshot({ path: SHOTS + '/day21-payoff.png', fullPage: true });
    check('day21: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async margin30(browser) {
    const { ctx, page, errors } = await open(browser, '/?seed=margin30&rules=final');
    await page.waitForSelector('#margin-home', { state: 'visible' });
    await sleep(800);
    const home = await page.textContent('#margin-home');
    check('margin30: Day 22+ home renders', home.length > 200, home.slice(0, 80));
    const restart = await page.textContent('#restart-card');
    check('margin30: re-run card shown for individual', restart.includes('Run the 21 days again'));
    await page.click('.nav-item[data-view="savings"]');
    check('margin30: Peace of Mind total from private savings', (await page.textContent('#savings-amount')).trim() === '$550.00');
    await page.screenshot({ path: SHOTS + '/margin30-savings.png', fullPage: true });
    await page.click('.nav-item[data-view="today"]');
    // Reset plan quote from Day 19 notes (private subdoc)
    await page.evaluate(() => { const b = document.getElementById('margin-reset-body'); if (b) b.style.display = 'block'; });
    const quote = await page.textContent('#margin-home');
    check('margin30: reset plan quote reads Day 19 private notes', quote.includes('My reset plan: walk, $5, breathe.'));
    await page.screenshot({ path: SHOTS + '/margin30-home.png', fullPage: true });
    // restart
    await page.click('.nav-item[data-view="profile"]');
    await page.click('#restart-btn');
    await page.click('#restart-yes');
    await page.waitForLoadState('load');
    await sleep(1500);
    const st = await page.evaluate(() => window.__fake.dump());
    const leftover = Object.keys(st).filter(k => k.startsWith('users/max/dailyLogs') || k.startsWith('users/max/assessments/post'));
    check('margin30: restart deleted shells AND private subdocs', leftover.length === 0, leftover);
    const m = st['users/max/private/margin'];
    const run = m && m.pastRuns && m.pastRuns[0];
    check('margin30: restart archived post responses', run && run.postResponses && run.postResponses.stress === 4, run);
    check('margin30: pre survey kept', !!st['users/max/assessments/pre/private/data']);
    check('margin30: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async margin95(browser) {
    const { ctx, page, errors } = await open(browser, '/?seed=margin95&rules=final');
    await page.waitForSelector('#margin-home', { state: 'visible' });
    await sleep(800);
    const btn = await page.$('.milestone-card button, .milestone-card .btn');
    check('margin95: milestone card present', !!btn);
    if (btn) {
      await btn.click();
      await page.waitForSelector('#survey-form', { state: 'visible' });
      await page.click('#survey-form button[type=submit]');
      await sleep(800);
      const txt = await page.textContent('#survey-container');
      check('margin95: milestone comparison rendered', txt.includes('Baseline'), txt.slice(0, 80));
      const agg = await store(page, 'companies/acme/aggregates/m3');
      check('margin95: m3 aggregate counted', agg && agg.n_p_health === 1 && agg.sum_p_health === 5, agg);
    }
    const pre = await store(page, 'companies/acme/aggregates/pre');
    check('margin95: daily reconcile replayed pre + post', pre && pre.n_stress === 1 && (await store(page, 'companies/acme/aggregates/post')).n_stress === 1);
    const d3 = await store(page, 'companies/acme/aggregates/d21');
    check('margin95: daily reconcile replayed d21', d3 && d3.sum_d21 === 5, d3 && d3.sum_d21);
    check('margin95: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async missed(browser) {
    const { ctx, page, errors } = await open(browser, '/?seed=missed&rules=final');
    await page.waitForSelector('#app', { state: 'visible' });
    await sleep(1200);
    check('missed: comeback card shown', await page.isVisible('#comeback-card'));
    const txt = await page.textContent('#comeback-text');
    check('missed: names the last check-in and the gap', txt.includes('Day 4') && txt.includes('3 days'), txt);
    check('missed: no streak chip while the gap is open', !(await page.isVisible('#streak-bar')));
    await page.click('#comeback-log');
    await sleep(500);
    check('missed: viewing Day 7 with its check-in form', (await page.textContent('#today-day-num')).trim() === '7' && await page.isVisible('#checkin-card') && (await page.textContent('#checkin-submit')).includes('Log Day 7'));
    await page.check('#checkin-completed');
    await page.click('#checkin-submit');
    await sleep(900);
    const l7 = await store(page, 'users/ivy/dailyLogs/7');
    check('missed: late check-in saved to Day 7', l7 && l7.completed === true, l7);
    check('missed: comeback card gone once the gap is closed', !(await page.isVisible('#comeback-card')));
    await page.click('#day-back-to-today');
    await sleep(400);
    check('missed: back on Day 8 with the normal form', (await page.textContent('#today-day-num')).trim() === '8' && (await page.textContent('#checkin-submit')).includes('Save Check-in'));
    check('missed: no page errors', errors.filter(e => !e.includes('ERR_TUNNEL')).length === 0, errors);
    await page.screenshot({ path: SHOTS + '/missed.png', fullPage: true });
    await ctx.close();
  },

  async book(browser) {
    // ?src=book: sign-up opens with the reader note, source saved, funnel counted
    const { ctx, page, errors } = await open(browser, '/?seed=signup&rules=final&src=book');
    await page.waitForSelector('#auth-form', { state: 'visible' });
    check('book: sign-up mode with the reader note', await page.isVisible('#auth-source-note') && (await page.textContent('#auth-title')) === 'Create Account');
    await page.fill('#auth-name', 'Rae Reader');
    await page.fill('#auth-email', 'rae@test.com');
    await page.fill('#auth-password', 'secret1');
    await page.click('#auth-submit');
    await page.waitForSelector('#app', { state: 'visible' });
    await sleep(1000);
    const users = await page.evaluate(() => Object.entries(window.__fake.dump()).filter(([k]) => /^users\/[^/]+$/.test(k)).map(([, v]) => v));
    check('book: user doc carries source=book, no company', users.length === 1 && users[0].source === 'book' && users[0].companyId === null, users[0]);
    const f = await page.evaluate(() => { const d = window.__fake.dump(); return { s: d['stats/funnel/counters/signups'], b: d['stats/funnel/counters/src_book'] }; });
    check('book: funnel counted the sign-up and the source', f.s && f.s.n === 1 && f.b && f.b.n === 1, f);
    // pre-survey is up; complete it, then the first check-in counts d0 once
    await page.waitForSelector('#survey-form', { state: 'visible' });
    check('book: welcome overlay waits behind the survey', !(await page.isVisible('#onboarding')));
    await page.click('#survey-form button[type=submit]');
    await sleep(800);
    check('book: welcome overlay shows after the baseline is saved', await page.isVisible('#onboarding'));
    await page.click('#onboarding-start');
    await sleep(300);
    await page.check('#checkin-completed');
    await page.click('#checkin-submit');
    await sleep(800);
    await page.click('#checkin-submit');
    await sleep(800);
    const d0 = await store(page, 'stats/funnel/counters/d0');
    check('book: first check-in of Day 0 counted once (second save not counted)', d0 && d0.n === 1, d0);
    const ps = await page.evaluate(() => { const d = window.__fake.dump(); return Object.keys(d).filter(k => k.startsWith('stats/')); });
    check('book: funnel holds counters only', ps.every(k => /^stats\/funnel\/counters\/(signups|src_book|d0)$/.test(k)), ps);
    check('book: no page errors', errors.filter(e => !e.includes('ERR_TUNNEL')).length === 0, errors);
    await page.screenshot({ path: SHOTS + '/book-signup.png', fullPage: true });
    await ctx.close();
  },

  async signup(browser) {
    // full cohort
    let { ctx, page, errors } = await open(browser, '/?seed=signup&rules=final&code=FULL01');
    await page.waitForSelector('#auth-form', { state: 'visible' });
    await page.fill('#auth-name', 'Zed Test');
    await page.fill('#auth-email', 'zed@test.com');
    await page.fill('#auth-password', 'secret1');
    await page.click('#auth-submit');
    await sleep(800);
    const err = await page.textContent('#auth-error');
    check('signup: full cohort shows HR contact message', err.includes('contact your HR contact'), err);
    check('signup: no account created when full', (await page.evaluate(() => Object.keys(window.__fake.dump()).filter(k => k.startsWith('users/')))).length === 0);
    await page.screenshot({ path: SHOTS + '/signup-full.png' });
    await ctx.close();
    // race: code shows 2/3 at page load, last seat taken before submit
    ({ ctx, page, errors } = await open(browser, '/?seed=signup&rules=final&code=OPEN01'));
    await page.waitForSelector('#auth-form', { state: 'visible' });
    await page.evaluate(() => { const o = window.__fake.read('inviteCodes/OPEN01'); window.__origGet = null; });
    await page.fill('#auth-name', 'Yan Test');
    await page.fill('#auth-email', 'yan@test.com');
    await page.fill('#auth-password', 'secret1');
    await page.click('#auth-submit');
    await page.waitForSelector('#app', { state: 'visible' });
    await sleep(800);
    const code = await store(page, 'inviteCodes/OPEN01');
    check('signup: open cohort join counts the seat', code.seatsUsed === 3, code.seatsUsed);
    const users = await page.evaluate(() => Object.entries(window.__fake.dump()).filter(([k]) => /^users\/[^/]+$/.test(k)).map(([, v]) => v));
    check('signup: user joined company with invite code + cohort start', users.length === 1 && users[0].companyId === 'acme' && users[0].inviteCode === 'OPEN01' && users[0].challengeStartDate === code.challengeStartDate, users[0]);
    check('signup: no page errors', errors.length === 0, errors);
    await ctx.close();
    // race path: seat taken between the pre-check and the batch
    ({ ctx, page, errors } = await open(browser, '/?seed=signup&rules=final&code=OPEN01'));
    await page.waitForSelector('#auth-form', { state: 'visible' });
    await page.evaluate(() => {
      // after the pre-check read, someone else takes the last seat
      const f = window.__fake; const orig = f.store.get('inviteCodes/OPEN01');
      const auth = firebase.auth(); const create = auth.createUserWithEmailAndPassword.bind(auth);
      auth.createUserWithEmailAndPassword = async (e, p) => { f.store.set('inviteCodes/OPEN01', Object.assign({}, orig, { seatsUsed: 3 })); return create(e, p); };
    });
    await page.fill('#auth-name', 'Xia Test');
    await page.fill('#auth-email', 'xia@test.com');
    await page.fill('#auth-password', 'secret1');
    await page.click('#auth-submit');
    await sleep(1000);
    const err2 = await page.textContent('#auth-error');
    check('signup race: refused batch shows HR contact message', err2.includes('contact your HR contact'), err2);
    const st = await page.evaluate(() => ({ users: Object.keys(window.__fake.dump()).filter(k => k.startsWith('users/')), cur: firebase.auth().currentUser }));
    check('signup race: half-made login removed, no user doc', st.users.length === 0 && st.cur === null, st);
    check('signup race: auth screen still shown', await page.isVisible('#auth-form'));
    check('signup race: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async dash(browser) { // program owner (Scott): sees the cohort wellness views
    const { ctx, page, errors } = await open(browser, '/dashboard.html?seed=dash&rules=final&as=scott', { width: 1100, height: 1000 });
    await page.waitForSelector('#dashboard', { state: 'visible' });
    await sleep(1500);
    const stress = (await page.textContent('#m-avg-stress')).trim();
    let s = 0, n = 0;
    for (let d = 0; d <= 21; d++) { const a = await store(page, 'companies/acme/aggregates/d' + d); if (a) { s += a['sum_d' + d] || 0; n += a['n_d' + d] || 0; } }
    check('dash: avg stress = pooled aggregate', stress === (s / n).toFixed(1), [stress, (s / n).toFixed(1)]);
    check('dash: participants listed', (await page.textContent('#m-participants')).trim() === '4');
    const rows = await page.$$eval('#participant-rows tr', r => r.length);
    check('dash: roster rows', rows === 4, rows);
    // participant objects hold engagement only
    const keysSeen = await page.evaluate(async () => {
      const seen = new Set();
      const snap = await db.collection('users').doc('amy').collection('dailyLogs').doc('1').get();
      Object.keys(snap.data() || {}).forEach(k => seen.add(k));
      return [...seen];
    });
    check('dash: shell readable by admin has no private fields', !keysSeen.some(k => ['stress', 'sleep', 'steps', 'notes'].includes(k)), keysSeen);
    const leak = await page.evaluate(async () => {
      const tries = ['users/amy/dailyLogs/1/private/data', 'users/amy/assessments/pre/private/data', 'users/amy/private/savings', 'users/amy/aggLedger/d1', 'users/amy/assessments/pre'];
      const out = {};
      for (const p of tries) { try { await db.doc(p).get(); out[p] = 'READ'; } catch (e) { out[p] = e.code; } }
      try { await db.collection('users').doc('amy').collection('dailyLogs').get(); out.list = 'READ'; } catch (e) { out.list = e.code; }
      return out;
    });
    check('dash: devtools reads of private data are refused', Object.values(leak).every(v => v === 'permission-denied'), leak);
    // funnel card: owner only, counts from stats/funnel/counters
    await page.evaluate(() => { const f = window.__fake; f.put('stats/funnel/counters/signups', { n: 10 }); f.put('stats/funnel/counters/src_book', { n: 4 }); f.put('stats/funnel/counters/d0', { n: 8 }); f.put('stats/funnel/counters/d1', { n: 6 }); f.put('stats/funnel/counters/d2', { n: 3 }); f.put('stats/funnel/counters/post', { n: 1 }); });
    await page.click('#refresh-data');
    await sleep(1200);
    const fun = (await page.textContent('#funnel-card')).replace(/\s+/g, ' ');
    check('dash: owner funnel card shows sign-ups, sources, drops', await page.isVisible('#funnel-card') && fun.includes('10 signed up') && fun.includes('book 4') && fun.includes('Day 1 to Day 2 (3 of 6 stopped)'), fun.slice(0, 260));
    // detail overlay
    await page.click('#participant-rows tr');
    const detail = await page.textContent('#detail-content');
    check('dash: detail shows engagement, no stress/notes', detail.includes('Check-in History') && !/stress|note for day/i.test(detail), detail.slice(0, 120));
    await page.click('#detail-close');
    // assessments
    await page.click('.tab-btn[data-tab="assessments"]');
    await sleep(800);
    const at = await page.textContent('#assessment-results');
    check('dash: assessments table from aggregates', at.includes('Based on 4 start / 0 end') && at.includes('Financial Confidence') && at.includes('3.5'), at.replace(/\s+/g, ' ').slice(0, 220));
    await page.screenshot({ path: SHOTS + '/dash-assess.png', fullPage: true });
    // invite tab: seats from the code
    await page.click('.tab-btn[data-tab="invite"]');
    const meta = await page.textContent('#cohort-meta');
    check('dash: invite shows seatsUsed / maxSeats', meta.includes('4 / 25 seats joined'), meta);
    // HR report
    await page.click('.tab-btn[data-tab="export"]');
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('#results-report')]);
    await sleep(800);
    const rep = await popup.evaluate(() => document.body.innerText);
    check('dash: HR report savings total from aggregate', rep.includes('$1000'), rep.slice(0, 300));
    check('dash: HR report stress trend line', /Average stress \(Week 1 → Week 3\): (Week 1 avg )?\d/.test(rep), (rep.match(/Average stress[^\n]*/) || [])[0]);
    check('dash: HR report has no notes', !rep.includes('note for day'));
    check('dash: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async roadmapoff(browser) {
    for (const url of ['/?seed=rm&day=30&rm=0&rules=final', '/?seed=margin30&rules=final']) {
      const { ctx, page, errors } = await open(browser, url);
      await page.waitForSelector('#margin-home', { state: 'visible' });
      await sleep(900);
      check('roadmapoff: no Roadmap card (' + (url.includes('rm=0') ? 'code has it off' : 'individual') + ')', !(await page.$('#roadmap-card')));
      check('roadmapoff: no page errors', errors.length === 0, errors);
      await ctx.close();
    }
  },

  async roadmap22(browser) {
    const { ctx, page, errors } = await open(browser, '/?seed=rm&day=22&rm=1&rules=final');
    await page.waitForSelector('#roadmap-card', { state: 'visible' });
    const txt = (await page.textContent('#roadmap-card')).replace(/\s+/g, ' ');
    check('roadmap22: Month 2 of 12, Get Grounded, Module 2', txt.includes('Month 2 of 12 · Get Grounded') && txt.includes('Module 2: Picture It'), txt.slice(0, 160));
    check('roadmap22: action step from the module', txt.includes("I've logged into my 401(k) account and imagined how I want life to look when I reach age 70."));
    const href = await page.getAttribute('#roadmap-open', 'href');
    check('roadmap22: link = new S3 key, new tab', href === 'https://bmm-deliverables-a.s3.amazonaws.com/employee-roadmap/Employee_Roadmap_Module_02_Picture_It.pdf' && (await page.getAttribute('#roadmap-open', 'target')) === '_blank', href);
    const expectNext = await page.evaluate(() => Margin.shortDate(Margin.addDays(Auth.getUser().challengeStartDate, 52)));
    check('roadmap22: next unlock = Day 52', txt.includes('Next module: ' + expectNext), [expectNext, txt.slice(-120)]);
    check('roadmap22: earlier months = Month 1 only', (await page.$$eval('.rm-earlier li', l => l.map(x => x.textContent.trim()))).join('|') === 'Month 1: Storm Proof');
    await page.click('#roadmap-done');
    await sleep(500);
    let m = await store(page, 'users/rae/private/margin');
    check('roadmap22: step marked done (owner-only private/margin)', m.roadmap && m.roadmap['2'] && !!m.roadmap['2'].doneAt, m.roadmap);
    check('roadmap22: button shows done', (await page.textContent('#roadmap-done')).includes('Step marked done'));
    await page.click('#roadmap-done');
    await sleep(500);
    m = await store(page, 'users/rae/private/margin');
    check('roadmap22: undo removes the mark', !m.roadmap || !m.roadmap['2'], m.roadmap);
    await page.screenshot({ path: SHOTS + '/roadmap22.png', fullPage: true });
    check('roadmap22: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async roadmap85(browser) {
    const { ctx, page, errors } = await open(browser, '/?seed=rm&day=85&rm=1&rules=final');
    await page.waitForSelector('#roadmap-card', { state: 'visible' });
    const txt = (await page.textContent('#roadmap-card')).replace(/\s+/g, ' ');
    check('roadmap85: Month 4 of 12, Take Control, Destroy Debt', txt.includes('Month 4 of 12 · Take Control') && txt.includes('Module 4: Destroy Debt'), txt.slice(0, 160));
    const items = await page.$$eval('.rm-earlier li', l => l.map(x => x.textContent.trim()));
    check('roadmap85: earlier months 1-3, Month 2 marked done', items.length === 3 && items[1].includes('Month 2: Picture It') && items[1].includes('✓') && !items[0].includes('✓'), items);
    check('roadmap85: earlier links point at modules 1-3', (await page.$$eval('.rm-earlier a', a => a.map(x => x.getAttribute('href').split('/').pop()))).join(',') === 'Employee_Roadmap_Module_01_Storm_Proof.pdf,Employee_Roadmap_Module_02_Picture_It.pdf,Employee_Roadmap_Module_03_Know_Your_Numbers.pdf');
    check('roadmap85: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async dashhr(browser) { // HR admin: engagement only
    const { ctx, page, errors } = await open(browser, '/dashboard.html?seed=dash&rules=final', { width: 1100, height: 1000 });
    await page.waitForSelector('#dashboard', { state: 'visible' });
    await sleep(1200);
    check('dashhr: roster shown', (await page.$$eval('#participant-rows tr', r => r.length)) === 4);
    check('dashhr: avg stress card hidden', !(await page.isVisible('#m-avg-stress')));
    check('dashhr: assessments tab hidden', !(await page.isVisible('.tab-btn[data-tab="assessments"]')));
    check('dashhr: funnel card hidden', !(await page.isVisible('#funnel-card')));
    const aggTry = await page.evaluate(async () => { const out = []; for (const b of ['d1', 'pre', 'savings']) { try { await db.collection('companies').doc('acme').collection('aggregates').doc(b).get(); out.push('READ'); } catch (e) { out.push(e.code); } } return out; });
    check('dashhr: devtools aggregate reads refused', aggTry.every(x => x === 'permission-denied'), aggTry);
    await page.click('.tab-btn[data-tab="invite"]');
    let dialogMsg = '';
    page.once('dialog', d => { dialogMsg = d.message(); });
    await page.click('#gen-code');
    await sleep(600);
    const codes = await page.evaluate(() => Object.keys(window.__fake.dump()).filter(k => k.startsWith('inviteCodes/')));
    check('dashhr: HR cannot mint codes (told to contact the owner)', codes.length === 1 && dialogMsg.includes('program owner'), [codes, dialogMsg]);
    const hrTry = await page.evaluate(async () => { try { await db.collection('inviteCodes').doc('ACME25').update({ maxSeats: 999 }); return 'WROTE'; } catch (e) { return e.code; } });
    check('dashhr: devtools cannot raise maxSeats', hrTry === 'permission-denied', hrTry);
    check('dashhr: Roadmap switch hidden', !(await page.isVisible('#cohort-roadmap')));
    const hrRm = await page.evaluate(async () => { try { await db.collection('inviteCodes').doc('ACME25').update({ roadmap: true }); return 'WROTE'; } catch (e) { return e.code; } });
    check('dashhr: devtools cannot turn the Roadmap on', hrRm === 'permission-denied', hrRm);
    await page.click('.tab-btn[data-tab="export"]');
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('#results-report')]);
    await sleep(800);
    const rep = await popup.evaluate(() => document.body.innerText);
    check('dashhr: HR report has participation, no stress/savings/survey averages', rep.includes('PARTICIPATED') && !/Average stress|SAVED \(COHORT\)|Cohort Averages/i.test(rep), rep.slice(0, 260));
    check('dashhr: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async dashowner(browser) {
    const { ctx, page, errors } = await open(browser, '/dashboard.html?seed=dash&rules=final&as=scott', { width: 1100, height: 900 });
    await page.waitForSelector('#dashboard', { state: 'visible' });
    await sleep(1200);
    await page.click('.tab-btn[data-tab="invite"]');
    await page.click('#gen-code');
    await sleep(600);
    const codes = await page.evaluate(() => Object.entries(window.__fake.dump()).filter(([k]) => k.startsWith('inviteCodes/')).map(([k, v]) => [k, v.active, v.seatsUsed]));
    await page.check('#cohort-roadmap');
    await sleep(500);
    const live = await page.evaluate(() => Object.values(window.__fake.dump()).filter(v => v && v.active === true && 'seatsUsed' in v));
    check('dashowner: owner turns the Roadmap on for the active code', live.length === 1 && live[0].roadmap === true, live);
    await page.uncheck('#cohort-roadmap');
    await sleep(500);
    const live2 = await page.evaluate(() => Object.values(window.__fake.dump()).filter(v => v && v.active === true && 'seatsUsed' in v));
    check('dashowner: and off again', live2[0].roadmap === false, live2);
    check('dashowner: owner generates a code (list + deactivate + create)', codes.filter(c => c[1]).length === 1 && codes.find(c => c[1])[2] === 0, codes);
    check('dashowner: no page errors', errors.length === 0, errors);
    await ctx.close();
  },

  async demo(browser) {
    // dashboard.html?demo=1: no sign-in, made-up cohort, HR view by default
    const { ctx, page, errors } = await open(browser, '/dashboard.html?seed=none&demo=1', { width: 1100, height: 1000 });
    await page.waitForSelector('#dashboard', { state: 'visible' });
    await sleep(800);
    check('demo: banner says demo, made-up data', (await page.textContent('#demo-banner')).includes('made-up data'));
    check('demo: no sign-in needed', !(await page.isVisible('#admin-auth')));
    check('demo: 12 sample rows', (await page.$$eval('#participant-rows tr', r => r.length)) === 12);
    check('demo: HR view hides stress and assessments', !(await page.isVisible('#m-avg-stress')) && !(await page.isVisible('.tab-btn[data-tab="assessments"]')) && !(await page.isVisible('#funnel-card')));
    check('demo: no Firestore traffic', (await page.evaluate(() => window.__fake.log.length)) === 0, await page.evaluate(() => window.__fake.log.slice(0, 3)));
    await page.click('.tab-btn[data-tab="export"]');
    let [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('#results-report')]);
    await sleep(800);
    let rep = await popup.evaluate(() => document.body.innerText);
    check('demo: Day-21 summary opens with the sample label, participation only', rep.includes('SAMPLE REPORT') && rep.includes('PARTICIPATION BY PERSON') && !/Cohort Averages/i.test(rep), rep.slice(0, 200));
    await page.click('#demo-as-owner');
    await sleep(600);
    check('demo: owner view shows stress, assessments, funnel', await page.isVisible('#m-avg-stress') && await page.isVisible('.tab-btn[data-tab="assessments"]') && await page.isVisible('#funnel-card'));
    await page.click('.tab-btn[data-tab="assessments"]');
    await sleep(600);
    const at = (await page.textContent('#assessment-results')).replace(/\s+/g, ' ');
    check('demo: owner assessments table from generated aggregates', at.includes('Based on 12 start / 8 end'), at.slice(0, 160));
    check('demo: still no Firestore traffic', (await page.evaluate(() => window.__fake.log.length)) === 0);
    check('demo: no page errors', errors.filter(e => !e.includes('ERR_TUNNEL')).length === 0, errors);
    await page.screenshot({ path: SHOTS + '/demo-owner.png', fullPage: true });
    await ctx.close();
  },

  async dashsmall(browser) {
    // min group: only 2 people in the cohort -> averages hidden
    const { ctx, page, errors } = await open(browser, '/dashboard.html?seed=dash&rules=final&as=scott', { width: 1100, height: 900 });
    await page.waitForSelector('#dashboard', { state: 'visible' });
    await page.evaluate(() => {
      const f = window.__fake;
      const a = f.read('companies/acme/aggregates/pre');
      Object.keys(a).forEach(k => { if (k.startsWith('n_')) a[k] = 2; });
      f.store.set('companies/acme/aggregates/pre', a);
    });
    await page.click('.tab-btn[data-tab="assessments"]');
    await sleep(800);
    const at = await page.textContent('#assessment-results');
    check('dashsmall: averages hidden under 3 responses (rules refuse the raw doc)', !at.includes('3.5'), at.replace(/\s+/g, ' ').slice(0, 200));
    check('dashsmall: no page errors', errors.length === 0, errors);
    await ctx.close();
  }
};

(async () => {
  const browser = await chromium.launch();
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenarios);
  for (const n of names) {
    try { await scenarios[n](browser); } catch (e) { check(n + ': crashed', false, e.message.split('\n')[0]); }
  }
  await browser.close();
  const fail = results.filter(r => !r.ok);
  console.log(`\n${results.length - fail.length}/${results.length} passed`);
  process.exit(fail.length ? 1 : 0);
})();
