// Run: node --test tests/   (no dependencies)
// 1) the rules text and the app agree on bucket keys, final rules are current;
// 2) a who-can-read/write matrix on the rules model (final + transitional);
// 3) end-to-end flows on the fake Firestore: app write/read paths, aggregate
//    reconcile, seat cap, and the migration (copy, replay, strip, verify).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const RulesModel = require('./rules-model.js');
const { createFakeFirebase } = require('./fake-firebase.js');
const { createMigrator } = require('../tools/migrate-core.js');
const { buildFinal } = require('../tools/make-final-rules.js');

const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

// Load the browser modules (privacy.js, aggregates.js) against a fake Firebase.
function loadApp(mode) {
  const { firebase, fake } = createFakeFirebase({ RulesModel, mode });
  const ls = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, setTimeout, Date, Math, JSON, Promise,
    firebase, db: firebase.firestore(), auth: firebase.auth(),
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    Auth: { user: null, getUser() { return this.user; } }
  };
  vm.createContext(ctx);
  ['privacy.js', 'aggregates.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8'), ctx, { filename: f }));
  const Privacy = vm.runInContext('Privacy', ctx);
  const Aggregates = vm.runInContext('Aggregates', ctx);
  return { firebase, fake, db: ctx.db, Privacy, Aggregates, ctx, ls };
}
const tick = () => new Promise(r => setTimeout(r, 5));

// ---------------------------------------------------------------- 1) text checks
test('rules bucket key lists match aggregates.js and the rules model', () => {
  // JSON round trip: arrays from the vm context have another realm's prototype
  const Aggregates = JSON.parse(JSON.stringify({ BUCKETS: loadApp('final').Aggregates.BUCKETS }));
  const parseFn = name => {
    const body = RULES.slice(RULES.indexOf('function ' + name + '('));
    const end = body.indexOf('\n    }');
    return body.slice(0, end);
  };
  const bk = parseFn('bucketKeys');
  const ak = parseFn('aggKeys');
  const listAfter = (src, cond) => {
    const i = src.indexOf(cond);
    assert.ok(i >= 0, 'missing ' + cond);
    const m = src.slice(i).match(/\[([^\]]*)\]/);
    return m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean);
  };
  const conds = { days1: "bucket == 'days1'", days2: "bucket == 'days2'", days3: "bucket == 'days3'", pre: "(bucket == 'pre'", m3: "(bucket == 'm3'", savings: "bucket == 'savings'" };
  Object.entries(conds).forEach(([b, cond]) => {
    assert.deepEqual(listAfter(bk, cond), Aggregates.BUCKETS[b], 'bucketKeys ' + b);
    assert.deepEqual(listAfter(ak, cond), Aggregates.BUCKETS[b].flatMap(k => ['sum_' + k, 'n_' + k]).concat(['op']), 'aggKeys ' + b);
    assert.deepEqual(RulesModel.BUCKET_KEYS[b], Aggregates.BUCKETS[b], 'model ' + b);
  });
  assert.deepEqual(Aggregates.BUCKETS.post, Aggregates.BUCKETS.pre);
  assert.deepEqual(Aggregates.BUCKETS.m12, Aggregates.BUCKETS.m3);
  // each lockstep helper covers every key of its bucket
  ['days1', 'days2', 'days3'].forEach(b => {
    const fn = parseFn(b + 'Ok');
    Aggregates.BUCKETS[b].forEach(k => assert.ok(fn.includes("'" + k + "'"), b + 'Ok misses ' + k));
  });
  const full = parseFn('fullSurveyOk') + parseFn('pillarsOk');
  Aggregates.BUCKETS.pre.forEach(k => assert.ok(full.includes("'" + k + "'"), 'fullSurveyOk misses ' + k));
});

test('firestore.rules.final is generated from firestore.rules and has no migration branch', () => {
  const final = buildFinal(RULES);
  assert.equal(fs.readFileSync(path.join(ROOT, 'firestore.rules.final'), 'utf8'), final);
  assert.ok(!/isMigrator|TRANSITIONAL/.test(final));
  assert.ok(/allow get: if \(resource == null \|\| resource\.data\.keys\(\)\.hasOnly\(dailyShellFields\(\)\)\)/.test(final));
  // brace balance
  const bal = s => (s.match(/{/g) || []).length - (s.match(/}/g) || []).length;
  assert.equal(bal(RULES), 0); assert.equal(bal(final), 0);
});

