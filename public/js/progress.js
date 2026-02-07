// Progress tracking module
const Progress = (() => {

  async function loadProgress(uid, currentDay) {
    const snapshot = await db.collection('users').doc(uid).collection('dailyLogs')
      .orderBy(firebase.firestore.FieldPath.documentId())
      .get();

    const logs = {};
    snapshot.forEach(doc => { logs[doc.id] = doc.data(); });

    // Stats
    const completedDays = Object.values(logs).filter(l => l.completed).length;
    const pct = currentDay > 0 ? Math.round((completedDays / currentDay) * 100) : 0;

    // Streak calculation
    let streak = 0;
    for (let d = currentDay; d >= 0; d--) {
      if (logs[String(d)] && logs[String(d)].completed) {
        streak++;
      } else if (d < currentDay) {
        break;
      }
    }

    // Update UI
    document.getElementById('progress-day').textContent = currentDay;
    document.getElementById('progress-streak').textContent = streak;
    document.getElementById('progress-pct').textContent = pct + '%';
    document.getElementById('progress-bar-fill').style.width = Math.round((currentDay / 21) * 100) + '%';

    // Phase progress
    renderPhases(currentDay);

    // Log history
    renderHistory(logs, currentDay);

    return { completedDays, streak, pct, logs };
  }

  function renderPhases(currentDay) {
    const phases = [
      { name: 'Welcome', days: '0', range: [0, 0] },
      { name: 'Foundation', days: '1-7', range: [1, 7] },
      { name: 'Momentum', days: '8-14', range: [8, 14] },
      { name: 'Activation', days: '15-21', range: [15, 21] }
    ];

    const container = document.getElementById('phase-list');
    container.innerHTML = phases.map(p => {
      const isActive = currentDay >= p.range[0] && currentDay <= p.range[1];
      const isDone = currentDay > p.range[1];
      const status = isDone ? 'done' : isActive ? 'active' : 'upcoming';
      const icon = isDone ? '&#10003;' : isActive ? '&#9679;' : '&#9675;';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <span style="color:${isDone ? 'var(--green)' : isActive ? 'var(--gold)' : 'var(--text-light)'};font-size:1.2rem;">${icon}</span>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:0.9rem;">${p.name}</div>
          <div style="font-size:0.75rem;color:var(--slate);">Days ${p.days}</div>
        </div>
        <span style="font-size:0.75rem;color:var(--slate);text-transform:uppercase;">${status}</span>
      </div>`;
    }).join('');
  }

  function renderHistory(logs, currentDay) {
    const container = document.getElementById('log-history');
    if (Object.keys(logs).length === 0) {
      container.innerHTML = '<p style="color:var(--slate);font-size:0.875rem;">No check-ins yet. Complete today\'s exercise to get started!</p>';
      return;
    }

    const rows = [];
    for (let d = Math.min(currentDay, 21); d >= 0; d--) {
      const log = logs[String(d)];
      if (!log) continue;
      const icon = log.completed ? '<span style="color:var(--green);">&#10003;</span>' : '<span style="color:var(--text-light);">&#9675;</span>';
      rows.push(`<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.875rem;">
        ${icon}
        <span style="font-weight:600;">Day ${d}</span>
        <span style="flex:1;"></span>
        <span style="color:var(--slate);">Stress: ${log.stress || '-'}</span>
        <span style="color:var(--slate);">Sleep: ${log.sleep || '-'}</span>
      </div>`);
    }
    container.innerHTML = rows.join('');
  }

  return { loadProgress };
})();
