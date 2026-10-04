// Harness seed: ?seed=<scenario>&rules=final|transitional. Builds the fake
// Firebase, seeds the store and signs a user in BEFORE the app scripts run.
// The store survives reloads (sessionStorage) so restart/start-date flows work.
(function () {
  const params = new URLSearchParams(location.search);
  const seed = params.get('seed') || 'none';
  const mode = params.get('rules') || 'final';
  const { firebase, fake } = createFakeFirebase({ mode });
  window.firebase = firebase;
  window.__fake = fake;
  const T = fake.Timestamp;
  const KEY = 'harness:' + seed + ':' + mode;

  const ser = v => JSON.stringify(v, (k, x) => (x && typeof x.toMillis === 'function' ? { _ts: x.toMillis() } : x));
  const des = s => JSON.parse(s, (k, x) => (x && typeof x === 'object' && '_ts' in x ? T.fromMillis(x._ts) : x));
  window.addEventListener('beforeunload', () => {
    sessionStorage.setItem(KEY, ser({ store: fake.dump(), uid: firebase.auth().currentUser && firebase.auth().currentUser.uid }));
  });

  const pad = n => (n < 10 ? '0' : '') + n;
  const ymd = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const ts = () => ({ __sentinel: 'ts' });

  const saved = sessionStorage.getItem(KEY);
  if (saved) {
    const st = des(saved);
    Object.keys(st.store).forEach(p => fake.store.set(p, st.store[p]));
    if (st.uid) fake.signInAs(st.uid);
    return;
  }

  const FULL = { stress: 7, sleep: 4, financial: 3, energy: 4, overwhelm: 7, savings: 2, exercise: 3, breathing: 2, p_health: 5, p_wealth: 4, p_finwell: 4, p_retsave: 3, p_jobskills: 6 };
  function person(uid, o) {
    fake.put('users/' + uid, Object.assign({ role: 'participant', companyId: null, name: uid[0].toUpperCase() + uid.slice(1) + ' Test', email: uid + '@test.com', createdAt: ts() }, o.user));
    fake.account(uid + '@test.com', 'secret1', uid);
    (o.days || []).forEach(([d, shell, priv]) => {
      if (o.legacy) fake.put('users/' + uid + '/dailyLogs/' + d, Object.assign({ savedAt: ts() }, shell, priv));
      else {
        fake.put('users/' + uid + '/dailyLogs/' + d, Object.assign({ savedAt: ts() }, shell));
        if (priv) fake.put('users/' + uid + '/dailyLogs/' + d + '/private/data', Object.assign({ savedAt: ts() }, priv));
      }
    });
    Object.keys(o.surveys || {}).forEach(t => {
      if (o.legacy) fake.put('users/' + uid + '/assessments/' + t, { responses: o.surveys[t], completedAt: ts() });
      else {
        fake.put('users/' + uid + '/assessments/' + t, { completedAt: ts() });
        fake.put('users/' + uid + '/assessments/' + t + '/private/data', { responses: o.surveys[t], completedAt: ts() });
      }
    });
    if (o.savings) {
      if (o.legacy) { const u = fake.read('users/' + uid); u.savingsEntries = o.savings; fake.store.set('users/' + uid, u); }
      else fake.put('users/' + uid + '/private/savings', { entries: o.savings, rev: 1, updatedAt: ts() });
    }
    if (o.margin) fake.put('users/' + uid + '/private/margin', o.margin);
  }
  // Ledger + aggregate exactly as the app would have written them
  function countIn(uid, cid, bucket, vals) {
    const led = Object.assign({ op: 'seed' + uid + bucket }, vals);
    fake.put('users/' + uid + '/aggLedger/' + bucket, led);
    const path = 'companies/' + cid + '/aggregates/' + bucket;
    const agg = fake.read(path) || {};
    Object.keys(vals).forEach(k => {
      agg['sum_' + k] = (agg['sum_' + k] || 0) + vals[k];
      agg['n_' + k] = (agg['n_' + k] || 0) + (vals[k] > 0 ? 1 : 0);
    });
    agg.op = led.op;
    fake.store.set(path, agg);
  }
  const days = (n, f) => { const out = []; for (let d = 0; d <= n; d++) out.push(f(d)); return out; };
  const logDay = (d, stress) => [d, { completed: true, breathing: d % 2 === 0, meal: d % 3 === 0, action: false }, { stress, sleep: 6, steps: 4000 + d * 100, notes: 'note for day ' + d }];

  const companyBase = () => {
    fake.put('companies/acme', { name: 'Acme Test Co' });
    fake.put('inviteCodes/ACME25', { companyId: 'acme', active: true, maxSeats: 25, seatsUsed: 4, challengeStartDate: ymd(-5), createdAt: ts() });
  };

  switch (seed) {
    case 'legacy': // pre-split data, company participant, transitional rules expected
      companyBase();
      person('amy', { legacy: true, user: { companyId: 'acme', inviteCode: 'ACME25', challengeStartDate: ymd(-5) }, days: days(4, d => logDay(d, 8 - d)), surveys: { pre: FULL }, savings: [{ amount: 120, date: 'Oct 1, 2026', iso: ymd(-3) }, { amount: -20, date: 'Oct 2, 2026', iso: ymd(-2) }] });
      fake.signInAs('amy');
      break;
    case 'company': // split data, company participant on day 5
      companyBase();
      person('amy', { user: { companyId: 'acme', inviteCode: 'ACME25', challengeStartDate: ymd(-5) }, days: days(4, d => logDay(d, 8 - d)), surveys: { pre: FULL }, savings: [{ amount: 75, iso: ymd(-1), date: 'x' }] });
      fake.signInAs('amy');
      break;
    case 'day21': // individual, Day 21, post survey due
      person('dee', { user: { challengeStartDate: ymd(-21) }, days: days(21, d => logDay(d, Math.max(2, 9 - Math.floor(d / 3)))), surveys: { pre: FULL } });
      fake.signInAs('dee');
      break;
    case 'margin30': { // individual, Day 30, Keep Your Margin
      const ds = days(21, d => logDay(d, 6));
      ds[19][2].notes = 'My reset plan: walk, $5, breathe.';
      ds[20][2].notes = 'My one page for after Day 21.';
      person('max', { user: { challengeStartDate: ymd(-30), breathingSessions: 6 }, days: ds, surveys: { pre: FULL, post: Object.assign({}, FULL, { stress: 4 }) }, savings: [{ amount: 300, iso: ymd(-20), date: 'x' }, { amount: 250, iso: ymd(-5), date: 'x' }], margin: { pomTarget: 2400, healthAction: 'Walk 20 minutes', healthActionSetAt: ymd(-13) } });
      fake.put('users/max/marginLogs/' + ymd(-2), { action: true, stress: 4, notes: 'ok' });
      fake.put('users/max/marginLogs/' + ymd(-1), { action: true, stress: 3, notes: '' });
      fake.signInAs('max');
      break;
    }
    case 'margin95': // company graduate at day 95, m3 due
      companyBase();
      person('mia', { user: { companyId: 'acme', inviteCode: 'ACME25', challengeStartDate: ymd(-95) }, days: days(21, d => logDay(d, 5)), surveys: { pre: FULL, post: FULL }, margin: { pomTarget: 1500, healthAction: 'Stretch', healthActionSetAt: ymd(-78) } });
      fake.signInAs('mia');
      break;
    case 'signup': // nobody signed in; one full code, one open code
      companyBase();
      fake.put('inviteCodes/FULL01', { companyId: 'acme', active: true, maxSeats: 2, seatsUsed: 2, challengeStartDate: ymd(-1) });
      fake.put('inviteCodes/OPEN01', { companyId: 'acme', active: true, maxSeats: 3, seatsUsed: 2, challengeStartDate: ymd(-1) });
      break;
    case 'dash': { // HR admin, 4 participants with split data + consistent aggregates
      companyBase();
      fake.put('users/hr', { role: 'admin', companyId: 'acme', name: 'HR Admin', email: 'hr@test.com' });
      const ppl = [['amy', 7, 2], ['bob', 5, 0], ['cat', 8, 1], ['dan', 4, 3]];
      ppl.forEach(([uid, base, skip], i) => {
        const ds = days(5, d => logDay(d, Math.max(1, base - (d % 3)))).filter(x => x[0] !== skip);
        const pre = Object.assign({}, FULL, { stress: base, financial: 2 + i });
        person(uid, { user: { companyId: 'acme', inviteCode: 'ACME25', challengeStartDate: ymd(-5), breathingSessions: i + 1 }, days: ds, surveys: { pre }, savings: [{ amount: 100 * (i + 1), iso: ymd(-1), date: 'x' }] });
        const led = {}; ds.forEach(([d, , p]) => { led['d' + d] = p.stress; });
        countIn(uid, 'acme', 'days1', led);
        countIn(uid, 'acme', 'pre', pre);
        countIn(uid, 'acme', 'savings', { cents: 10000 * (i + 1) });
      });
      fake.signInAs('hr');
      break;
    }
    default:
      break;
  }
})();