// ---------------------------------------------------------------- 2) matrix
function world(mode) {
  const { firebase, fake } = createFakeFirebase({ RulesModel, mode });
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  fake.put('users/hr', { role: 'admin', companyId: 'acme', name: 'HR', email: 'hr@acme' });
  fake.put('users/scott', { role: 'admin', companyId: 'acme', name: 'Scott', migrator: true });
  fake.put('users/hrB', { role: 'admin', companyId: 'beta', name: 'HR B' });
  fake.put('users/amy', { role: 'participant', companyId: 'acme', name: 'Amy', email: 'amy@acme', inviteCode: 'ACME01', challengeStartDate: '2026-09-20', breathingSessions: 3 });
  fake.put('users/bob', { role: 'participant', companyId: 'acme', name: 'Bob', inviteCode: 'ACME01' });
  fake.put('users/ivy', { role: 'participant', companyId: null, name: 'Ivy' });
  fake.put('companies/acme', { name: 'Acme' });
  fake.put('inviteCodes/ACME01', { companyId: 'acme', active: true, maxSeats: 3, seatsUsed: 2 });
  fake.put('users/amy/dailyLogs/3', { completed: true, breathing: true, meal: false, savedAt: FV.serverTimestamp() });
  fake.put('users/amy/dailyLogs/3/private/data', { stress: 7, sleep: 5, steps: 4000, notes: 'secret' });
  fake.put('users/amy/assessments/pre', { completedAt: FV.serverTimestamp() });
  fake.put('users/amy/assessments/pre/private/data', { responses: { stress: 8 } });
  fake.put('users/amy/private/savings', { entries: [{ amount: 50 }] });
  fake.put('users/amy/private/margin', { pomTarget: 2400 });
  fake.put('users/amy/marginLogs/2026-10-01', { stress: 4, notes: 'x' });
  fake.put('users/amy/engagement/weekly', { weeks: {} });
  return { fake, db, FV };
}
const can = async p => { try { await p; return true; } catch (e) { if (e.code !== 'permission-denied') throw e; return false; } };

for (const mode of ['final', 'transitional']) {
  test(`[${mode}] HR admin cannot read any named person's wellness data`, async () => {
    const { fake, db } = world(mode);
    fake.signInAs('hr');
    const u = db.collection('users').doc('amy');
    assert.equal(await can(u.collection('dailyLogs').doc('3').collection('private').doc('data').get()), false, 'daily private');
    assert.equal(await can(u.collection('assessments').doc('pre').collection('private').doc('data').get()), false, 'survey private');
    assert.equal(await can(u.collection('private').doc('savings').get()), false, 'savings');
    assert.equal(await can(u.collection('private').doc('margin').get()), false, 'margin');
    assert.equal(await can(u.collection('marginLogs').doc('2026-10-01').get()), false, 'marginLogs');
    assert.equal(await can(u.collection('aggLedger').doc('days1').get()), false, 'ledger');
    // engagement is fine
    assert.equal(await can(u.collection('dailyLogs').doc('3').get()), true, 'shell get');
    assert.equal(await can(u.collection('engagement').doc('weekly').get()), true, 'engagement');
    assert.equal(await can(u.get()), true, 'profile');
    assert.equal(await can(db.collection('users').where('companyId', '==', 'acme').where('role', '==', 'participant').get()), true, 'roster');
    // other company's admin sees nothing
    fake.signInAs('hrB');
    assert.equal(await can(u.collection('dailyLogs').doc('3').get()), false, 'other company shell');
    assert.equal(await can(u.get()), false, 'other company profile');
  });

  test(`[${mode}] participant cannot read another participant`, async () => {
    const { fake, db } = world(mode);
    fake.signInAs('bob');
    const u = db.collection('users').doc('amy');
    assert.equal(await can(u.get()), false);
    assert.equal(await can(u.collection('dailyLogs').doc('3').get()), false);
    assert.equal(await can(u.collection('dailyLogs').doc('3').collection('private').doc('data').get()), false);
    assert.equal(await can(db.collection('companies').doc('acme').collection('aggregates').doc('days1').get()), false, 'participants do not read totals');
  });
}

