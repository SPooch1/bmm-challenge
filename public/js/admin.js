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

    // Last check-in
    const logDays = Object.keys(participant.logs).map(Number).sort((a, b) => b - a);
    participant.lastCheckin = logDays.length > 0 ? 'Day ' + logDays[0] : 'None';
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

    document.getElementById('m-participants').textContent = total;
    document.getElementById('m-active').textContent = total > 0 ? Math.round((activeToday / total) * 100) + '%' : '0%';
    document.getElementById('m-avg-stress').textContent = avgStress;
    document.getElementById('m-completion').textContent = avgCompletion + '%';
  }

  function renderTable() {
    const tbody = document.getElementById('participant-rows');
    if (participants.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--slate);">No participants yet. Share the invite code to get started.</td></tr>';
      return;
    }

    tbody.innerHTML = participants.map((p, i) => `
      <tr data-idx="${i}">
        <td>${escapeHtml(p.name || p.email)}</td>
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

  // Invite codes
  async function loadInviteCode() {
    const snapshot = await db.collection('inviteCodes')
      .where('companyId', '==', companyId)
      .where('active', '==', true)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      document.getElementById('invite-code').textContent = snapshot.docs[0].id;
    }
  }

  document.getElementById('gen-code').addEventListener('click', async () => {
    const code = generateCode();
    await db.collection('inviteCodes').doc(code).set({
      companyId,
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('invite-code').textContent = code;
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

  // Participant detail overlay
  const overlay = document.getElementById('detail-overlay');
  document.getElementById('detail-close').addEventListener('click', () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

  function showParticipantDetail(p) {
    const content = document.getElementById('detail-content');
    let html = `<h2 style="margin-bottom:4px;">${escapeHtml(p.name || 'Unknown')}</h2>`;
    html += `<p style="color:var(--slate);font-size:0.85rem;margin-bottom:16px;">${escapeHtml(p.email || '')}</p>`;

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
        html += `<div class="detail-log-row">
          ${icon}
          <span style="font-weight:600;min-width:50px;">Day ${d}</span>
          <span style="color:var(--slate);">Stress: ${log.stress || '-'}</span>
          <span style="color:var(--slate);">Sleep: ${log.sleep || '-'}</span>
          <span style="color:var(--slate);">Steps: ${log.steps || '-'}</span>
          ${log.breathing ? '<span style="color:var(--green);font-size:0.75rem;">Breathed</span>' : ''}
        </div>`;
      });
    }

    content.innerHTML = html;
    overlay.style.display = 'flex';
  }

  // Load assessments for the assessments tab
  async function loadAssessments() {
    const container = document.getElementById('assessment-results');
    const QUESTIONS = [
      { id: 'stress', label: 'Stress', inverse: true },
      { id: 'sleep', label: 'Sleep' },
      { id: 'financial', label: 'Financial' },
      { id: 'energy', label: 'Energy' },
      { id: 'overwhelm', label: 'Overwhelm', inverse: true },
      { id: 'savings', label: 'Savings' },
      { id: 'exercise', label: 'Exercise' },
      { id: 'breathing', label: 'Breathing' }
    ];

    const rows = [];
    for (const p of participants) {
      try {
        const preDoc = await db.collection('users').doc(p.id).collection('assessments').doc('pre').get();
        const postDoc = await db.collection('users').doc(p.id).collection('assessments').doc('post').get();
        if (preDoc.exists) {
          rows.push({
            name: p.name || p.email,
            pre: preDoc.data().responses,
            post: postDoc.exists ? postDoc.data().responses : null
          });
        }
      } catch (e) { /* skip if no access */ }
    }

    if (rows.length === 0) {
      container.innerHTML = '<p style="color:var(--slate);font-size:0.8rem;">No assessment data yet.</p>';
      return;
    }

    let html = '<table class="participant-table"><thead><tr><th>Name</th>';
    QUESTIONS.forEach(q => { html += `<th style="text-align:center;">${q.label}</th>`; });
    html += '</tr></thead><tbody>';

    rows.forEach(r => {
      html += `<tr><td>${escapeHtml(r.name)}</td>`;
      QUESTIONS.forEach(q => {
        const pre = r.pre[q.id];
        if (r.post) {
          const post = r.post[q.id];
          const improved = q.inverse ? post < pre : post > pre;
          const color = improved ? 'var(--green)' : post === pre ? 'var(--slate)' : 'var(--red)';
          html += `<td style="text-align:center;"><span style="color:var(--slate);font-size:0.75rem;">${pre}</span> <span style="color:${color};font-weight:600;">${post}</span></td>`;
        } else {
          html += `<td style="text-align:center;color:var(--slate);">${pre}</td>`;
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += '<p style="color:var(--slate);font-size:0.75rem;margin-top:8px;">Pre scores in gray. Post scores in bold (green = improved, red = declined).</p>';
    container.innerHTML = html;
  }

  // CSV Export
  document.getElementById('export-csv').addEventListener('click', () => {
    if (participants.length === 0) return;

    const headers = ['Name', 'Email', 'Current Day', 'Completed Days', 'Completion %', 'Streak', 'Last Check-in'];
    const rows = participants.map(p => [
      p.name || '', p.email || '', p.currentDay, p.completedDays, p.completionPct + '%', p.streak, p.lastCheckin
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bmm-challenge-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
})();
