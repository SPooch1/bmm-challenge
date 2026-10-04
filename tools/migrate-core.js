// One-time privacy migration (deploy steps 2 and 4 in CLAUDE.md). Runs in
// tools/migrate.html as Scott's account with `migrator: true` on its user doc,
// under the TRANSITIONAL rules. Never deployed (tools/ is outside public/).
//
// Per user:
//   1. copy  stress/sleep/steps/notes from each dailyLogs shell into
//            dailyLogs/{day}/private/data; survey responses into
//            assessments/{type}/private/data; user-doc savingsEntries into
//            private/savings. A private doc that is already newer is kept.
//   2. strip (only with strip: true, and only AFTER step 1 committed) the old
//            fields from the shells and the user doc.
//   3. replay (company participants) the person's data into the company
//            aggregates through their ledger, the same idempotent reconcile the
//            app uses, so re-running never double counts.
// mode: 'dry' (read + report only), 'run'. Returns a report; `backup` holds every
// doc read before any write (download it before running for real).
(function (root) {
  const DAILY_PRIVATE = ['stress', 'sleep', 'steps', 'notes'];

  function createMigrator(deps) {
    const { db, firebase, Aggregates, Privacy } = deps;
    const say = deps.log || (() => {});
    const FV = firebase.firestore.FieldValue;
    const millis = ts => (ts && typeof ts.toMillis === 'function') ? ts.toMillis() : 0;
    const pick = (o, fields) => { const r = {}; fields.forEach(f => { if (o && o[f] !== undefined) r[f] = o[f]; }); return r; };
    const ser = v => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === 'function' ? { _ts: x.toMillis() } : x)));

    async function migrateUser(userSnap, opts, report) {
      const uid = userSnap.id;
      const u = userSnap.data() || {};
      const userRef = db.collection('users').doc(uid);
      const dry = opts.mode !== 'run';
      const backup = report.backup[uid] = { user: ser(u), dailyLogs: {}, assessments: {}, savings: null };
      const copy = db.batch(); let copyOps = 0;
      const strip = []; // [ref, patch]

      // ---- daily logs ----
      const logs = {}; // merged view after the copy, for the replay
      const shells = await userRef.collection('dailyLogs').get();
      for (const doc of shells.docs) {
        const shell = doc.data() || {};
        const privRef = Privacy.dailyPrivateRef(uid, doc.id);
        const privSnap = await privRef.get();
        const priv = privSnap.exists ? privSnap.data() : null;
        backup.dailyLogs[doc.id] = { shell: ser(shell), private: priv ? ser(priv) : null };
        const legacy = pick(shell, DAILY_PRIVATE);
        let merged = Object.assign({}, priv || {});
        if (Object.keys(legacy).length) {
          const shellNewer = !priv || millis(shell.savedAt) > millis(priv.savedAt);
          const fill = {};
          Object.keys(legacy).forEach(f => { if (shellNewer || priv[f] === undefined) fill[f] = legacy[f]; });
          if (Object.keys(fill).length) {
            if (shellNewer) fill.savedAt = shell.savedAt || FV.serverTimestamp();
            copy.set(privRef, fill, { merge: true }); copyOps++;
            report.dailyCopied++;
            merged = Object.assign(merged, fill);
          }
          const del = {}; Object.keys(legacy).forEach(f => { del[f] = FV.delete(); });
          strip.push([doc.ref, del]); report.dailyToStrip++;
        }
        logs[doc.id] = merged;
      }

      // ---- surveys ----
      const surveys = {};
      const assess = await userRef.collection('assessments').get();
      for (const doc of assess.docs) {
        const shell = doc.data() || {};
        const privRef = Privacy.assessPrivateRef(uid, doc.id);
        const privSnap = await privRef.get();
        const priv = privSnap.exists ? privSnap.data() : null;
        backup.assessments[doc.id] = { shell: ser(shell), private: priv ? ser(priv) : null };
        surveys[doc.id] = (priv && priv.responses) ? priv : null;
        if (shell.responses) {
          if (!priv || !priv.responses) {
            copy.set(privRef, { responses: shell.responses, completedAt: shell.completedAt || FV.serverTimestamp() }); copyOps++;
            report.surveysCopied++;
            surveys[doc.id] = { responses: shell.responses };
          }
          strip.push([doc.ref, { responses: FV.delete() }]); report.surveysToStrip++;
        }
      }

      // ---- savings ----
      const savRef = Privacy.savingsRef(uid);
      const savSnap = await savRef.get();
      const sav = savSnap.exists ? savSnap.data() : null;
      backup.savings = sav ? ser(sav) : null;
      let entries = sav && Array.isArray(sav.entries) ? sav.entries : null;
      if (Array.isArray(u.savingsEntries)) {
        const differs = !sav || JSON.stringify(sav.entries || []) !== JSON.stringify(u.savingsEntries);
        // An older app version edited the user-doc copy after the last dual write
        // (same rev on both, different entries): the user doc is the latest.
        const userNewer = sav && differs && u.savingsRev != null && u.savingsRev === sav.rev;
        if (!sav || userNewer) {
          copy.set(savRef, { entries: u.savingsEntries, rev: Date.now(), updatedAt: FV.serverTimestamp() }); copyOps++;
          report.savingsCopied++;
          entries = u.savingsEntries;
        } else if (differs) {
          report.notes.push(uid + ': private savings kept (newer than the user-doc copy)');
        }
        const del = { savingsEntries: FV.delete(), privacyV: 2 };
        if (u.savingsRev !== undefined) del.savingsRev = FV.delete();
        strip.push([userRef, del]); report.userDocsToStrip++;
      } else if (u.savingsRev !== undefined || u.privacyV !== 2) {
        // Mark the doc clean (admin-readable) in the final pass
        const patch = { privacyV: 2 };
        if (u.savingsRev !== undefined) patch.savingsRev = FV.delete();
        strip.push([userRef, patch]);
      }

      if (!dry && copyOps) await copy.commit();
      if (!dry && opts.strip && strip.length) {
        const b = db.batch();
        strip.forEach(([ref, patch]) => b.update(ref, patch));
        await b.commit();
        report.stripped += strip.length;
      }

      // ---- aggregates replay ----
      if (u.companyId && u.role === 'participant') {
        const total = (entries || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const desired = {};
        Aggregates.DAY_BUCKETS.forEach(b => { desired[b] = Aggregates.dailyDesired(logs, b); });
        Aggregates.SURVEY_BUCKETS.forEach(b => { desired[b] = Aggregates.surveyDesired(b, surveys[b]); });
        desired.savings = Aggregates.savingsDesired(total);
        for (const b of Object.keys(desired)) {
          if (dry) {
            const l = await db.collection('users').doc(uid).collection('aggLedger').doc(b).get();
            const have = l.exists ? l.data() : {};
            const diff = Object.keys(desired[b]).filter(k => (have[k] || 0) !== desired[b][k]);
            if (diff.length) report.aggBucketsToReplay++;
          } else {
            const ok = await Aggregates.reconcile(uid, u.companyId, b, desired[b]);
            if (ok) report.aggBucketsReplayed++; else report.errors.push(uid + ': aggregate ' + b + ' failed');
          }
        }
      }
      report.users++;
    }

    async function run(opts) {
      opts = Object.assign({ mode: 'dry', strip: false }, opts || {});
      const report = {
        mode: opts.mode, strip: !!opts.strip, users: 0,
        dailyCopied: 0, dailyToStrip: 0, surveysCopied: 0, surveysToStrip: 0,
        savingsCopied: 0, userDocsToStrip: 0, stripped: 0,
        aggBucketsToReplay: 0, aggBucketsReplayed: 0, seatBackfills: [], errors: [], notes: [], backup: {}
      };
      const users = await db.collection('users').get();
      for (const snap of users.docs) {
        try {
          say('user ' + snap.id);
          await migrateUser(snap, opts, report);
        } catch (e) {
          report.errors.push(snap.id + ': ' + (e && e.message ? e.message : e));
        }
      }
      // Seat cap backfill: a code minted before seat counting has no seatsUsed,
      // so the people already in its cohort would not count. Set it to the
      // company's participant headcount (only when the company has one such code).
      try {
        const heads = {};
        users.docs.forEach(d => { const u = d.data() || {}; if (u.role === 'participant' && u.companyId) heads[u.companyId] = (heads[u.companyId] || 0) + 1; });
        const codes = await db.collection('inviteCodes').get();
        const legacy = codes.docs.filter(d => { const c = d.data() || {}; return c.active === true && c.companyId && typeof c.seatsUsed !== 'number'; });
        const byCo = {};
        legacy.forEach(d => { const cid = d.data().companyId; (byCo[cid] = byCo[cid] || []).push(d); });
        for (const cid of Object.keys(byCo)) {
          if (byCo[cid].length !== 1) { report.notes.push(cid + ': ' + byCo[cid].length + ' active codes without seatsUsed; set them by hand'); continue; }
          report.seatBackfills.push(byCo[cid][0].id + ' seatsUsed=' + (heads[cid] || 0));
          if (opts.mode === 'run') await byCo[cid][0].ref.update({ seatsUsed: heads[cid] || 0 });
        }
      } catch (e) {
        report.errors.push('seat backfill: ' + (e && e.message ? e.message : e));
      }
      return report;
    }

    // Verify: what an admin could still read, and whether each company's
    // aggregates equal the sum of its participants' ledgers.
    async function verify() {
      const out = { legacyDailyShells: [], legacySurveyShells: [], legacyUserDocs: [], unmarkedUserDocs: [], aggMismatches: [], companies: {} };
      const users = await db.collection('users').get();
      const sums = {}; // cid -> bucket -> field -> value
      for (const snap of users.docs) {
        const uid = snap.id, u = snap.data() || {};
        if (u.savingsEntries !== undefined) out.legacyUserDocs.push(uid);
        if (u.role === 'participant' && u.companyId && u.privacyV !== 2) out.unmarkedUserDocs.push(uid);
        const shells = await db.collection('users').doc(uid).collection('dailyLogs').get();
        shells.forEach(d => { if (DAILY_PRIVATE.some(f => d.data()[f] !== undefined)) out.legacyDailyShells.push(uid + '/' + d.id); });
        const as = await db.collection('users').doc(uid).collection('assessments').get();
        as.forEach(d => { if (d.data().responses !== undefined) out.legacySurveyShells.push(uid + '/' + d.id); });
        if (u.companyId && u.role === 'participant') {
          const c = sums[u.companyId] = sums[u.companyId] || {};
          for (const b of Object.keys(Aggregates.BUCKETS)) {
            const l = await db.collection('users').doc(uid).collection('aggLedger').doc(b).get();
            const have = l.exists ? l.data() : {};
            const bs = c[b] = c[b] || {};
            Aggregates.BUCKETS[b].forEach(k => {
              const v = Number(have[k]) || 0;
              bs['sum_' + k] = (bs['sum_' + k] || 0) + v;
              bs['n_' + k] = (bs['n_' + k] || 0) + (v > 0 ? 1 : 0);
            });
          }
        }
      }
      for (const cid of Object.keys(sums)) {
        out.companies[cid] = {};
        for (const b of Object.keys(sums[cid])) {
          const a = await db.collection('companies').doc(cid).collection('aggregates').doc(b).get();
          const agg = a.exists ? a.data() : {};
          Object.keys(sums[cid][b]).forEach(f => {
            if ((agg[f] || 0) !== sums[cid][b][f]) out.aggMismatches.push(cid + '/' + b + '.' + f + ' agg=' + (agg[f] || 0) + ' ledgers=' + sums[cid][b][f]);
          });
          out.companies[cid][b] = agg;
        }
      }
      return out;
    }

    return { run, verify };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createMigrator };
  else root.createMigrator = createMigrator;
})(typeof window !== 'undefined' ? window : globalThis);