test('[final] admin get is refused on a shell that still holds private fields; no list', async () => {
  const { fake, db, FV } = world('final');
  fake.put('users/amy/dailyLogs/4', { completed: true, stress: 9, notes: 'leaked?', savedAt: FV.serverTimestamp() });
  fake.signInAs('hr');
  const logs = db.collection('users').doc('amy').collection('dailyLogs');
  assert.equal(await can(logs.doc('4').get()), false, 'legacy shell get');
  assert.equal(await can(logs.doc('15').get()), true, 'missing doc get is allowed (returns not found)');
  assert.equal(await can(logs.get()), false, 'list');
  assert.equal(await can(db.collection('users').doc('amy').collection('assessments').doc('pre').get()), false, 'survey shell');
});

test('[transitional] old dashboard reads still work; [final] they are cut', async () => {
  for (const [mode, expect] of [['transitional', true], ['final', false]]) {
    const { fake, db } = world(mode);
    fake.signInAs('hr');
    assert.equal(await can(db.collection('users').doc('amy').collection('dailyLogs').get()), expect, mode + ' list');
    assert.equal(await can(db.collection('users').doc('amy').collection('assessments').doc('pre').get()), expect, mode + ' survey shell');
  }
});

test('[final] shell writes are engagement-only; user doc cannot carry savings or protected fields', async () => {
  const { fake, db } = world('final');
  fake.signInAs('amy');
  const u = db.collection('users').doc('amy');
  assert.equal(await can(u.collection('dailyLogs').doc('5').set({ completed: true, savedAt: 1 })), true);
  assert.equal(await can(u.collection('dailyLogs').doc('5').set({ completed: true, stress: 4 }, { merge: true })), false, 'stress on shell');
  assert.equal(await can(u.collection('assessments').doc('post').set({ completedAt: 1, responses: { stress: 3 } })), false, 'responses on shell');
  assert.equal(await can(u.update({ savingsEntries: [{ amount: 5 }] })), false, 'savings on user doc');
  assert.equal(await can(u.update({ companyId: 'beta' })), false, 'change company');
  assert.equal(await can(u.update({ migrator: true })), false, 'self-grant migrator');
  assert.equal(await can(u.update({ inviteCode: 'X' })), false, 'change invite code');
  assert.equal(await can(u.update({ breathingSessions: 4 })), true, 'normal update');
});

test('[transitional] dual-write shapes accepted', async () => {
  const { fake, db } = world('transitional');
  fake.signInAs('amy');
  const u = db.collection('users').doc('amy');
  assert.equal(await can(u.collection('dailyLogs').doc('5').set({ completed: true, stress: 4, notes: 'n', sleep: 3, steps: 1, savedAt: 1 })), true);
  assert.equal(await can(u.update({ savingsEntries: [], savingsRev: 1 })), true);
  assert.equal(await can(u.collection('dailyLogs').doc('5').set({ junk: 1 })), false, 'unknown field');
});

// aggregate write helper: what Aggregates.reconcile sends
function aggBatch(db, FV, uid, cid, bucket, ledger, agg) {
  const b = db.batch();
  if (ledger) b.set(db.collection('users').doc(uid).collection('aggLedger').doc(bucket), ledger, { merge: true });
  if (agg) b.set(db.collection('companies').doc(cid).collection('aggregates').doc(bucket), agg, { merge: true });
  return b.commit();
}

