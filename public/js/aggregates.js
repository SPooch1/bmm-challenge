// Company aggregate counters (no Cloud Functions). Participants keep the cohort
// totals current with FieldValue.increment; admins can only read them.
//
//   companies/{companyId}/aggregates/{bucket}   admin-readable totals: sum_<key>, n_<key>
//   users/{uid}/aggLedger/{bucket}              owner-only: what this person has counted
//
// Each write moves the ledger and the aggregate together in one transaction, and
// the rules check that the aggregate moved by exactly the ledger's change, with
// every ledger value inside its range (1-10 scales, savings in cents). So one
// participant can only ever add or remove their own single contribution per key.
// Reconciling is idempotent: desired values come from the person's own private
// data, the ledger says what is already counted, and only the difference is
// written. A failed write marks the bucket pending in localStorage and is retried
// on the next load, so totals never silently drift.
const Aggregates = (() => {
  const FULL_Q = ['stress', 'sleep', 'financial', 'energy', 'overwhelm', 'savings', 'exercise', 'breathing',
    'p_health', 'p_wealth', 'p_finwell', 'p_retsave', 'p_jobskills'];
  const PILLAR_Q = ['p_health', 'p_wealth', 'p_finwell', 'p_retsave', 'p_jobskills'];
  // Daily stress: one bucket per challenge day (d0..d21), so the rules can refuse
  // an admin read of any day with fewer than 3 ratings (MIN_GROUP).
  const BUCKETS = {};
  for (let d = 0; d <= 21; d++) BUCKETS['d' + d] = ['d' + d];
  Object.assign(BUCKETS, {
    pre: FULL_Q,
    post: FULL_Q,
    m3: PILLAR_Q,
    m6: PILLAR_Q,
    m12: PILLAR_Q,
    savings: ['cents']
  });
  const SURVEY_BUCKETS = ['pre', 'post', 'm3', 'm6', 'm12'];
  const DAY_BUCKETS = Object.keys(BUCKETS).filter(b => /^d\d+$/.test(b));
  // Same number as the rules' admin-read threshold.
  const MIN_GROUP = 3;
  const MAX_CENTS = 100000000; // $1M; rules use the same bound
  const maxFor = key => (key === 'cents' ? MAX_CENTS : 10);

  function dayBucket(day) { return 'd' + Number(day); }

  // Integer in range, or 0 (= not counted). Scale answers below 1 are not answers.
  function clean(key, v) {
    const n = Math.round(Number(v));
    if (!isFinite(n) || n <= 0) return 0;
    return Math.min(n, maxFor(key));
  }

  // ---- desired values, built from the person's own data ----
  function dailyDesired(logs, bucket) {
    const out = {};
    BUCKETS[bucket].forEach(k => {
      const l = logs && logs[k.slice(1)];
      out[k] = clean(k, l && l.stress);
    });
    return out;
  }
  function surveyDesired(type, survey) {
    const out = {};
    const r = (survey && survey.responses) || {};
    BUCKETS[type].forEach(k => { out[k] = clean(k, r[k]); });
    return out;
  }
  function savingsDesired(total) {
    return { cents: clean('cents', Math.round((Number(total) || 0) * 100)) };
  }

  // ---- pending list (localStorage, per user) ----
  function readList(key) {
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function writeList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* storage blocked: next load re-checks */ }
  }
  const pendingKey = uid => 'aggPending:' + uid;
  function markPending(uid, bucket) {
    const list = readList(pendingKey(uid));
    if (!list.includes(bucket)) { list.push(bucket); writeList(pendingKey(uid), list); }
  }
  function clearPending(uid, bucket) {
    writeList(pendingKey(uid), readList(pendingKey(uid)).filter(b => b !== bucket));
  }
  function getPending(uid) { return readList(pendingKey(uid)).filter(b => BUCKETS[b]); }

  function opId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // Bring this person's counted values for `bucket` up to `desired` (key -> value;
  // keys not listed are left alone). Resolves true when the bucket is in sync.
  async function reconcile(uid, companyId, bucket, desired) {
    if (!uid || !companyId || !BUCKETS[bucket]) return false;
    const keys = BUCKETS[bucket];
    const want = {};
    Object.keys(desired || {}).forEach(k => { if (keys.includes(k)) want[k] = clean(k, desired[k]); });
    const ledgerRef = db.collection('users').doc(uid).collection('aggLedger').doc(bucket);
    const aggRef = db.collection('companies').doc(companyId).collection('aggregates').doc(bucket);
    const inc = n => firebase.firestore.FieldValue.increment(n);
    try {
      await db.runTransaction(async t => {
        const snap = await t.get(ledgerRef);
        const have = snap.exists ? (snap.data() || {}) : {};
        const ledgerPatch = {};
        const aggPatch = {};
        let changed = false;
        Object.keys(want).forEach(k => {
          const before = clean(k, have[k]);
          const after = want[k];
          if (before === after) return;
          changed = true;
          ledgerPatch[k] = after;
          aggPatch['sum_' + k] = inc(after - before);
          const dn = (after > 0 ? 1 : 0) - (before > 0 ? 1 : 0);
          if (dn) aggPatch['n_' + k] = inc(dn);
        });
        if (!changed) return;
        const op = opId();
        ledgerPatch.op = op;
        aggPatch.op = op;
        t.set(ledgerRef, ledgerPatch, { merge: true });
        t.set(aggRef, aggPatch, { merge: true });
      });
      clearPending(uid, bucket);
      return true;
    } catch (err) {
      console.warn('aggregate update deferred (' + bucket + ')', err);
      markPending(uid, bucket);
      return false;
    }
  }

  // Fire-and-forget hook for the write paths. Never throws, never blocks a save.
  function record(bucket, desired) {
    try {
      const user = typeof Auth !== 'undefined' && Auth.getUser ? Auth.getUser() : null;
      if (!user || !user.companyId) return Promise.resolve(false);
      return reconcile(user.id, user.companyId, bucket, desired);
    } catch (e) { return Promise.resolve(false); }
  }

  // On load: retry pending buckets, and re-check every bucket once a day so a
  // write lost before this version (or on another device) heals itself.
  // providers: { daily: () => Promise<logs>, survey: type => Promise<survey|null>, savingsTotal: () => number }
  // Providers should read fresh data: a stale copy would undo a save made since page load.
  async function reconcileOnLoad(user, providers) {
    if (!user || !user.companyId) return;
    const uid = user.id;
    const today = new Date().toISOString().slice(0, 10);
    const checkedKey = 'aggChecked:' + uid;
    let checked = {};
    try { checked = JSON.parse(localStorage.getItem(checkedKey) || '{}') || {}; } catch (e) { checked = {}; }
    const pending = getPending(uid);
    const due = Object.keys(BUCKETS).filter(b => pending.includes(b) || checked[b] !== today);
    for (const b of due) {
      let desired = null;
      try {
        if (DAY_BUCKETS.includes(b)) desired = dailyDesired(await providers.daily(), b);
        else if (SURVEY_BUCKETS.includes(b)) desired = surveyDesired(b, await providers.survey(b));
        else if (b === 'savings') desired = savingsDesired(providers.savingsTotal());
      } catch (e) { desired = null; }
      if (!desired) continue;
      const ok = await reconcile(uid, user.companyId, b, desired);
      if (ok) checked[b] = today;
    }
    try { localStorage.setItem(checkedKey, JSON.stringify(checked)); } catch (e) { /* ignore */ }
  }

  // ---- reading the totals (dashboard) ----
  const avgOf = (agg, key) => {
    const n = agg && agg['n_' + key];
    return n > 0 ? agg['sum_' + key] / n : null;
  };
  const countOf = (agg, key) => (agg && agg['n_' + key]) || 0;
  // Pooled stress average over challenge days lo..hi from the day buckets.
  function stressOver(aggs, lo, hi) {
    let sum = 0, n = 0;
    for (let d = lo; d <= hi; d++) {
      const a = aggs[dayBucket(d)];
      if (!a) continue;
      sum += a['sum_d' + d] || 0;
      n += a['n_d' + d] || 0;
    }
    return { avg: n > 0 ? sum / n : null, n };
  }
  // Responses counted for a survey = the most-answered question (older pre-surveys
  // have no pillar questions, so per-question counts can differ).
  function responsesIn(agg, type) {
    return Math.max(0, ...BUCKETS[type].map(k => countOf(agg, k)));
  }

  return {
    BUCKETS, SURVEY_BUCKETS, DAY_BUCKETS, MAX_CENTS, MIN_GROUP, dayBucket, clean,
    dailyDesired, surveyDesired, savingsDesired,
    reconcile, record, reconcileOnLoad, getPending, markPending,
    avgOf, countOf, stressOver, responsesIn
  };
})();
