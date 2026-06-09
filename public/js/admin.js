// Admin dashboard module
(async () => {
  const authScreen = document.getElementById('admin-auth');
  const dashboard = document.getElementById('dashboard');
  const authForm = document.getElementById('admin-auth-form');
  const errorEl = document.getElementById('admin-error');

  let adminData = null;
  let companyId = null;

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

  auth.onAuthStateChanged(async user => {
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

  async function loadParticipants() {
    const snapshot = await db.collection('users')
      .where('companyId', '==', companyId)
      .where('role', '==', 'participant')
      .get();

    participants = [];
    const promises = [];

    snapshot.forEach(doc => {
      const data = { id: doc.id, ...doc.data() };
      participants.push(data);
      promises.push(loadParticipantLogs(data));
    });

    await Promise.all(promises);
    renderMetrics();
    renderTable();
    updateTimestamp();
  }

  async function loadParticipantLogs(participant) {
    const logs = await db.collection('users').doc(participant.id)
      .collection('dailyLogs').get();
    participant.logs = {};
    logs.forEach(doc => { participant.logs[doc.id] = doc.data(); });

    // Calculate stats
    const completedDays = Object.values(participant.logs).filter(l => l.completed).length;
    const today = new Date().toISOString().split('T')[0];
    const startDate = participant.challengeStartDate;
    const currentDay = startDate ? Math.max(0, Math.min(21, Math.floor((new Date(today) - new Date(startDate)) / 86400000))) : 0;

    participant.currentDay = currentDay;
    participant.completedDays = completedDays;
    participant.completionPct = currentDay > 0 ? Math.round((completedDays / currentDay) * 100) : 0;

    // Streak
    let streak = 0;
    for (let d = currentDay; d >= 0; d--) {
      if (participant.logs[String(d)] && participant.logs[String(d)].completed) {
        streak++;
      } else if (d < currentDay) { break; }
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

    const avgStress = total > 0
      ? (participants.reduce((sum, p) => {
          const stressVals = Object.values(p.logs).map(l => l.stress).filter(Boolean);
          return sum + (stressVals.length > 0 ? stressVals.reduce((a, b) => a + b, 0) / stressVals.length : 0);
        }, 0) / total).toFixed(1)
      : '-';

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

    // At-risk indicator
    const atRiskEl = document.getElementById('m-at-risk');
    if (atRiskEl) {
      atRiskEl.textContent = atRisk;
      atRiskEl.style.color = atRisk > 0 ? 'var(--red)' : 'var(--green)';
    }
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

  function renderInvite(code, data) {
    document.getElementById('invite-code').textContent = code;
    document.getElementById('join-link').value = JOIN_BASE + code;
    const seats = data && data.maxSeats ? data.maxSeats : null;
    const start = data && data.challengeStartDate ? data.challengeStartDate : null;
    const used = participants.length;
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
    await db.collection('inviteCodes').doc(code).set({
      companyId,
      active: true,
      challengeStartDate,
      maxSeats,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    renderInvite(code, { challengeStartDate, maxSeats });
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

  // Sign out
  document.getElementById('admin-signout').addEventListener('click', () => auth.signOut());

  // Refresh data
  document.getElementById('refresh-data').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-data');
    btn.disabled = true;
    btn.textContent = '...';
    await loadParticipants();
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

  // Assessments — COHORT AGGREGATE ONLY. Individual responses are never shown
  // (employee anonymity); only the group's pre->post trend per area.
  async function loadAssessments() {
    const container = document.getElementById('assessment-results');
    const QUESTIONS = [
      { id: 'stress', label: 'Stress', inverse: true },
      { id: 'sleep', label: 'Sleep' },
      { id: 'financial', label: 'Financial Confidence' },
      { id: 'energy', label: 'Energy' },
      { id: 'overwhelm', label: 'Overwhelm', inverse: true },
      { id: 'savings', label: 'Savings Habit' },
      { id: 'exercise', label: 'Exercise' },
      { id: 'breathing', label: 'Breathing' }
    ];

    // Collect responses only — names are deliberately NOT retained
    const pres = [], posts = [];
    for (const p of participants) {
      try {
        const preDoc = await db.collection('users').doc(p.id).collection('assessments').doc('pre').get();
        const postDoc = await db.collection('users').doc(p.id).collection('assessments').doc('post').get();
        if (preDoc.exists) pres.push(preDoc.data().responses);
        if (postDoc.exists) posts.push(postDoc.data().responses);
      } catch (e) { /* skip if no access */ }
    }

    if (pres.length === 0) {
      container.innerHTML = '<p style="color:var(--slate);font-size:0.8rem;">No assessment data yet.</p>';
      return;
    }

    const avg = (arr, id) => {
      const vals = arr.map(r => r && r[id]).filter(v => typeof v === 'number');
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    let html = '<p style="color:var(--slate);font-size:0.85rem;margin-bottom:12px;">Cohort averages (scale 1–10). Individual responses are private to each participant — only the group trend is shown.</p>';
    html += '<table class="participant-table"><thead><tr><th>Area</th><th style="text-align:center;">Start (avg)</th><th style="text-align:center;">End (avg)</th><th style="text-align:center;">Change</th></tr></thead><tbody>';
    QUESTIONS.forEach(q => {
      const pre = avg(pres, q.id);
      const post = posts.length ? avg(posts, q.id) : null;
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
    html += `<p style="color:var(--slate);font-size:0.72rem;margin-top:8px;">Based on ${pres.length} start / ${posts.length} end responses. Green = improvement (lower stress &amp; overwhelm, higher everything else).</p>`;
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
  function generateResultsReport() {
    if (participants.length === 0) { alert('No participants yet.'); return; }
    const companyName = document.getElementById('company-name').textContent || 'Your Company';
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const joined = participants.length;
    const participated = participants.filter(p => Object.keys(p.logs).length > 0).length;
    const participationRate = Math.round((participated / joined) * 100);
    const avgCompletion = Math.round(participants.reduce((s, p) => s + p.completionPct, 0) / joined);
    const totalBreathing = participants.reduce((s, p) => s + (p.breathingSessions || 0), 0);
    const totalSaved = participants.reduce((s, p) => s + (p.savingsEntries || []).reduce((a, x) => a + (x.amount || 0), 0), 0);

    function avgStress(lo, hi) {
      const vals = [];
      participants.forEach(p => { for (let d = lo; d <= hi; d++) { const l = p.logs[String(d)]; if (l && l.stress) vals.push(l.stress); } });
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    const wk1 = avgStress(1, 7), wk3 = avgStress(15, 21);
    let stressTrend = '—';
    if (wk1 != null && wk3 != null) {
      const delta = wk1 - wk3;
      stressTrend = wk1.toFixed(1) + ' → ' + wk3.toFixed(1) + (delta > 0 ? ' (down ' + delta.toFixed(1) + ')' : '');
    } else if (wk1 != null) {
      stressTrend = 'Week 1 avg ' + wk1.toFixed(1);
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

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BMM Results — ${escapeHtml(companyName)}</title>
      <style>*{box-sizing:border-box;}body{font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#0F172A;max-width:760px;margin:0 auto;padding:40px 28px;}
      h1{font-size:1.5rem;letter-spacing:-0.02em;margin:0 0 4px;}.sub{color:#475569;font-size:0.9rem;margin-bottom:24px;}
      h2{font-size:0.9rem;text-transform:uppercase;letter-spacing:0.05em;color:#0EA5E9;margin:28px 0 12px;}
      table{width:100%;border-collapse:collapse;font-size:0.85rem;}th{text-align:left;color:#475569;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0;padding:8px 10px;}
      td{padding:8px 10px;border-bottom:1px solid #eef2f6;}.row{display:flex;gap:12px;flex-wrap:wrap;}
      .note{font-size:0.72rem;color:#94A3B8;margin-top:28px;border-top:1px solid #e2e8f0;padding-top:12px;line-height:1.5;}@media print{body{padding:0;}}</style></head><body>
      <h1>Build More Margin — 21-Day Challenge Results</h1>
      <div class="sub">${escapeHtml(companyName)} · ${today}</div>
      <h2>Cohort Outcomes</h2>
      <div class="row">${metric(joined, 'Enrolled')}${metric(participationRate + '%', 'Participated')}${metric(avgCompletion + '%', 'Avg Completion')}${metric('$' + totalSaved.toFixed(0), 'Saved (cohort)')}${metric(totalBreathing, 'Breathing Sessions')}</div>
      <div style="margin-top:12px;font-size:0.85rem;color:#334155;">Average stress (Week 1 → Week 3): <strong>${stressTrend}</strong></div>
      <h2>Participation by Person</h2>
      <table><thead><tr><th>Name</th><th style="text-align:center;">Day</th><th style="text-align:center;">Completion</th><th style="text-align:center;">Streak</th><th style="text-align:center;">Status</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="note"><strong>Privacy:</strong> This report shows participation and aggregate outcomes only. Individual stress levels, savings amounts, and journal entries are private to each participant and are never shared with employers.</div>
      </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Please allow pop-ups to generate the report.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  document.getElementById('results-report').addEventListener('click', generateResultsReport);
})();