test('[final] aggregates: participants can only move their own single contribution', async () => {
  const { fake, db, FV } = world('final');
  const inc = FV.increment;
  fake.signInAs('amy');
  // legit first contribution: Day 3 stress 7
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', { d3: 7, op: 'op000001' }, { sum_d3: inc(7), n_d3: inc(1), op: 'op000001' })), true, 'legit create');
  // legit edit 7 -> 4
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', { d3: 4, op: 'op000002' }, { sum_d3: inc(-3), op: 'op000002' })), true, 'legit edit');
  // inflation: aggregate without ledger
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', null, { sum_d3: inc(10), n_d3: inc(1), op: 'op000003' })), false, 'agg without ledger');
  // inflation: ledger value out of range
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', { d3: 50, op: 'op000004' }, { sum_d3: inc(46), op: 'op000004' })), false, 'out of range');
  // inflation: agg moves more than ledger
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', { d3: 5, op: 'op000005' }, { sum_d3: inc(9), op: 'op000005' })), false, 'mismatched delta');
  // inflation: count bump
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', { d3: 5, op: 'op000006' }, { sum_d3: inc(1), n_d3: inc(5), op: 'op000006' })), false, 'count bump');
  // wipe: set sum to 0 directly
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', { d3: 0, op: 'op000007' }, { sum_d3: 0, n_d3: 0, op: 'op000007' })), true, 'removing own contribution (4 -> 0) is allowed');
  fake.signInAs('bob');
  assert.equal(await can(aggBatch(db, FV, 'bob', 'acme', 'days1', { d3: 0, op: 'op000008' }, { sum_d3: inc(-4), op: 'op000008' })), false, 'cannot remove someone else');
  // ledger alone (reset own ledger to re-add later)
  fake.signInAs('amy');
  await aggBatch(db, FV, 'amy', 'acme', 'days1', { d3: 6, op: 'op000009' }, { sum_d3: inc(6), n_d3: inc(1), op: 'op000009' });
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', { d3: 0, op: 'op000010' }, null)), false, 'ledger alone');
  assert.equal(await can(db.collection('users').doc('amy').collection('aggLedger').doc('days1').delete()), false, 'ledger delete');
  assert.equal(await can(db.collection('companies').doc('acme').collection('aggregates').doc('days1').delete()), false, 'agg delete');
  // unknown field / wrong bucket key
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', { d9: 5, op: 'op000011' }, { sum_d9: inc(5), n_d9: inc(1), op: 'op000011' })), false, 'key from another bucket');
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'days1', { d2: 5, op: 'op000012' }, { sum_d2: inc(5), n_d2: inc(1), junk: 'x', op: 'op000012' })), false, 'junk field');
  // other company
  assert.equal(await can(aggBatch(db, FV, 'amy', 'beta', 'days1', { d2: 5, op: 'op000013' }, { sum_d2: inc(5), n_d2: inc(1), op: 'op000013' })), false, 'other company');
  // individual (no company)
  fake.signInAs('ivy');
  assert.equal(await can(aggBatch(db, FV, 'ivy', 'acme', 'days1', { d2: 5, op: 'op000014' }, { sum_d2: inc(5), n_d2: inc(1), op: 'op000014' })), false, 'individual');
  // admin cannot write, even "as a participant"
  fake.signInAs('hr');
  assert.equal(await can(aggBatch(db, FV, 'hr', 'acme', 'days1', { d2: 5, op: 'op000015' }, { sum_d2: inc(5), n_d2: inc(1), op: 'op000015' })), false, 'admin write');
  assert.equal(await can(db.collection('companies').doc('acme').collection('aggregates').doc('days1').set({ sum_d3: 0 }, { merge: true })), false, 'admin direct write');
  assert.equal(await can(db.collection('companies').doc('acme').collection('aggregates').doc('days1').get()), true, 'admin read');
  const agg = fake.read('companies/acme/aggregates/days1');
  assert.equal(agg.sum_d3, 6); assert.equal(agg.n_d3, 1);
  // savings bound
  fake.signInAs('amy');
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'savings', { cents: 100000001, op: 'op000016' }, { sum_cents: inc(100000001), n_cents: inc(1), op: 'op000016' })), false, 'savings over bound');
  assert.equal(await can(aggBatch(db, FV, 'amy', 'acme', 'savings', { cents: 5000, op: 'op000017' }, { sum_cents: inc(5000), n_cents: inc(1), op: 'op000017' })), true, 'savings');
});

