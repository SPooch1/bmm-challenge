// JS model of firestore.rules, one function per `allow`, for local testing only
// (no Java on this Mac, so the Firestore emulator cannot run). Each rule here is a
// line-by-line transcription of firestore.rules; tests/rules-model.test.js checks
// the key lists against the rules text. mode 'transitional' = firestore.rules,
// mode 'final' = firestore.rules.final.
//
// ctx = { auth: {uid}|null, resource: data|null (before), request: data|null (after),
//         get(path), getAfter(path), exists(path) } where get/getAfter THROW on a
// missing doc, like `.data` on null in the rules language (an error = deny).
(function (root) {
  const DAILY_SHELL = ['completed', 'action', 'breathing', 'meal', 'savedAt'];
  const DAILY_LEGACY = ['stress', 'sleep', 'steps', 'notes'];
  const FULL_Q = ['stress', 'sleep', 'financial', 'energy', 'overwhelm', 'savings', 'exercise', 'breathing',
    'p_health', 'p_wealth', 'p_finwell', 'p_retsave', 'p_jobskills'];
  const PILLAR_Q = ['p_health', 'p_wealth', 'p_finwell', 'p_retsave', 'p_jobskills'];
  const BUCKET_KEYS = {};
  for (let d = 0; d <= 21; d++) BUCKET_KEYS['d' + d] = ['d' + d];
  Object.assign(BUCKET_KEYS, {
    pre: FULL_Q, post: FULL_Q, m3: PILLAR_Q, m6: PILLAR_Q, m12: PILLAR_Q, savings: ['cents']
  });
  const MIN_GROUP = 3;
  const enough = (m, k) => { const n = mget(m, 'n_' + k, 0); return n === 0 || n >= MIN_GROUP; };
  const readable = (b, m) => !!BUCKET_KEYS[b] && BUCKET_KEYS[b].every(k => enough(m, k));
  const bucketKeys = b => BUCKET_KEYS[b] || [];
  const aggKeys = b => (BUCKET_KEYS[b] ? BUCKET_KEYS[b].flatMap(k => ['sum_' + k, 'n_' + k]).concat(['op']) : []);

  const isInt = v => typeof v === 'number' && Number.isInteger(v);
  const mget = (m, k, d) => (m && Object.prototype.hasOwnProperty.call(m, k) ? m[k] : d);
  const keys = m => Object.keys(m || {});
  const hasOnly = (list, allowed) => list.every(k => allowed.includes(k));
  const hasAny = (list, banned) => list.some(k => banned.includes(k));
  const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function affectedKeys(after, before) {
    const all = new Set(keys(after).concat(keys(before)));
    return [...all].filter(k => !(k in (after || {})) || !(k in (before || {})) || !deepEq(after[k], before[k]));
  }
  // Evaluate one allow expression; any thrown error = false (rules semantics).
  const tryAllow = fn => { try { return fn() === true; } catch (e) { return false; } };

  function createRules(mode) {
    const FINAL = mode === 'final';

    function api(ctx) {
      const signedIn = () => ctx.auth != null;
      const uid = () => { if (!ctx.auth) throw new Error('no auth'); return ctx.auth.uid; };
      const isOwner = userId => signedIn() && ctx.auth.uid === userId;
      const userData = id => ctx.get('users/' + id);
      const isCompanyAdmin = cid => { const u = userData(uid()); return u.role === 'admin' && u.companyId === cid; };
      const isAdminOf = userId => { const cid = mget(userData(userId), 'companyId', null); return signedIn() && cid != null && isCompanyAdmin(cid); };
      const isCohortManager = cid => { const u = userData(uid()); return u.role === 'admin' && mget(u, 'cohortManager', false) === true && u.companyId === cid; };
      const isMigrator = () => !FINAL && signedIn() && mget(userData(uid()), 'migrator', false) === true;

      function seatClaimed(code, companyId) {
        const p = 'inviteCodes/' + code;
        const before = ctx.get(p);
        return before.companyId === companyId && before.active === true
          && mget(ctx.getAfter(p), 'seatsUsed', 0) === mget(before, 'seatsUsed', 0) + 1;
      }
      function step(aB, aA, lB, lA, k) {
        const v = mget(lA, k, 0), was = mget(lB, k, 0);
        const max = k === 'cents' ? 100000000 : 10;
        return isInt(v) && v >= 0 && v <= max
          && mget(aA, 'sum_' + k, 0) - mget(aB, 'sum_' + k, 0) === v - was
          && mget(aA, 'n_' + k, 0) - mget(aB, 'n_' + k, 0) === (v > 0 ? 1 : 0) - (was > 0 ? 1 : 0);
      }
      const lockstep = (b, aB, aA, lB, lA) => !!BUCKET_KEYS[b] && BUCKET_KEYS[b].every(k => step(aB, aA, lB, lA, k));
      function aggWriteOk(companyId, bucket, aB) {
        const lp = 'users/' + uid() + '/aggLedger/' + bucket;
        const lB = ctx.exists(lp) ? ctx.get(lp) : {};
        const lA = ctx.getAfter(lp);
        const aA = ctx.request;
        const me = userData(uid());
        return me.role === 'participant' && mget(me, 'companyId', null) === companyId
          && hasOnly(keys(aA), aggKeys(bucket))
          && typeof mget(aA, 'op', '') === 'string'
          && mget(lA, 'op', '') === mget(aA, 'op', '')
          && lockstep(bucket, aB, aA, lB, lA);
      }
      function ledgerWriteOk(userId, bucket) {
        const me = userData(userId);
        const cid = mget(me, 'companyId', null);
        if (typeof cid !== 'string') return false; // path with null cid = error in rules
        const ap = 'companies/' + cid + '/aggregates/' + bucket;
        const op = mget(ctx.request, 'op', '');
        return me.role === 'participant'
          && hasOnly(keys(ctx.request), bucketKeys(bucket).concat(['op']))
          && typeof op === 'string' && op.length >= 8
          && mget(ctx.getAfter(ap), 'op', '') === op
          && (!ctx.exists(ap) || mget(ctx.get(ap), 'op', '') !== op);
      }
      return { isCohortManager, signedIn, uid, isOwner, isCompanyAdmin, isAdminOf, isMigrator, seatClaimed, aggWriteOk, ledgerWriteOk, userData };
    }

    // Returns true when some `allow` grants op on path. op: get|list|create|update|delete
    function allow(op, path, ctx) {
      const s = path.split('/');
      const A = api(ctx);
      const R = ctx.resource, Q = ctx.request;
      const read = op === 'get' || op === 'list';
      const write = op === 'create' || op === 'update' || op === 'delete';
      const rules = [];

      if (s.length === 2 && s[0] === 'users') {
        const userId = s[1];
        rules.push(() => read && A.isOwner(userId));
        rules.push(() => read && A.signedIn() && R.companyId != null && A.isCompanyAdmin(R.companyId));
        rules.push(() => op === 'create' && A.isOwner(userId) && Q.role === 'participant'
          && !hasAny(keys(Q), ['migrator', 'cohortManager'])
          && (!FINAL || !hasAny(keys(Q), ['savingsEntries', 'savingsRev']))
          && (mget(Q, 'companyId', null) == null
            || (typeof mget(Q, 'inviteCode', '') === 'string' && mget(Q, 'inviteCode', '') !== ''
              && A.seatClaimed(Q.inviteCode, Q.companyId))));
        rules.push(() => op === 'update' && A.isOwner(userId)
          && !hasAny(affectedKeys(Q, R), ['role', 'companyId', 'inviteCode', 'migrator', 'cohortManager'])
          && (!FINAL || !hasAny(keys(Q), ['savingsEntries', 'savingsRev'])));
        rules.push(() => (read || op === 'update') && A.isMigrator());
      } else if (s.length === 4 && s[0] === 'users' && s[2] === 'dailyLogs') {
        const userId = s[1];
        rules.push(() => (read || op === 'delete') && A.isOwner(userId));
        if (!FINAL) {
          rules.push(() => (op === 'create' || op === 'update') && A.isOwner(userId)
            && hasOnly(keys(Q), DAILY_SHELL.concat(DAILY_LEGACY)));
          rules.push(() => op === 'get' && (R == null || hasOnly(keys(R), DAILY_SHELL)) && A.isAdminOf(userId));
          rules.push(() => (read || op === 'update') && A.isMigrator());
        } else {
          rules.push(() => (op === 'create' || op === 'update') && A.isOwner(userId) && hasOnly(keys(Q), DAILY_SHELL));
          rules.push(() => op === 'get' && (R == null || hasOnly(keys(R), DAILY_SHELL)) && A.isAdminOf(userId));
        }
      } else if (s.length === 6 && s[0] === 'users' && (s[2] === 'dailyLogs' || s[2] === 'assessments') && s[4] === 'private') {
        const userId = s[1];
        rules.push(() => (read || write) && A.isOwner(userId));
        rules.push(() => (read || write) && A.isMigrator());
      } else if (s.length === 4 && s[0] === 'users' && s[2] === 'assessments') {
        const userId = s[1];
        rules.push(() => (read || op === 'delete') && A.isOwner(userId));
        if (!FINAL) {
          rules.push(() => (op === 'create' || op === 'update') && A.isOwner(userId) && hasOnly(keys(Q), ['completedAt', 'responses']));
          rules.push(() => (read || op === 'update') && A.isMigrator());
        } else {
          rules.push(() => (op === 'create' || op === 'update') && A.isOwner(userId) && hasOnly(keys(Q), ['completedAt']));
        }
      } else if (s.length === 4 && s[0] === 'users' && s[2] === 'private') {
        rules.push(() => A.isOwner(s[1]));
        rules.push(() => s[3] === 'savings' && A.isMigrator());
      } else if (s.length === 4 && s[0] === 'users' && (s[2] === 'marginLogs' || s[2] === 'breathSessions')) {
        rules.push(() => A.isOwner(s[1]));
      } else if (s.length === 4 && s[0] === 'users' && s[2] === 'engagement') {
        rules.push(() => A.isOwner(s[1]));
        rules.push(() => read && A.isAdminOf(s[1]));
      } else if (s.length === 4 && s[0] === 'users' && s[2] === 'aggLedger') {
        rules.push(() => read && A.isOwner(s[1]));
        rules.push(() => (op === 'create' || op === 'update') && A.isOwner(s[1]) && A.ledgerWriteOk(s[1], s[3]));
        rules.push(() => (read || write) && A.isMigrator());
      } else if (s.length === 2 && s[0] === 'companies') {
        rules.push(() => A.signedIn() && A.isCompanyAdmin(s[1]));
      } else if (s.length === 4 && s[0] === 'companies' && s[2] === 'aggregates') {
        rules.push(() => op === 'get' && A.signedIn() && A.isCompanyAdmin(s[1]) && (R == null || readable(s[3], R)));
        rules.push(() => op === 'create' && A.signedIn() && A.aggWriteOk(s[1], s[3], {}));
        rules.push(() => op === 'update' && A.signedIn() && A.aggWriteOk(s[1], s[3], R));
        rules.push(() => (read || write) && A.isMigrator());
      } else if (s.length === 2 && s[0] === 'inviteCodes') {
        const code = s[1];
        rules.push(() => op === 'get');
        rules.push(() => op === 'list' && A.signedIn() && A.isCompanyAdmin(R.companyId));
        rules.push(() => op === 'create' && A.signedIn() && A.isCohortManager(Q.companyId));
        rules.push(() => op === 'update' && A.signedIn() && A.isCohortManager(R.companyId) && Q.companyId === R.companyId);
        rules.push(() => op === 'delete' && A.signedIn() && A.isCohortManager(R.companyId));
        rules.push(() => (read || op === 'update') && A.isMigrator());
        rules.push(() => op === 'update' && A.signedIn()
          && hasOnly(affectedKeys(Q, R), ['seatsUsed'])
          && R.active === true
          && Q.seatsUsed === mget(R, 'seatsUsed', 0) + 1
          && (mget(R, 'maxSeats', null) == null || Q.seatsUsed <= R.maxSeats)
          && !ctx.exists('users/' + A.uid())
          && mget(ctx.getAfter('users/' + A.uid()), 'inviteCode', '') === code);
      }
      return rules.some(tryAllow);
    }

    return { allow, mode };
  }

  const api = { createRules, MIN_GROUP, BUCKET_KEYS, aggKeys, DAILY_SHELL, DAILY_LEGACY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RulesModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
