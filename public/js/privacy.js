// Privacy field split (design: Basecamp/assets/bmm/app-specs/BMM_PRIVACY_FIELD_SPLIT_DESIGN_2026-08-21.md).
// Company admins may read the engagement SHELLS (dailyLogs/{day}, assessments/{type})
// and the user doc. Everything personal lives in owner-only subdocs the rules never
// open to an admin:
//   users/{uid}/dailyLogs/{day}/private/data    stress, sleep, steps, notes
//   users/{uid}/assessments/{type}/private/data  responses
//   users/{uid}/private/savings                  entries (Peace of Mind Account)
// Reads merge shell + private so data written before the split still shows up.
const Privacy = (() => {
  // Dual-write window. While true, the app ALSO writes the private fields to their
  // old locations (shell docs, user doc) so a hosting rollback or the old dashboard
  // keeps working mid-cohort. Flip to false before the final rules go out (see the
  // deploy order in CLAUDE.md). If the server already enforces the final rules, a
  // dual write is refused and the app retries the lean write on its own.
  const LEGACY_DUAL_WRITE = false;

  const DAILY_PRIVATE = ['stress', 'sleep', 'steps', 'notes'];
  const DAILY_SHELL = ['completed', 'action', 'breathing', 'meal'];

  function userRef(uid) { return db.collection('users').doc(uid); }
  function dailyRef(uid, day) { return userRef(uid).collection('dailyLogs').doc(String(day)); }
  function dailyPrivateRef(uid, day) { return dailyRef(uid, day).collection('private').doc('data'); }
  function assessRef(uid, type) { return userRef(uid).collection('assessments').doc(type); }
  function assessPrivateRef(uid, type) { return assessRef(uid, type).collection('private').doc('data'); }
  function savingsRef(uid) { return userRef(uid).collection('private').doc('savings'); }

  const millis = ts => (ts && typeof ts.toMillis === 'function') ? ts.toMillis() : 0;
  const hasAny = (obj, fields) => !!obj && fields.some(f => obj[f] !== undefined);

  // One day's record as the participant sees it. The private subdoc wins, except
  // when an older app version edited the shell after the private doc was written
  // (shell savedAt strictly newer): then the shell's copy is the latest.
  function mergeDaily(shell, priv) {
    const out = Object.assign({}, shell || {});
    if (!priv) return out;
    const shellNewer = hasAny(shell, DAILY_PRIVATE) && millis(shell.savedAt) > millis(priv.savedAt);
    if (!shellNewer) DAILY_PRIVATE.forEach(f => { if (priv[f] !== undefined) out[f] = priv[f]; });
    return out;
  }

  // Reads every day shell plus its private subdoc. Returns { "<day>": merged }.
  async function loadDailyLogs(uid) {
    const snap = await userRef(uid).collection('dailyLogs')
      .orderBy(firebase.firestore.FieldPath.documentId())
      .get();
    const shells = {};
    snap.forEach(doc => { shells[doc.id] = doc.data(); });
    const ids = Object.keys(shells);
    const privs = await Promise.all(ids.map(id =>
      dailyPrivateRef(uid, id).get().then(d => (d.exists ? d.data() : null)).catch(() => null)));
    const logs = {};
    ids.forEach((id, i) => { logs[id] = mergeDaily(shells[id], privs[i]); });
    return logs;
  }

  async function loadDailyLog(uid, day) {
    const [shell, priv] = await Promise.all([
      dailyRef(uid, day).get(),
      dailyPrivateRef(uid, day).get().catch(() => null)
    ]);
    if (!shell.exists && !(priv && priv.exists)) return null;
    return mergeDaily(shell.exists ? shell.data() : null, priv && priv.exists ? priv.data() : null);
  }

  // Runs a write built by build(dual). A dual write refused by the final rules
  // (permission-denied) is retried once without the legacy fields.
  async function commit(build) {
    if (!LEGACY_DUAL_WRITE) return build(false).commit();
    try {
      return await build(true).commit();
    } catch (err) {
      if (err && err.code === 'permission-denied') return build(false).commit();
      throw err;
    }
  }

  // data = { completed, action, breathing, meal, stress, sleep, steps, notes }
  async function saveDailyLog(uid, day, data) {
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    const shell = { savedAt: ts };
    const priv = { savedAt: ts };
    DAILY_SHELL.forEach(f => { if (data[f] !== undefined) shell[f] = data[f]; });
    DAILY_PRIVATE.forEach(f => { if (data[f] !== undefined) priv[f] = data[f]; });
    await commit(dual => {
      const batch = db.batch();
      const shellOut = Object.assign({}, shell);
      if (dual) DAILY_PRIVATE.forEach(f => { if (priv[f] !== undefined) shellOut[f] = priv[f]; });
      batch.set(dailyRef(uid, day), shellOut, { merge: true });
      batch.set(dailyPrivateRef(uid, day), priv, { merge: true });
      return batch;
    });
  }

  // Survey: { responses, completedAt } as before, whichever location holds it.
  async function loadAssessment(uid, type) {
    const [shell, priv] = await Promise.all([
      assessRef(uid, type).get(),
      assessPrivateRef(uid, type).get().catch(() => null)
    ]);
    const p = priv && priv.exists ? priv.data() : null;
    const s = shell.exists ? shell.data() : null;
    if (!s && !p) return null;
    const responses = (p && p.responses) || (s && s.responses) || null;
    if (!responses) return null;
    return { responses, completedAt: (s && s.completedAt) || (p && p.completedAt) || null };
  }

  async function saveAssessment(uid, type, responses) {
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    await commit(dual => {
      const batch = db.batch();
      batch.set(assessRef(uid, type), dual ? { responses, completedAt: ts } : { completedAt: ts });
      batch.set(assessPrivateRef(uid, type), { responses, completedAt: ts });
      return batch;
    });
  }

  // Peace of Mind entries. Private doc first; the user-doc array is the pre-split home.
  async function loadSavings(uid) {
    const priv = await savingsRef(uid).get().catch(() => null);
    if (priv && priv.exists && Array.isArray(priv.data().entries)) return priv.data().entries;
    const doc = await userRef(uid).get();
    return (doc.exists && doc.data() && doc.data().savingsEntries) || [];
  }

  async function saveSavings(uid, entries) {
    const rev = Date.now();
    await commit(dual => {
      const batch = db.batch();
      batch.set(savingsRef(uid), { entries, rev, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      if (dual) batch.update(userRef(uid), { savingsEntries: entries, savingsRev: rev });
      return batch;
    });
  }

  return {
    LEGACY_DUAL_WRITE, DAILY_PRIVATE, DAILY_SHELL,
    dailyRef, dailyPrivateRef, assessRef, assessPrivateRef, savingsRef,
    mergeDaily, loadDailyLogs, loadDailyLog, saveDailyLog,
    loadAssessment, saveAssessment, loadSavings, saveSavings
  };
})();