test('[final] seat cap: join within cap, refused when full or without a seat claim', async () => {
  const { fake, db, FV } = world('final');
  const join = (uid, code, cid, extra) => {
    fake.signInAs(uid);
    const b = db.batch();
    b.set(db.collection('users').doc(uid), Object.assign({ role: 'participant', companyId: cid, inviteCode: code, name: uid }, extra || {}));
    b.update(db.collection('inviteCodes').doc(code), { seatsUsed: FV.increment(1) });
    return b.commit();
  };
  assert.equal(await can(join('cara', 'ACME01', 'acme')), true, 'seat 3 of 3');
  assert.equal(fake.read('inviteCodes/ACME01').seatsUsed, 3);
  assert.equal(await can(join('dan', 'ACME01', 'acme')), false, 'seat 4 of 3');
  // user doc with company but no seat claim
  fake.signInAs('eve');
  assert.equal(await can(db.collection('users').doc('eve').set({ role: 'participant', companyId: 'acme', inviteCode: 'ACME01' })), false, 'no seat claim');
  assert.equal(await can(db.collection('users').doc('eve').set({ role: 'participant', companyId: 'acme' })), false, 'company without code');
  // seat bump without creating own user doc / bump twice
  assert.equal(await can(db.collection('inviteCodes').doc('ACME01').update({ seatsUsed: FV.increment(-1) })), false, 'free a seat');
  fake.put('inviteCodes/BIG', { companyId: 'acme', active: true, maxSeats: 50, seatsUsed: 0 });
  fake.signInAs('cara');
  assert.equal(await can(db.collection('inviteCodes').doc('BIG').update({ seatsUsed: FV.increment(1) })), false, 'existing user burns a seat');
  fake.signInAs('fay');
  const b = db.batch();
  b.set(db.collection('users').doc('fay'), { role: 'participant', companyId: 'acme', inviteCode: 'BIG' });
  b.update(db.collection('inviteCodes').doc('BIG'), { seatsUsed: FV.increment(2) });
  assert.equal(await can(b.commit()), false, 'take two seats');
  // code/company mismatch, inactive code, raising maxSeats
  fake.put('inviteCodes/OLD', { companyId: 'acme', active: false, maxSeats: 50, seatsUsed: 0 });
  assert.equal(await can(join('gus', 'BIG', 'beta')), false, 'code for another company');
  assert.equal(await can(join('hal', 'OLD', 'acme')), false, 'inactive code');
  fake.signInAs('ian');
  const c = db.batch();
  c.set(db.collection('users').doc('ian'), { role: 'participant', companyId: 'acme', inviteCode: 'BIG' });
  c.update(db.collection('inviteCodes').doc('BIG'), { seatsUsed: FV.increment(1), maxSeats: 999 });
  assert.equal(await can(c.commit()), false, 'raise maxSeats');
  assert.equal(await can(join('jo', 'BIG', 'acme', { migrator: true })), false, 'sign up as migrator');
  assert.equal(await can(join('kim', 'BIG', 'acme')), true, 'normal join');
  // legacy code without seat fields: no cap, counter starts
  fake.put('inviteCodes/LEGACY', { companyId: 'acme', active: true });
  assert.equal(await can(join('lee', 'LEGACY', 'acme')), true, 'legacy code');
  assert.equal(fake.read('inviteCodes/LEGACY').seatsUsed, 1);
  // individuals still sign up freely
  fake.signInAs('max');
  assert.equal(await can(db.collection('users').doc('max').set({ role: 'participant', companyId: null })), true, 'individual');
  // admins: list + manage own company's codes only
  fake.signInAs('hr');
  assert.equal(await can(db.collection('inviteCodes').where('companyId', '==', 'acme').where('active', '==', true).get()), true, 'admin list own');
  assert.equal(await can(db.collection('inviteCodes').doc('NEW1').set({ companyId: 'beta', active: true })), false, 'admin mints for other company');
  assert.equal(await can(db.collection('inviteCodes').doc('NEW2').set({ companyId: 'acme', active: true, maxSeats: 25, seatsUsed: 0 })), true, 'admin mints own');
  fake.signInAs('hrB');
  assert.equal(await can(db.collection('inviteCodes').doc('NEW2').update({ active: false })), false, 'other admin deactivates');
  fake.signOut();
  assert.equal(await can(db.collection('inviteCodes').doc('NEW2').get()), true, 'public get');
  assert.equal(await can(db.collection('inviteCodes').where('companyId', '==', 'acme').get()), false, 'public list');
});

test('migrator branch exists only in the transitional rules', async () => {
  for (const [mode, expect] of [['transitional', true], ['final', false]]) {
    const { fake, db } = world(mode);
    fake.signInAs('scott');
    assert.equal(await can(db.collection('users').doc('amy').collection('dailyLogs').doc('3').collection('private').doc('data').get()), expect, mode);
    assert.equal(await can(db.collection('users').doc('amy').collection('private').doc('margin').get()), false, mode + ' margin never');
  }
});

