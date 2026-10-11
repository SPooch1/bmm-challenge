// Admin dashboard module
(async () => {
  const authScreen = document.getElementById('admin-auth');
  const dashboard = document.getElementById('dashboard');
  const authForm = document.getElementById('admin-auth-form');
  const errorEl = document.getElementById('admin-error');

  let adminData = null;
  let companyId = null;

  // ---- Demo mode: dashboard.html?demo=1 ----
  // A clearly labeled sample company with made-up data so Scott can show the HR
  // dashboard and the Day-21 summary on a sales call without real employee data.
  // No sign-in, no Firestore reads or writes. Everything is generated below.
  const DEMO = new URLSearchParams(window.location.search).get('demo') === '1';
  let demoAsOwner = false;

  // Auth
  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      errorEl.textContent = 'Invalid credentials.';
      errorEl.classList.add('visible');
    }
  });

  // Password reset
  document.getElementById('admin-forgot-link').addEventListener('click', async e => {
    e.preventDefault();
    const email = document.getElementById('admin-email').value.trim();
    if (!email) { errorEl.textContent = 'Enter your email first.'; errorEl.classList.add('visible'); return; }
    try {
      await auth.sendPasswordResetEmail(email);
      document.getElementById('admin-reset-sent').style.display = 'block';
      setTimeout(() => { document.getElementById('admin-reset-sent').style.display = 'none'; }, 5000);
    } catch (err) {
      errorEl.textContent = 'Could not send reset email.'; errorEl.classList.add('visible');
    }
  });

  function startDemo() {
    adminData = { role: 'admin', companyId: 'demo', name: 'Demo', cohortManager: demoAsOwner };
    companyId = 'demo';
    const stressCard = document.getElementById('m-avg-stress').closest('.metric-card');
    if (stressCard) stressCard.style.display = demoAsOwner ? '' : 'none';
    const assessTab = document.querySelector('.tab-btn[data-tab="assessments"]');
    if (assessTab) assessTab.style.display = demoAsOwner ? '' : 'none';
    const roadmapRow = document.getElementById('cohort-roadmap-row');
    if (roadmapRow) roadmapRow.style.display = demoAsOwner ? '' : 'none';
    document.getElementById('demo-as-hr').style.opacity = demoAsOwner ? '0.6' : '1';
    document.getElementById('demo-as-owner').style.opacity = demoAsOwner ? '1' : '0.6';
    authScreen.style.display = 'none';
    dashboard.style.display = 'block';
    document.getElementById('company-name').textContent = 'Sample Company (demo)';
    const demo = buildDemoData();
    participants = demo.participants;
    aggs = demo.aggs;
    assessmentsLoaded = false;
    document.getElementById('assessment-results').innerHTML = '<p style="color:var(--slate);font-size:0.8rem;">Click to load assessment data.</p>';
    renderMetrics();
    renderTable();
    updateTimestamp();
    renderInvite('DEMO25', { challengeStartDate: demo.startDate, maxSeats: 25, seatsUsed: participants.length, roadmap: false });
    if (demoAsOwner) renderFunnel({ signups: 40, src_book: 14, src_talk: 9, d0: 33, d1: 30, d2: 27, d3: 25, d4: 24, d5: 22, d6: 21, d7: 21, d8: 19, d9: 18, d10: 18, d11: 17, d12: 16, d13: 16, d14: 16, d15: 15, d16: 15, d17: 14, d18: 14, d19: 14, d20: 13, d21: 13, post: 11 });
    else document.getElementById('funnel-card').style.display = 'none';
  }

  // Deterministic made-up cohort: 12 people, Day 21, mixed completion. Names are
  // placeholders on purpose. Aggregates are built the same way the app would
  // have counted them (one rating per person per day), so every number ties out.
  function buildDemoData() {
    const seedRand = (() => { let x = 42; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; })();
    const names = ['Alex D.', 'Blair D.', 'Casey D.', 'Dana D.', 'Emery D.', 'Finley D.', 'Gray D.', 'Harper D.', 'Indigo D.', 'Jules D.', 'Kai D.', 'Lane D.'];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21);
    const pad = n => (n < 10 ? '0' : '') + n;
    const startDate = start.getFullYear() + '-' + pad(start.getMonth() + 1) + '-' + pad(start.getDate());
    const aggs = {};
    const add = (bucket, key, v) => { const a = aggs[bucket] = aggs[bucket] || {}; a['sum_' + key] = (a['sum_' + key] || 0) + v; a['n_' + key] = (a['n_' + key] || 0) + (v > 0 ? 1 : 0); };
    const people = names.map((name, i) => {
      // completion profile: most finish, a few fade out
      const lastDay = i < 8 ? 21 : i < 10 ? 10 + i : 4 + i;
      const skip = i % 4 === 1 ? 6 + i : -1; // one missed day for some
      const logs = {};
      const baseStress = 5 + (i % 4);
      for (let d = 0; d <= lastDay; d++) {
        if (d === skip) continue;
        logs[String(d)] = { completed: true, breathing: d % 2 === 0 || i % 3 === 0, meal: d % 3 === 0, action: d >= 17 && i % 2 === 0 };
        const stress = Math.max(1, Math.min(10, Math.round(baseStress - d * 0.12 + (seedRand() - 0.5) * 2)));
        add('d' + d, 'd' + d, stress);
      }
      const pre = { stress: baseStress + 1, sleep: 4 + (i % 3), financial: 3 + (i % 3), energy: 4 + (i % 2), overwhelm: 6 + (i % 3), savings: 2 + (i % 3), exercise: 3 + (i % 3), breathing: 2 + (i % 2), p_health: 4 + (i % 3), p_wealth: 3 + (i % 3), p_finwell: 3 + (i % 2), p_retsave: 3 + (i % 3), p_jobskills: 5 + (i % 2) };
      Object.keys(pre).forEach(k => add('pre', k, pre[k]));
      if (lastDay === 21 && i < 10) {
        // On purpose, the sample end-survey shows no improvement story: the same
        // numbers with small mixed wobble, so the demo shows the layout, not a result.
        const post = {};
        Object.keys(pre).forEach((k, j) => { post[k] = Math.max(1, Math.min(10, pre[k] + ((i + j) % 3) - 1)); });
        Object.keys(post).forEach(k => add('post', k, post[k]));
      }
      add('savings', 'cents', (150 + 50 * (i % 5)) * 100);
      const p = { id: 'demo' + i, name, email: 'person' + (i + 1) + '@example.com', challengeStartDate: startDate, breathingSessions: 4 + (i % 7), logs, engagementWeeks: {} };
      return p;
    });
    people.forEach(p => {
      const completedDays = Object.values(p.logs).filter(l => l.completed).length;
      p.currentDay = 21; p.elapsedDays = 21; p.completedDays = completedDays;
      p.completionPct = Math.min(100, Math.round((completedDays / 22) * 100));
      let streak = 0, graceUsed = false;
      for (let d = 21; d >= 0; d--) {
        const done = p.logs[String(d)] && p.logs[String(d)].completed;
        if (done) streak++; else if (d === 21) continue; else if (!graceUsed) { graceUsed = true; continue; } else break;
      }
      p.streak = streak;
      const logDays = Object.keys(p.logs).map(Number).sort((a, b) => b - a);
      p.lastCheckinDay = logDays[0]; p.lastCheckin = 'Day ' + logDays[0];
      p.daysSinceCheckin = 21 - logDays[0]; p.inactive = p.daysSinceCheckin >= 3;
    });
    return { participants: people, aggs, startDate };
  }

  auth.onAuthStateChanged(async user => {
    if (DEMO) return;
    if (!user) {
      authScreen.style.display = '';
      dashboard.style.display = 'none';
      return;
    }

    try {
      // Verify admin role
      const userDoc = await db.collection('users').doc(user.uid).get();

      if (!userDoc.exists || userDoc.data().role !== 'admin') {
        errorEl.textContent = 'Access denied. Admin account required.';
        errorEl.classList.add('visible');
        auth.signOut();
        return;
      }

      adminData = userDoc.data();
      // HR admins see engagement only: hide the cohort wellness views, which the
      // rules open to the program owner alone.
      if (!isProgramOwner()) {
        const stressCard = document.getElementById('m-avg-stress').closest('.metric-card');
        if (stressCard) stressCard.style.display = 'none';
        const assessTab = document.querySelector('.tab-btn[data-tab="assessments"]');
        if (assessTab) assessTab.style.display = 'none';
        const roadmapRow = document.getElementById('cohort-roadmap-row');
        if (roadmapRow) roadmapRow.style.display = 'none';
      }
      companyId = adminData.companyId;
      authScreen.style.display = 'none';
      dashboard.style.display = 'block';

      // Load company info
      if (companyId) {
        try {
          const compDoc = await db.collection('companies').doc(companyId).get();
          if (compDoc.exists) {
            document.getElementById('company-name').textContent = compDoc.data().name;
          }
        } catch (compErr) {
          console.warn('Could not load company:', compErr);
        }
      }

      // Load data
      try {
        await loadParticipants();
      } catch (partErr) {
        console.warn('Could not load participants:', partErr);
      }
      try {
        await loadInviteCode();
      } catch (invErr) {
        console.warn('Could not load invite codes:', invErr);
      }
      if (isProgramOwner()) {
        try { renderFunnel(await Funnel.readAll()); } catch (fErr) { console.warn('Could not load funnel counts:', fErr); }
      }
    } catch (err) {
      console.error('Dashboard auth error:', err);
      errorEl.textContent = 'Error loading dashboard: ' + err.message;
      errorEl.classList.add('visible');
    }
  });

  // Tabs
  let assessmentsLoaded = false;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      // Lazy-load assessments
      if (btn.dataset.tab === 'assessments' && !assessmentsLoaded && participants.length > 0) {
        assessmentsLoaded = true;
        loadAssessments();
      }
    });
  });

  // Participant data
  let participants = [];

  // Cohort aggregates (companies/{companyId}/aggregates/{bucket}): the ONLY source
  // of stress, survey and savings numbers on this dashboard. Participants keep them
  // current; per-person wellness data is owner-only in the rules.
  let aggs = {};
  // Averages over fewer people than this are hidden, so a tiny group cannot reveal
  // one person's answer. The rules enforce the same threshold on the raw counter
  // docs (an under-threshold doc is unreadable and loads as empty here).
  const MIN_GROUP = Aggregates.MIN_GROUP;

  // Program owner (Scott, cohortManager: true) prepares the Day-21 summary and is
  // the only account the rules let read the aggregates. HR admins never load them.
  function isProgramOwner() { return !!(adminData && adminData.cohortManager === true); }

  async function loadAggregates() {
    if (DEMO) return; // generated once in startDemo()
    aggs = {};
    if (!isProgramOwner()) return;
    const names = Object.keys(Aggregates.BUCKETS);
    const docs = await Promise.all(names.map(b =>
      db.collection('companies').doc(companyId).collection('aggregates').doc(b).get().catch(() => null)));
    names.forEach((b, i) => { aggs[b] = docs[i] && docs[i].exists ? docs[i].data() : {}; });
  }

  // Pooled stress average over challenge days lo..hi. The busiest day's count is a
  // lower bound on the distinct people behind it (one rating per person per day).
  function stressWindow(lo, hi) {
    const r = Aggregates.stressOver(aggs, lo, hi);
    let people = 0;
    for (let d = lo; d <= hi; d++) people = Math.max(people, Aggregates.countOf(aggs[Aggregates.dayBucket(d)], 'd' + d));
    return people >= MIN_GROUP ? r.avg : null;
  }

  async function loadParticipants() {
    // privacyV == 2 = the doc holds no wellness data; the rules only let an admin
    // read such docs, so the query must ask for exactly those. The migrator
    // account (Scott, during the migration window) sees every doc.
    let q = db.collection('users')
      .where('companyId', '==', companyId)
      .where('role', '==', 'participant');
    if (!(adminData && adminData.migrator === true)) q = q.where('privacyV', '==', 2);
    const snapshot = await q.get();

    participants = [];
    const promises = [];

    snapshot.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      participants.push(data);
      promises.push(loadParticipantLogs(data));
    });

    promises.push(loadAggregates().catch(err => console.warn('Could not load aggregates:', err)));
    await Promise.all(promises);
    renderMetrics();
    renderTable();
    updateTimestamp();
  }

  async function loadParticipantLogs(participant) {
    const userRef = db.collection('users').doc(participant.id);
    // Engagement shells only, one get per challenge day (Day 0-21). The rules
    // allow an admin get only on a shell that holds engagement fields, so there is
    // no collection query here. Only the engagement fields are kept.
    const dayIds = [];
    for (let d = 0; d <= 21; d++) dayIds.push(String(d));
    const [shells, engDoc] = await Promise.all([
      Promise.all(dayIds.map(id => userRef.collection('dailyLogs').doc(id).get().catch(() => null))),
      // Post-Day-21 engagement summary (dates only). Missing doc = no activity yet.
      userRef.collection('engagement').doc('weekly').get().catch(() => null)
    ]);
    participant.logs = {};
    shells.forEach((doc, i) => {
      if (!doc || !doc.exists) return;
      const l = doc.data() || {};
      participant.logs[dayIds[i]] = { completed: !!l.completed, breathing: !!l.breathing, meal: !!l.meal, action: l.action === true };
    });
    participant.engagementWeeks = (engDoc && engDoc.exists && engDoc.data() && engDoc.data().weeks) || {};

    // Calculate stats
    const completedDays = Object.values(participant.logs).filter(l => l.completed).length;
    // Same local-midnight day math as challenge.js calculateCurrentDay — the old
    // UTC version put an evening-US admin a day ahead of the participant app.
    const startDate = participant.challengeStartDate;
    let currentDay = 0;
    let elapsedDays = 0;
    if (startDate) {
      // Calendar-day arithmetic (UTC ordinals from local y/m/d) so DST never
      // shifts the day; identical to challenge.js calculateElapsedDay.
      const p = String(startDate).split('-').map(Number);
      const now = new Date();
      if (p.length === 3 && !p.some(isNaN)) {
        const diff = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000);
        elapsedDays = Math.max(0, diff);
        currentDay = Math.min(21, elapsedDays);
      }
    }

    participant.currentDay = currentDay;
    participant.elapsedDays = elapsedDays; // uncapped: > 21 = past the challenge
    participant.completedDays = completedDays;
    // Day 0 is completable: denominator = days elapsed (currentDay + 1), capped at
    // the 22 total days, clamped so it can never exceed 100%. Matches progress.js.
    participant.completionPct = Math.min(100, Math.round((completedDays / Math.min(currentDay + 1, 22)) * 100));

    // Streak — same forgiving algorithm as the participant side (progress.js):
    // today-not-yet-checked-in costs nothing, and one missed day of grace keeps
    // the streak alive, so admin and participant always show the same number.
    let streak = 0;
    let graceUsed = false;
    for (let d = currentDay; d >= 0; d--) {
      const done = participant.logs[String(d)] && participant.logs[String(d)].completed;
      if (done) {
        streak++;
      } else if (d === currentDay) {
        // Today not checked in yet — no penalty
        continue;
      } else if (!graceUsed) {
        // Forgive a single missed day and keep the streak alive
        graceUsed = true;
        continue;
      } else {
        break;
      }
    }
    participant.streak = streak;

    // Last check-in + inactive detection
    const logDays = Object.keys(participant.logs).map(Number).sort((a, b) => b - a);
    participant.lastCheckinDay = logDays.length > 0 ? logDays[0] : -1;
    participant.lastCheckin = logDays.length > 0 ? 'Day ' + logDays[0] : 'None';
    participant.daysSinceCheckin = participant.lastCheckinDay >= 0 ? currentDay - participant.lastCheckinDay : currentDay;
    participant.inactive = participant.daysSinceCheckin >= 3;
  }

  function updateTimestamp() {
    const el = document.getElementById('last-updated');
    if (el) {
      const now = new Date();
      el.textContent = 'Updated ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  function renderMetrics() {
    const total = participants.length;
    const activeToday = participants.filter(p => {
      const todayLog = p.logs[String(p.currentDay)];
      return todayLog && todayLog.completed;
    }).length;

    // Average stress = pooled cohort average over every check-in with a stress
    // rating (Days 0-21), from the aggregate counters. Hidden under MIN_GROUP people.
    const pooled = stressWindow(0, 21);
    const avgStress = pooled != null ? pooled.toFixed(1) : '—';

    const avgCompletion = total > 0
      ? Math.round(participants.reduce((sum, p) => sum + p.completionPct, 0) / total)
      : 0;

    const atRisk = participants.filter(p => p.inactive).length;

    document.getElementById('m-participants').textContent = total;
    document.getElementById('m-active').textContent = total > 0 ? Math.round((activeToday / total) * 100) + '%' : '0%';
    document.getElementById('m-avg-stress').textContent = avgStress;
    document.getElementById('m-completion').textContent = avgCompletion + '%';

    // Engagement chart
    renderEngagementChart();

    // After Day 21: still active?
    renderPostChallenge();

    // At-risk indicator
    const atRiskEl = document.getElementById('m-at-risk');
    if (atRiskEl) {
      atRiskEl.textContent = atRisk;
      atRiskEl.style.color = atRisk > 0 ? 'var(--red)' : 'var(--green)';
    }
  }

  // ---- After Day 21: share of graduates active 3+ days a week ----
  const ACTIVE_DAYS_PER_WEEK = 3;
  const ordinal = k => { const p = String(k).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  const keyFromOrdinal = o => new Date(o).toISOString().slice(0, 10);
  const mondayOf = k => keyFromOrdinal(ordinal(k) - (((new Date(ordinal(k)).getUTCDay() + 6) % 7) * 86400000));

  // Per graduate: complete post-Day-21 calendar weeks (Mon-Sun) with active-day
  // counts, indexed week 1, 2, 3... from the first Monday on or after Day 22.
  function postChallengeStats() {
    const now = new Date();
    const todayOrd = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const graduates = participants.filter(p => p.elapsedDays > 21 && p.challengeStartDate);
    const perPerson = graduates.map(p => {
      const day22 = keyFromOrdinal(ordinal(p.challengeStartDate) + 22 * 86400000);
      const firstMonday = mondayOf(day22) < day22 ? keyFromOrdinal(ordinal(mondayOf(day22)) + 7 * 86400000) : mondayOf(day22);
      const weeks = [];
      for (let n = 0; n < 1040; n++) { // every complete week to date (20-year safety cap)
        const monOrd = ordinal(firstMonday) + n * 7 * 86400000;
        if (monOrd + 7 * 86400000 > todayOrd) break; // week not complete yet
        const monKey = keyFromOrdinal(monOrd);
        const w = p.engagementWeeks[monKey];
        // Count only well-formed dates that fall inside this week with value === true;
        // the doc is participant-written, so anything else is ignored.
        const days = (w && w.days && typeof w.days === 'object') ? w.days : {};
        const activeDays = Object.keys(days).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k) && days[k] === true
          && ordinal(k) >= monOrd && ordinal(k) < monOrd + 7 * 86400000).length;
        weeks.push({ n: n + 1, activeDays });
      }
      return { p, weeks };
    });
    return { graduates: graduates.length, perPerson };
  }

  function renderPostChallenge() {
    const headline = document.getElementById('post-headline');
    const chart = document.getElementById('post-chart');
    const labels = document.getElementById('post-chart-labels');
    const note = document.getElementById('post-note');
    if (!headline) return;
    const stats = postChallengeStats();
    participants.postStats = stats;
    if (stats.graduates === 0) {
      headline.textContent = 'No one has passed Day 21 yet.';
      chart.style.display = 'none'; labels.style.display = 'none'; note.style.display = 'none';
      return;
    }
    const measured = stats.perPerson.filter(x => x.weeks.length > 0);
    if (measured.length === 0) {
      headline.textContent = stats.graduates + ' past Day 21. The first full week after the challenge is not complete yet.';
      chart.style.display = 'none'; labels.style.display = 'none'; note.style.display = 'none';
      return;
    }
    // Headline: average active days over each person's last 4 complete weeks
    const stillActive = measured.filter(x => {
      const recent = x.weeks.slice(-4);
      const avg = recent.reduce((s, w) => s + w.activeDays, 0) / recent.length;
      return avg >= ACTIVE_DAYS_PER_WEEK;
    }).length;
    const pct = Math.round((stillActive / measured.length) * 100);
    headline.innerHTML = `<strong style="font-size:1.4rem;color:var(--text);">${pct}%</strong> of the ${measured.length} past Day 21 are active ${ACTIVE_DAYS_PER_WEEK}+ days a week (last up to 4 complete weeks)` +
      (stats.graduates > measured.length ? ` · ${stats.graduates - measured.length} more awaiting their first complete post-challenge week` : '');

    // Curve: week n after Day 21 → share of those who completed week n and were active 3+ days
    const maxWeeks = Math.min(12, Math.max(...measured.map(x => x.weeks.length)));
    const bars = [];
    for (let n = 1; n <= maxWeeks; n++) {
      const eligible = measured.filter(x => x.weeks.length >= n);
      const active = eligible.filter(x => x.weeks[n - 1].activeDays >= ACTIVE_DAYS_PER_WEEK).length;
      bars.push({ n, pct: eligible.length ? Math.round((active / eligible.length) * 100) : 0, active, eligible: eligible.length });
    }
    chart.style.display = 'flex'; labels.style.display = 'flex'; note.style.display = 'block';
    document.getElementById('post-chart-last').textContent = 'Week ' + maxWeeks;
    chart.innerHTML = bars.map(b => {
      const h = Math.max(4, b.pct);
      const color = b.pct >= 70 ? 'var(--green)' : b.pct >= 40 ? 'var(--gold)' : b.pct > 0 ? 'var(--red)' : 'var(--border)';
      return `<div style="flex:1;height:${h}%;background:${color};border-radius:2px 2px 0 0;min-height:4px;" title="Week ${b.n} after Day 21: ${b.active}/${b.eligible} active ${ACTIVE_DAYS_PER_WEEK}+ days (${b.pct}%)"></div>`;
    }).join('');
  }

  // ---- Where people stop (program owner): sign-ups, sources, first check-in per day ----
  function renderFunnel(counts) {
    const card = document.getElementById('funnel-card');
    if (!card) return;
    counts = counts || {};
    const signups = counts.signups || 0;
    const sources = Object.keys(counts).filter(k => k.startsWith('src_') && counts[k] > 0)
      .sort((a, b) => counts[b] - counts[a]).map(k => k.slice(4) + ' ' + counts[k]);
    const days = [];
    for (let d = 0; d <= 21; d++) days.push(counts['d' + d] || 0);
    const post = counts.post || 0;
    const summary = document.getElementById('funnel-summary');
    if (signups === 0 && days.every(n => n === 0)) {
      summary.textContent = 'No counts yet. They start with the first sign-up or check-in after this release.';
      document.getElementById('funnel-chart').innerHTML = '';
      document.getElementById('funnel-table').innerHTML = '';
      card.style.display = 'block';
      return;
    }
    summary.innerHTML = `<strong style="color:var(--text);">${signups}</strong> signed up` +
      (sources.length ? ` (by source: ${escapeHtml(sources.join(', '))})` : '') +
      ` · <strong style="color:var(--text);">${days[0]}</strong> logged Day 0 · <strong style="color:var(--text);">${days[21]}</strong> logged Day 21 · <strong style="color:var(--text);">${post}</strong> finished the Day 21 survey`;
    const base = Math.max(signups, ...days, 1);
    document.getElementById('funnel-chart').innerHTML = days.map((n, d) => {
      const h = Math.max(4, (n / base) * 100);
      const pct = Math.round((n / base) * 100);
      const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : pct > 0 ? 'var(--red)' : 'var(--border)';
      return `<div style="flex:1;height:${h}%;background:${color};border-radius:2px 2px 0 0;min-height:4px;" title="Day ${d}: ${n} of ${base} (${pct}%)"></div>`;
    }).join('');
    // Biggest single-day drops, so the problem days are named, not guessed
    const drops = [];
    for (let d = 1; d <= 21; d++) if (days[d - 1] > 0) drops.push({ d, lost: days[d - 1] - days[d], from: days[d - 1] });
    drops.sort((a, b) => b.lost - a.lost);
    const top = drops.filter(x => x.lost > 0).slice(0, 3);
    document.getElementById('funnel-table').innerHTML = top.length
      ? 'Biggest drops in check-ins: ' + top.map(x => `Day ${x.d - 1} to Day ${x.d} (${x.from} to ${x.from - x.lost})`).join(' · ')
      : 'No drop in check-ins between days yet.';
    card.style.display = 'block';
  }

  function renderEngagementChart() {
    const container = document.getElementById('engagement-chart');
    const total = participants.length;
    if (total === 0) { container.innerHTML = '<div style="width:100%;display:flex;align-items:center;justify-content:center;color:var(--slate);font-size:0.8rem;font-style:italic;">Engagement data will appear here as participants check in daily.</div>'; return; }

    const dayCounts = [];
    for (let d = 1; d <= 21; d++) {
      let count = 0;
      participants.forEach(p => {
        if (p.logs[String(d)] && p.logs[String(d)].completed) count++;
      });
      dayCounts.push(count);
    }

    const max = Math.max(...dayCounts, 1);
    container.innerHTML = dayCounts.map((c, i) => {
      const h = Math.max(4, (c / max) * 100);
      const pct = total > 0 ? Math.round((c / total) * 100) : 0;
      const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : pct > 0 ? 'var(--red)' : 'var(--border)';
      return `<div style="flex:1;height:${h}%;background:${color};border-radius:2px 2px 0 0;min-height:4px;" title="Day ${i + 1}: ${c}/${total} (${pct}%)"></div>`;
    }).join('');
  }

  function renderTable() {
    const tbody = document.getElementById('participant-rows');
    if (participants.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--slate);">No participants yet. Share the invite code to get started.</td></tr>';
      return;
    }

    tbody.innerHTML = participants.map((p, i) => `
      <tr data-idx="${i}" style="${p.inactive ? 'background:rgba(239,68,68,0.06);' : ''}">
        <td>${escapeHtml(p.name || p.email)}${p.inactive ? ' <span style="color:var(--red);font-size:0.7rem;font-weight:600;">AT RISK</span>' : ''}</td>
        <td>Day ${p.currentDay}</td>
        <td>${p.streak} days</td>
        <td>${p.completionPct}%</td>
        <td>${p.lastCheckin}</td>
      </tr>
    `).join('');

    // Click to view detail
    tbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.idx);
        if (participants[idx]) showParticipantDetail(participants[idx]);
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Invite codes / cohort setup
  const JOIN_BASE = 'https://challenge.buildmoremargin.com/?code=';

  let activeCode = null;
  function renderInvite(code, data) {
    activeCode = code;
    document.getElementById('invite-code').textContent = code;
    document.getElementById('cohort-roadmap').checked = !!(data && data.roadmap === true);
    document.getElementById('join-link').value = JOIN_BASE + code;
    const seats = data && data.maxSeats ? data.maxSeats : null;
    const start = data && data.challengeStartDate ? data.challengeStartDate : null;
    // Seats claimed on THIS code (counted at sign-up, enforced by the rules);
    // codes minted before seat counting fall back to the company headcount.
    const used = data && typeof data.seatsUsed === 'number' ? data.seatsUsed : participants.length;
    const parts = [];
    if (start) parts.push('Starts ' + start);
    parts.push(seats ? (used + ' / ' + seats + ' seats joined') : (used + ' joined'));
    document.getElementById('cohort-meta').textContent = parts.join('  ·  ');
    // Prefill the inputs with the active cohort's settings
    if (start) document.getElementById('cohort-start').value = start;
    if (seats) document.getElementById('cohort-seats').value = seats;
  }

  async function loadInviteCode() {
    const snapshot = await db.collection('inviteCodes')
      .where('companyId', '==', companyId)
      .where('active', '==', true)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      renderInvite(snapshot.docs[0].id, snapshot.docs[0].data());
    }
  }

  document.getElementById('gen-code').addEventListener('click', async () => {
    if (DEMO) { alert('Demo mode: codes are not created here.'); return; }
    // Only the program owner's account (cohortManager) may mint or change codes;
    // the rules enforce it, this just says so instead of failing silently.
    if (adminData && adminData.cohortManager !== true) {
      alert('Cohort codes are set up by the program owner. Contact Scott to change seats or dates.');
      return;
    }
    // Deactivate existing codes for this company
    const existing = await db.collection('inviteCodes')
      .where('companyId', '==', companyId)
      .where('active', '==', true)
      .get();
    const deactivations = [];
    existing.forEach(doc => {
      deactivations.push(db.collection('inviteCodes').doc(doc.id).update({ active: false }));
    });
    await Promise.all(deactivations);

    const code = generateCode();
    const challengeStartDate = document.getElementById('cohort-start').value || null;
    const maxSeats = parseInt(document.getElementById('cohort-seats').value) || 25;
    const roadmap = document.getElementById('cohort-roadmap').checked;
    await db.collection('inviteCodes').doc(code).set({
      companyId,
      active: true,
      challengeStartDate,
      maxSeats,
      seatsUsed: 0,
      roadmap,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    renderInvite(code, { challengeStartDate, maxSeats, seatsUsed: 0, roadmap });
  });

  // Employee Roadmap on/off for the active code (program owner only; the rules
  // refuse it for HR admins, whose dashboard hides the switch).
  document.getElementById('cohort-roadmap').addEventListener('change', async e => {
    if (DEMO) return;
    if (!activeCode || !isProgramOwner()) return;
    const on = e.target.checked;
    try {
      await db.collection('inviteCodes').doc(activeCode).update({ roadmap: on });
    } catch (err) {
      console.error('roadmap toggle failed', err);
      e.target.checked = !on;
      alert('Could not change the Employee Roadmap setting. Try again.');
    }
  });

  document.getElementById('copy-link').addEventListener('click', () => {
    const link = document.getElementById('join-link').value;
    if (link) navigator.clipboard.writeText(link).then(() => {
      const b = document.getElementById('copy-link');
      b.textContent = 'Copied!';
      setTimeout(() => { b.textContent = 'Copy Link'; }, 2000);
    });
  });

  document.getElementById('copy-code').addEventListener('click', () => {
    const code = document.getElementById('invite-code').textContent;
    if (code && code !== '---') {
      navigator.clipboard.writeText(code).then(() => {
        document.getElementById('copy-code').textContent = 'Copied!';
        setTimeout(() => { document.getElementById('copy-code').textContent = 'Copy Code'; }, 2000);
      });
    }
  });

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Sign out (demo: back to the real dashboard)
  document.getElementById('admin-signout').addEventListener('click', () => { if (DEMO) { window.location.href = '/dashboard.html'; return; } auth.signOut(); });

  // Refresh data
  document.getElementById('refresh-data').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-data');
    btn.disabled = true;
    btn.textContent = '...';
    if (DEMO) { startDemo(); btn.textContent = '↻'; btn.disabled = false; return; }
    await loadParticipants();
    if (isProgramOwner()) { try { renderFunnel(await Funnel.readAll()); } catch (e) { console.warn('Could not load funnel counts:', e); } }
    btn.textContent = '↻';
    btn.disabled = false;
  });

  // Search filter
  document.getElementById('participant-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#participant-rows tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? '' : 'none';
    });
  });

  // Sortable columns
  let sortField = 'name';
  let sortAsc = true;
  document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) { sortAsc = !sortAsc; } else { sortField = field; sortAsc = true; }
      participants.sort((a, b) => {
        let va = field === 'name' ? (a.name || a.email || '').toLowerCase() : (a[field] || 0);
        let vb = field === 'name' ? (b.name || b.email || '').toLowerCase() : (b[field] || 0);
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
      });
      renderTable();
    });
  });

  // Participant detail overlay
  const overlay = document.getElementById('detail-overlay');
  document.getElementById('detail-close').addEventListener('click', () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

  function showParticipantDetail(p) {
    const content = document.getElementById('detail-content');
    let html = `<h2 style="margin-bottom:4px;">${escapeHtml(p.name || 'Unknown')}</h2>`;
    html += `<p style="color:var(--slate);font-size:0.85rem;margin-bottom:16px;"><a href="mailto:${escapeHtml(p.email || '')}" style="color:var(--green);">${escapeHtml(p.email || '')}</a></p>`;

    // Stats
    html += `<div style="margin-bottom:16px;">`;
    html += `<span class="detail-stat"><strong>Day:</strong> ${p.currentDay}</span>`;
    html += `<span class="detail-stat"><strong>Streak:</strong> ${p.streak}</span>`;
    html += `<span class="detail-stat"><strong>Completion:</strong> ${p.completionPct}%</span>`;
    html += `<span class="detail-stat"><strong>Completed Days:</strong> ${p.completedDays}</span>`;
    html += `</div>`;

    // Daily log history
    html += `<h3 style="margin-bottom:8px;">Check-in History</h3>`;
    const logDays = Object.keys(p.logs).map(Number).sort((a, b) => b - a);
    if (logDays.length === 0) {
      html += `<p style="color:var(--slate);font-size:0.8rem;">No check-ins yet.</p>`;
    } else {
      logDays.forEach(d => {
        const log = p.logs[String(d)];
        const icon = log.completed ? '<span style="color:var(--green);">&#10003;</span>' : '<span style="color:var(--text-light);">&#9675;</span>';
        html += `<div class="detail-log-row" style="flex-wrap:wrap;">
          ${icon}
          <span style="font-weight:600;min-width:50px;">Day ${d}</span>
          <span style="color:var(--slate);">${log.completed ? 'Completed' : 'Not completed'}</span>
          ${log.breathing ? '<span style="color:var(--green);font-size:0.75rem;">Breathed</span>' : ''}
        </div>`;
      });
    }

    content.innerHTML = html;
    overlay.style.display = 'flex';
  }

  // Assessment areas — shared by the Assessments tab and the printed HR report.
  // Includes the Real Retirement Readiness pillars (12-Month Roadmap baseline).
  const ASSESSMENT_QUESTIONS = [
    { id: 'stress', label: 'Stress', inverse: true },
    { id: 'sleep', label: 'Sleep' },
    { id: 'financial', label: 'Financial Confidence' },
    { id: 'energy', label: 'Energy' },
    { id: 'overwhelm', label: 'Overwhelm', inverse: true },
    { id: 'savings', label: 'Savings Habit' },
    { id: 'exercise', label: 'Exercise' },
    { id: 'breathing', label: 'Breathing' },
    { id: 'p_health', label: 'Pillar: Health' },
    { id: 'p_wealth', label: 'Pillar: Wealth' },
    { id: 'p_finwell', label: 'Pillar: Financial Wellness' },
    { id: 'p_retsave', label: 'Pillar: Retirement Savings' },
    { id: 'p_jobskills', label: 'Pillar: Job Skills' }
  ];

  // Cohort average for one question of one survey, from the aggregate counters.
  // Hidden (null) under MIN_GROUP responses.
  const avgResponse = (type, id) => {
    const agg = aggs[type];
    return Aggregates.countOf(agg, id) >= MIN_GROUP ? Aggregates.avgOf(agg, id) : null;
  };
  const responsesFor = type => Aggregates.responsesIn(aggs[type], type);

  // Assessments — COHORT AGGREGATE ONLY. Individual responses are never shown
  // (employee anonymity); only the group's pre->post trend per area.
  async function loadAssessments() {
    const container = document.getElementById('assessment-results');
    const QUESTIONS = ASSESSMENT_QUESTIONS;

    await loadAggregates().catch(() => {});
    const nPre = responsesFor('pre'), nPost = responsesFor('post');
    const nM3 = responsesFor('m3'), nM6 = responsesFor('m6'), nM12 = responsesFor('m12');

    if (nPre === 0) {
      container.innerHTML = '<p style="color:var(--slate);font-size:0.8rem;">No assessment data yet.</p>';
      return;
    }

    const avg = avgResponse;

    let html = '<p style="color:var(--slate);font-size:0.85rem;margin-bottom:12px;">Cohort averages (scale 1 to 10). Individual responses are private to each participant. Only the group trend is shown.</p>';
    html += '<table class="participant-table"><thead><tr><th>Area</th><th style="text-align:center;">Start (avg)</th><th style="text-align:center;">End (avg)</th><th style="text-align:center;">Change</th></tr></thead><tbody>';
    QUESTIONS.forEach(q => {
      const pre = avg('pre', q.id);
      const post = nPost ? avg('post', q.id) : null;
      const preStr = pre != null ? pre.toFixed(1) : '-';
      let postStr = '-', changeStr = '<span style="color:var(--text-light);">post-survey pending</span>';
      if (pre != null && post != null) {
        postStr = post.toFixed(1);
        const delta = post - pre;
        const improved = q.inverse ? delta < 0 : delta > 0;
        const color = delta === 0 ? 'var(--slate)' : (improved ? 'var(--green)' : 'var(--red)');
        const sign = delta > 0 ? '+' : '';
        changeStr = `<span style="color:${color};font-weight:600;">${sign}${delta.toFixed(1)}${delta === 0 ? '' : (improved ? ' ↑' : ' ↓')}</span>`;
      }
      html += `<tr><td>${q.label}</td><td style="text-align:center;color:var(--slate);">${preStr}</td><td style="text-align:center;font-weight:600;">${postStr}</td><td style="text-align:center;">${changeStr}</td></tr>`;
    });
    html += '</tbody></table>';
    html += `<p style="color:var(--slate);font-size:0.72rem;margin-top:8px;">Based on ${nPre} start / ${nPost} end responses. Green = improvement (lower stress &amp; overwhelm, higher everything else). Averages show once ${MIN_GROUP} or more people have answered.</p>`;

    // Readiness Pillars over time — the 12-Month Roadmap view (only once milestone data exists).
    if (nM3 || nM6 || nM12) {
      const PILLARS = [
        { id: 'p_health', label: 'Health' },
        { id: 'p_wealth', label: 'Wealth' },
        { id: 'p_finwell', label: 'Financial Wellness' },
        { id: 'p_retsave', label: 'Retirement Savings' },
        { id: 'p_jobskills', label: 'Job Skills' }
      ];
      const cell = v => v != null ? v.toFixed(1) : '-';
      html += '<h3 style="margin:20px 0 6px;font-size:0.95rem;">Readiness Pillars over time</h3>';
      html += '<p style="color:var(--slate);font-size:0.78rem;margin-bottom:10px;">Cohort averages (1 to 10, higher = better). Baseline is the pre-survey; M3/M6/M12 are the Roadmap check-ins.</p>';
      html += '<table class="participant-table"><thead><tr><th>Pillar</th><th style="text-align:center;">Baseline</th><th style="text-align:center;">M3</th><th style="text-align:center;">M6</th><th style="text-align:center;">M12</th></tr></thead><tbody>';
      PILLARS.forEach(p => {
        html += `<tr><td>${p.label}</td>
          <td style="text-align:center;color:var(--slate);">${cell(avg('pre', p.id))}</td>
          <td style="text-align:center;">${cell(avg('m3', p.id))}</td>
          <td style="text-align:center;">${cell(avg('m6', p.id))}</td>
          <td style="text-align:center;font-weight:600;">${cell(avg('m12', p.id))}</td></tr>`;
      });
      html += '</tbody></table>';
      html += `<p style="color:var(--slate);font-size:0.72rem;margin-top:8px;">Milestone responses: ${nM3} (M3) / ${nM6} (M6) / ${nM12} (M12). Aggregate only.</p>`;
    }

    container.innerHTML = html;
  }

  // CSV Export
  document.getElementById('export-csv').addEventListener('click', () => {
    if (participants.length === 0) return;

    // Summary sheet
    const headers = ['Name', 'Email', 'Current Day', 'Completed Days', 'Completion %', 'Streak', 'Last Check-in'];
    const rows = participants.map(p => {
      return [p.name || '', p.email || '', p.currentDay, p.completedDays, p.completionPct + '%', p.streak, p.lastCheckin];
    });

    let csv = '--- SUMMARY ---\n';
    csv += [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');

    // Daily detail sheet
    csv += '\n\n--- DAILY LOGS ---\n';
    csv += 'Name,Day,Completed,Breathing,Meal\n';
    participants.forEach(p => {
      Object.keys(p.logs).sort((a, b) => Number(a) - Number(b)).forEach(day => {
        const l = p.logs[day];
        csv += [p.name || p.email, day, l.completed ? 'Yes' : 'No', l.breathing ? 'Yes' : 'No', l.meal ? 'Yes' : 'No'].map(v => `"${v}"`).join(',') + '\n';
      });
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bmm-challenge-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // HR Results Report — employer-safe: cohort aggregates + per-person engagement only.
  // NEVER includes individual stress, savings, or journal notes.
  async function generateResultsReport() {
    if (participants.length === 0) { alert('No participants yet.'); return; }
    // Open the window synchronously (inside the click gesture) so popup blockers
    // don't kill it while we await the assessment aggregates below.
    const win = window.open('', '_blank');
    if (!win) { alert('Please allow pop-ups to generate the report.'); return; }
    const companyName = document.getElementById('company-name').textContent || 'Your Company';
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const joined = participants.length;
    const participated = participants.filter(p => Object.keys(p.logs).length > 0).length;
    const participationRate = Math.round((participated / joined) * 100);
    const avgCompletion = Math.round(participants.reduce((s, p) => s + p.completionPct, 0) / joined);
    const totalBreathing = participants.reduce((s, p) => s + (p.breathingSessions || 0), 0);
    await loadAggregates().catch(() => {});
    // Cohort savings total (net of withdrawals) from the aggregate counter; hidden
    // until MIN_GROUP people have a balance.
    const savAgg = aggs.savings || {};
    const owner = isProgramOwner();
    const totalSavedStr = Aggregates.countOf(savAgg, 'cents') >= MIN_GROUP ? '$' + ((savAgg.sum_cents || 0) / 100).toFixed(0) : '—';

    const wk1 = stressWindow(1, 7), wk3 = stressWindow(15, 21);
    let stressTrend = '—';
    if (wk1 != null && wk3 != null) {
      const delta = wk1 - wk3;
      stressTrend = wk1.toFixed(1) + ' → ' + wk3.toFixed(1) + (delta > 0 ? ' (down ' + delta.toFixed(1) + ')' : '');
    } else if (wk1 != null) {
      stressTrend = 'Week 1 avg ' + wk1.toFixed(1);
    }

    // After Day 21: share still active 3+ days a week (engagement dates only)
    let postLine = '';
    const ps = postChallengeStats();
    const measured = ps.perPerson.filter(x => x.weeks.length > 0);
    if (measured.length > 0) {
      const stillActive = measured.filter(x => {
        const recent = x.weeks.slice(-4);
        return recent.reduce((s, w) => s + w.activeDays, 0) / recent.length >= ACTIVE_DAYS_PER_WEEK;
      }).length;
      postLine = `<div style="margin-top:6px;font-size:0.85rem;color:#334155;">After Day 21: <strong>${Math.round((stillActive / measured.length) * 100)}%</strong> of ${measured.length} graduates active ${ACTIVE_DAYS_PER_WEEK}+ days a week (last up to 4 complete weeks; a check-in, the health action, or a breathing session counts as active).</div>`;
    }

    // Aggregate pre->post assessment table — cohort AVERAGES only, no individuals
    // (same privacy rule as the Assessments tab, which computes the same numbers).
    const nPre = responsesFor('pre'), nPost = responsesFor('post');
    let assessmentSection = '';
    if (nPre > 0) {
      const assessRows = ASSESSMENT_QUESTIONS.map(q => {
        const pre = avgResponse('pre', q.id);
        const post = nPost ? avgResponse('post', q.id) : null;
        if (pre == null && post == null) return '';
        const preStr = pre != null ? pre.toFixed(1) : '—';
        let postStr = '—', changeStr = '<span style="color:#94A3B8;">pending</span>';
        if (pre != null && post != null) {
          postStr = post.toFixed(1);
          const delta = post - pre;
          const improved = q.inverse ? delta < 0 : delta > 0;
          const color = delta === 0 ? '#475569' : (improved ? '#047857' : '#b91c1c');
          const sign = delta > 0 ? '+' : '';
          changeStr = `<span style="color:${color};font-weight:600;">${sign}${delta.toFixed(1)}</span>`;
        }
        return `<tr><td>${escapeHtml(q.label)}</td>
          <td style="text-align:center;">${preStr}</td>
          <td style="text-align:center;">${postStr}</td>
          <td style="text-align:center;">${changeStr}</td></tr>`;
      }).join('');
      assessmentSection = `<h2>Wellness Assessment: Cohort Averages (Start vs. End)</h2>
        <table><thead><tr><th>Area</th><th style="text-align:center;">Start (avg)</th><th style="text-align:center;">End (avg)</th><th style="text-align:center;">Change</th></tr></thead><tbody>${assessRows}</tbody></table>
        <div style="font-size:0.72rem;color:#94A3B8;margin-top:6px;">Based on ${nPre} start / ${nPost} end responses (scale 1 to 10). Averages show once ${MIN_GROUP} or more people have answered. Improvement = lower stress &amp; overwhelm, higher everything else. Group averages only. Individual responses are never shown.</div>`;
    }

    const rows = participants.slice().sort((a, b) => b.completionPct - a.completionPct).map(p => `
      <tr><td>${escapeHtml(p.name || p.email || 'Participant')}</td>
        <td style="text-align:center;">Day ${p.currentDay}</td>
        <td style="text-align:center;">${p.completionPct}%</td>
        <td style="text-align:center;">${p.streak}</td>
        <td style="text-align:center;color:${p.inactive ? '#b91c1c' : '#047857'};">${p.inactive ? 'At risk' : 'Active'}</td></tr>`).join('');

    const metric = (val, label) => `<div style="flex:1;min-width:110px;text-align:center;padding:14px;border:1px solid #e2e8f0;border-radius:12px;">
      <div style="font-size:1.6rem;font-weight:800;color:#0F172A;letter-spacing:-0.02em;">${val}</div>
      <div style="font-size:0.7rem;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-top:4px;">${label}</div></div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bend Your Baseline: Day-21 Summary for ${escapeHtml(companyName)}</title>
      <style>*{box-sizing:border-box;}body{font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#0F172A;max-width:760px;margin:0 auto;padding:40px 28px;}
      h1{font-size:1.5rem;letter-spacing:-0.02em;margin:0 0 4px;}.sub{color:#475569;font-size:0.9rem;margin-bottom:24px;}
      h2{font-size:0.9rem;text-transform:uppercase;letter-spacing:0.05em;color:#0EA5E9;margin:28px 0 12px;}
      table{width:100%;border-collapse:collapse;font-size:0.85rem;}th{text-align:left;color:#475569;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding:8px 10px;}
      td{padding:8px 10px;border-bottom:1px solid #eef2f6;}.row{display:flex;gap:12px;flex-wrap:wrap;}
      .note{font-size:0.72rem;color:#94A3B8;margin-top:28px;border-top:1px solid #e2e8f0;padding-top:12px;line-height:1.5;}@media print{body{padding:0;}}</style></head><body>
      <h1>Bend Your Baseline: Day-21 Summary</h1>
      <div class="sub">${escapeHtml(companyName)} · ${today}</div>
      ${DEMO ? '<div style="background:#F59E0B;color:#0F172A;padding:8px 12px;border-radius:8px;font-weight:600;font-size:0.85rem;margin-bottom:16px;">SAMPLE REPORT. Made-up data for demonstration. Not a real company, not real results.</div>' : ''}
      <h2>Cohort Outcomes</h2>
      <div class="row">${metric(joined, 'Enrolled')}${metric(participationRate + '%', 'Participated')}${metric(avgCompletion + '%', 'Avg Completion')}${owner ? metric(totalSavedStr, 'Saved (cohort)') : ''}${metric(totalBreathing, 'Breathing Sessions')}</div>
      ${owner ? `<div style="margin-top:12px;font-size:0.85rem;color:#334155;">Average stress (Week 1 → Week 3): <strong>${stressTrend}</strong></div>` : ''}
      ${postLine}
      ${owner ? assessmentSection : ''}
      <h2>Participation by Person</h2>
      <table><thead><tr><th>Name</th><th style="text-align:center;">Day</th><th style="text-align:center;">Completion</th><th style="text-align:center;">Streak</th><th style="text-align:center;">Status</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="note"><strong>Privacy:</strong> This report shows participation and aggregate outcomes only. Individual stress levels, savings amounts, and journal entries are private to each participant and are never shared with employers.</div>
      </body></html>`;

    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  document.getElementById('results-report').addEventListener('click', generateResultsReport);

  // Demo mode starts last, after every module-level `let` above is initialised.
  if (DEMO) {
    document.getElementById('demo-banner').style.display = 'block';
    document.getElementById('demo-as-hr').addEventListener('click', () => { demoAsOwner = false; startDemo(); });
    document.getElementById('demo-as-owner').addEventListener('click', () => { demoAsOwner = true; startDemo(); });
    startDemo();
  }
})();