// ---------------------------------------------------------------- 3) flows
test('app paths: dual write, lean fallback under final rules, merged reads', async () => {
  for (const mode of ['transitional', 'final']) {
    const app = loadApp(mode);
    app.fake.put('users/amy', { role: 'participant', companyId: 'acme', name: 'Amy' });
    app.fake.signInAs('amy');
    await app.Privacy.saveDailyLog('amy', 3, { completed: true, action: false, breathing: true, meal: false, stress: 6, sleep: 7, steps: 5000, notes: 'hi' });
    const shell = app.fake.read('users/amy/dailyLogs/3');
    const priv = app.fake.read('users/amy/dailyLogs/3/private/data');
    assert.equal(priv.stress, 6); assert.equal(priv.notes, 'hi');
    if (mode === 'transitional') assert.equal(shell.stress, 6, 'dual write');
    else assert.equal(shell.stress, undefined, 'lean fallback');
    const logs = await app.Privacy.loadDailyLogs('amy');
    assert.equal(logs['3'].stress, 6); assert.equal(logs['3'].completed, true); assert.equal(logs['3'].notes, 'hi');
    await app.Privacy.saveAssessment('amy', 'pre', { stress: 8, sleep: 4 });
    assert.deepEqual((await app.Privacy.loadAssessment('amy', 'pre')).responses, { stress: 8, sleep: 4 });
    await app.Privacy.saveSavings('amy', [{ amount: 25, iso: '2026-10-01' }]);
    assert.equal((await app.Privacy.loadSavings('amy'))[0].amount, 25);
    assert.equal(app.fake.read('users/amy').savingsEntries === undefined, mode === 'final');
  }
});

test('reads fall back to pre-split data and prefer the newer copy', async () => {
  const app = loadApp('transitional');
  const FV = app.firebase.firestore.FieldValue;
  app.fake.put('users/amy', { role: 'participant', companyId: null, savingsEntries: [{ amount: 40 }] });
  app.fake.put('users/amy/dailyLogs/1', { completed: true, stress: 5, notes: 'old', savedAt: FV.serverTimestamp() });
  app.fake.put('users/amy/assessments/pre', { responses: { stress: 9 }, completedAt: FV.serverTimestamp() });
  // day 2: private written first, then an older app edited the shell (newer)
  app.fake.put('users/amy/dailyLogs/2/private/data', { stress: 3, notes: 'p', savedAt: FV.serverTimestamp() });
  app.fake.put('users/amy/dailyLogs/2', { completed: true, stress: 8, notes: 'shell newer', savedAt: FV.serverTimestamp() });
  app.fake.signInAs('amy');
  const logs = await app.Privacy.loadDailyLogs('amy');
  assert.equal(logs['1'].stress, 5); assert.equal(logs['1'].notes, 'old');
  assert.equal(logs['2'].stress, 8); assert.equal(logs['2'].notes, 'shell newer');
  assert.equal((await app.Privacy.loadAssessment('amy', 'pre')).responses.stress, 9);
  assert.equal((await app.Privacy.loadSavings('amy'))[0].amount, 40);
});

test('aggregate reconcile: idempotent, edits move by the delta, failures go pending and retry', async () => {
  const app = loadApp('final');
  app.fake.put('users/amy', { role: 'participant', companyId: 'acme' });
  app.fake.put('users/bob', { role: 'participant', companyId: 'acme' });
  app.fake.signInAs('amy');
  const A = app.Aggregates;
  assert.equal(await A.reconcile('amy', 'acme', 'days1', { d3: 7 }), true);
  assert.equal(await A.reconcile('amy', 'acme', 'days1', { d3: 7 }), true, 'no-op');
  assert.equal(await A.reconcile('amy', 'acme', 'days1', { d3: 4, d5: 9 }), true);
  app.fake.signInAs('bob');
  assert.equal(await A.reconcile('bob', 'acme', 'days1', { d3: 2 }), true);
  let agg = app.fake.read('companies/acme/aggregates/days1');
  assert.equal(agg.sum_d3, 6); assert.equal(agg.n_d3, 2); assert.equal(agg.sum_d5, 9); assert.equal(agg.n_d5, 1);
  // clearing a value removes the count
  assert.equal(await A.reconcile('bob', 'acme', 'days1', { d3: 0 }), true);
  agg = app.fake.read('companies/acme/aggregates/days1');
  assert.equal(agg.sum_d3, 4); assert.equal(agg.n_d3, 1);
  // a failing write (signed out) goes pending, retry heals
  app.fake.signOut();
  assert.equal(await A.reconcile('bob', 'acme', 'pre', { stress: 5 }), false);
  assert.deepEqual(A.getPending('bob'), ['pre']);
  app.fake.signInAs('bob');
  const bob = { id: 'bob', companyId: 'acme' };
  await A.reconcileOnLoad(bob, {
    daily: async () => ({ '3': { stress: 0 } }),
    survey: async t => (t === 'pre' ? { responses: { stress: 5, sleep: 6 } } : null),
    savingsTotal: () => 12.34
  });
  assert.deepEqual(A.getPending('bob'), []);
  const pre = app.fake.read('companies/acme/aggregates/pre');
  assert.equal(pre.sum_stress, 5); assert.equal(pre.n_stress, 1); assert.equal(pre.sum_sleep, 6);
  assert.equal(app.fake.read('companies/acme/aggregates/savings').sum_cents, 1234);
  // averages on the dashboard side
  assert.equal(A.avgOf(pre, 'stress'), 5);
  assert.equal(A.stressOver({ days1: app.fake.read('companies/acme/aggregates/days1') }, 0, 7).avg, (4 + 9) / 2);
});

function seedLegacy(fake, FV) {
  // pre-split shapes, as the live app (sw v12) wrote them
  fake.put('users/scott', { role: 'admin', companyId: 'acme', migrator: true });
  fake.put('users/hr', { role: 'admin', companyId: 'acme' });
  const people = [
    ['amy', 'acme', [7, 6, 5], { stress: 8, sleep: 4, financial: 3 }, [{ amount: 100 }, { amount: -20 }]],
    ['bob', 'acme', [4, null, 3], { stress: 6, sleep: 6, financial: 5 }, [{ amount: 60.5 }]],
    ['cat', 'acme', [9, 9, 8], { stress: 9, sleep: 2, financial: 2 }, []],
    ['ivy', null, [2, 2, 2], { stress: 3 }, [{ amount: 10 }]]
  ];
  people.forEach(([id, cid, stresses, pre, sav]) => {
    fake.put('users/' + id, { role: 'participant', companyId: cid, name: id, savingsEntries: sav, inviteCode: cid ? 'ACME01' : undefined });
    stresses.forEach((s, d) => {
      const log = { completed: true, breathing: d % 2 === 0, meal: false, sleep: 5, steps: 3000, notes: id + ' day ' + d, savedAt: FV.serverTimestamp() };
      if (s != null) log.stress = s;
      fake.put('users/' + id + '/dailyLogs/' + d, log);
    });
    fake.put('users/' + id + '/assessments/pre', { responses: pre, completedAt: FV.serverTimestamp() });
  });
}

test('migration: dry run writes nothing; run copies + replays; rerun does not double count; strip + verify; app reads survive', async () => {
  const app = loadApp('transitional');
  const FV = app.firebase.firestore.FieldValue;
  seedLegacy(app.fake, FV);
  const before = JSON.stringify(app.fake.dump());
  app.fake.signInAs('scott');
  const mig = createMigrator({ db: app.db, firebase: app.firebase, Aggregates: app.Aggregates, Privacy: app.Privacy });

  const dry = await mig.run({ mode: 'dry' });
  assert.equal(JSON.stringify(app.fake.dump()), before, 'dry run is read-only');
  assert.equal(dry.errors.length, 0, dry.errors.join('; '));
  assert.equal(dry.dailyToStrip, 12); assert.equal(dry.surveysToStrip, 4); assert.equal(dry.userDocsToStrip, 4);
  assert.ok(dry.backup.amy.dailyLogs['0'].shell.notes === 'amy day 0', 'backup holds the data');

  const r1 = await mig.run({ mode: 'run' });
  assert.equal(r1.errors.length, 0, r1.errors.join('; '));
  assert.equal(r1.dailyCopied, 12); assert.equal(r1.surveysCopied, 4); assert.equal(r1.savingsCopied, 4);
  assert.equal(app.fake.read('users/amy/dailyLogs/0/private/data').notes, 'amy day 0');
  assert.equal(app.fake.read('users/amy/dailyLogs/0').notes, 'amy day 0', 'no strip yet');
  const days = app.fake.read('companies/acme/aggregates/days1');
  assert.equal(days.sum_d0, 7 + 4 + 9); assert.equal(days.n_d0, 3);
  assert.equal(days.sum_d1, 6 + 9); assert.equal(days.n_d1, 2);
  const pre = app.fake.read('companies/acme/aggregates/pre');
  assert.equal(pre.sum_stress, 8 + 6 + 9); assert.equal(pre.n_stress, 3);
  assert.equal(app.fake.read('companies/acme/aggregates/savings').sum_cents, 8000 + 6050);
  assert.equal(app.fake.read('companies/acme/aggregates/savings').n_cents, 2);
  assert.equal(app.fake.read('users/ivy/aggLedger/days1'), null, 'individuals are not aggregated');

  // a participant edits after migration (dual-write app), then the rerun
  app.fake.signInAs('amy');
  await app.Privacy.saveDailyLog('amy', 1, { completed: true, stress: 2, sleep: 5, steps: 0, notes: 'edited', breathing: false, meal: false, action: false });
  await app.Aggregates.reconcile('amy', 'acme', 'days1', { d1: 2 });
  app.fake.signInAs('scott');
  const r2 = await mig.run({ mode: 'run' });
  assert.equal(r2.errors.length, 0, r2.errors.join('; '));
  const days2 = app.fake.read('companies/acme/aggregates/days1');
  assert.equal(days2.sum_d0, 20, 'rerun does not double count');
  assert.equal(days2.sum_d1, 2 + 9, 'edit counted once');
  assert.equal(app.fake.read('users/amy/dailyLogs/1/private/data').notes, 'edited', 'newer private kept');

  // final pass
  const r3 = await mig.run({ mode: 'run', strip: true });
  assert.equal(r3.errors.length, 0, r3.errors.join('; '));
  const v = await mig.verify();
  assert.deepEqual(v.legacyDailyShells, []); assert.deepEqual(v.legacySurveyShells, []); assert.deepEqual(v.legacyUserDocs, []);
  assert.deepEqual(v.aggMismatches, []);
  assert.deepEqual(Object.keys(app.fake.read('users/amy/dailyLogs/0')).sort(), ['breathing', 'completed', 'meal', 'savedAt']);
  assert.equal(app.fake.read('users/amy').savingsEntries, undefined);

  // final rules: participant app still sees everything; admin sees engagement only
  app.fake.setMode('final');
  app.fake.signInAs('amy');
  const logs = await app.Privacy.loadDailyLogs('amy');
  assert.equal(logs['0'].stress, 7); assert.equal(logs['0'].notes, 'amy day 0'); assert.equal(logs['1'].stress, 2);
  assert.equal((await app.Privacy.loadAssessment('amy', 'pre')).responses.financial, 3);
  assert.deepEqual((await app.Privacy.loadSavings('amy')).map(e => e.amount), [100, -20]);
  app.fake.signInAs('hr');
  assert.equal(await can(app.db.collection('users').doc('amy').collection('dailyLogs').doc('0').get()), true);
  assert.equal(await can(app.db.collection('users').doc('amy').collection('dailyLogs').doc('0').collection('private').doc('data').get()), false);
  // scott is just an admin now
  app.fake.signInAs('scott');
  assert.equal(await can(app.db.collection('users').doc('amy').collection('private').doc('savings').get()), false);
});

test('migration keeps the latest savings when an older app edited the user-doc copy', async () => {
  const app = loadApp('transitional');
  app.fake.put('users/scott', { role: 'admin', companyId: 'acme', migrator: true });
  app.fake.put('users/amy', { role: 'participant', companyId: null, savingsEntries: [{ amount: 1 }, { amount: 2 }], savingsRev: 111 });
  app.fake.put('users/amy/private/savings', { entries: [{ amount: 1 }], rev: 111 });
  app.fake.put('users/bob', { role: 'participant', companyId: null, savingsEntries: [{ amount: 5 }] });
  app.fake.put('users/bob/private/savings', { entries: [{ amount: 5 }, { amount: 6 }], rev: 222 });
  app.fake.signInAs('scott');
  const mig = createMigrator({ db: app.db, firebase: app.firebase, Aggregates: app.Aggregates, Privacy: app.Privacy });
  await mig.run({ mode: 'run', strip: true });
  assert.deepEqual(app.fake.read('users/amy/private/savings').entries.map(e => e.amount), [1, 2], 'user doc newer');
  assert.deepEqual(app.fake.read('users/bob/private/savings').entries.map(e => e.amount), [5, 6], 'private newer');
});
