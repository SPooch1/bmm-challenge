// Progress tracking module
const Progress = (() => {

  // opts (Keep Your Margin mode): { marginMode, elapsed, series, pomFunded, breathTotal, resets }
  async function loadProgress(uid, currentDay, opts) {
    opts = opts || {};
    const snapshot = await db.collection('users').doc(uid).collection('dailyLogs')
      .orderBy(firebase.firestore.FieldPath.documentId())
      .get();

    const logs = {};
    snapshot.forEach(doc => { logs[doc.id] = doc.data(); });

    // Keep Your Margin: build the date-keyed series once the challenge logs are in hand
    if (opts.seriesFor) opts.series = opts.seriesFor(logs);
    if (opts.actionStreakFor && opts.series) opts.actionStreak = opts.actionStreakFor(opts.series);

    // Stats
    const completedDays = Object.values(logs).filter(l => l.completed).length;
    // Day 0 is completable, so days elapsed = currentDay + 1 (capped at the 22
    // total days: Day 0 + Days 1-21). Clamp so it can never exceed 100%.
    const pct = Math.min(100, Math.round((completedDays / Math.min(currentDay + 1, 22)) * 100));

    // Streak calculation — forgiving: one missed day (grace) won't zero the streak
    let streak = 0;
    let graceUsed = false;
    for (let d = currentDay; d >= 0; d--) {
      const done = logs[String(d)] && logs[String(d)].completed;
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

    // Update UI
    const dayLabel = document.getElementById('progress-day-label');
    if (opts.marginMode) {
      document.getElementById('progress-day').textContent = opts.elapsed;
      if (dayLabel) dayLabel.textContent = 'Days in';
    } else {
      document.getElementById('progress-day').textContent = currentDay;
      if (dayLabel) dayLabel.textContent = 'Day';
    }
    const streakLabel = document.getElementById('progress-streak-label');
    if (opts.marginMode) {
      document.getElementById('progress-streak').textContent = opts.actionStreak || 0;
      if (streakLabel) streakLabel.textContent = 'Action streak';
    } else {
      document.getElementById('progress-streak').textContent = streak;
      if (streakLabel) streakLabel.textContent = 'Streak';
    }
    document.getElementById('progress-pct').textContent = pct + '%';

    // Animate progress ring
    const ringCircle = document.getElementById('progress-ring-circle');
    const ringPct = document.getElementById('progress-ring-pct');
    if (ringCircle) {
      const circumference = 326.73;
      const ringCompletion = Math.min(21, completedDays) / 21;
      const offset = circumference - ringCompletion * circumference;
      setTimeout(() => { ringCircle.style.strokeDashoffset = offset; }, 100);
      ringPct.textContent = Math.round(ringCompletion * 100) + '%';
    }

    // Phase progress
    renderPhases(currentDay, opts);

    // Badges
    renderBadges(completedDays, streak, currentDay, logs, opts);

    // Trends
    renderTrends(logs, currentDay, opts);

    // Log history
    renderHistory(logs, currentDay, opts);

    return { completedDays, streak, pct, logs, graceUsed };
  }

  function renderTrends(logs, currentDay, opts) {
    const container = document.getElementById('trend-chart');
    const days = [];

    if (opts && opts.marginMode && opts.series) {
      // Last 21 calendar days with a check-in, labeled by date
      const today = Margin.todayKey();
      for (let i = 27; i >= 0; i--) {
        const key = Margin.addDays(today, -i);
        const e = opts.series[key];
        if (e && e.stress) days.push({ day: Margin.shortDate(key).replace(/^[A-Za-z]+ /, ''), stress: e.stress, action: e.action, key });
      }
      if (days.length < 2) {
        container.innerHTML = '<p style="color:var(--slate);font-size:0.8rem;">Two check-ins with a stress rating and your last four weeks show up here.</p>';
        return;
      }
      let html = barRow('Stress, last 4 weeks', days.slice(-21).map(d => ({ day: d.day, val: d.stress })), 'var(--red)', true);
      const dots = [];
      for (let i = 27; i >= 0; i--) {
        const key = Margin.addDays(today, -i);
        const e = opts.series[key];
        dots.push(`<span class="dot ${e && e.action ? 'on' : ''}" title="${Margin.shortDate(key)}"></span>`);
      }
      html += `<div style="margin-top:4px;"><div style="font-size:0.8rem;font-weight:600;margin-bottom:6px;">Health action, last 4 weeks</div><div class="dot-row">${dots.join('')}</div></div>`;
      container.innerHTML = html;
      return;
    }

    for (let d = 0; d <= Math.min(currentDay, 21); d++) {
      if (logs[String(d)]) days.push({ day: d, ...logs[String(d)] });
    }

    if (days.length < 2) {
      container.innerHTML = '<p style="color:var(--slate);font-size:0.8rem;">Complete at least 2 check-ins to see trends.</p>';
      return;
    }

    function barRow(label, values, color, invert) {
      let html = `<div style="margin-bottom:16px;"><div style="font-size:0.8rem;font-weight:600;margin-bottom:6px;">${label}</div>`;
      html += '<div style="display:flex;align-items:flex-end;gap:3px;height:60px;">';
      values.forEach(v => {
        const val = v.val || 0;
        const h = Math.max(4, (val / 10) * 100);
        const barColor = invert ? (val <= 4 ? 'var(--green)' : val >= 7 ? 'var(--red)' : 'var(--gold)') : (val >= 7 ? 'var(--green)' : val <= 3 ? 'var(--red)' : 'var(--gold)');
        html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;">
          <div style="font-size:0.6rem;color:var(--slate);margin-bottom:2px;">${val}</div>
          <div style="width:100%;height:${h}%;background:${barColor};border-radius:3px 3px 0 0;min-height:4px;"></div>
          <div style="font-size:0.55rem;color:var(--text-light);margin-top:2px;">${v.day}</div>
        </div>`;
      });
      html += '</div></div>';
      return html;
    }

    let html = barRow('Stress', days.map(d => ({ day: d.day, val: d.stress })), 'var(--red)', true);
    html += barRow('Sleep', days.map(d => ({ day: d.day, val: d.sleep })), 'var(--green)', false);
    container.innerHTML = html;
  }

  function renderBadges(completedDays, streak, currentDay, logs, opts) {
    opts = opts || {};
    const breathingCount = Math.max(Object.values(logs).filter(l => l.breathing).length, opts.breathTotal || 0);
    const elapsed = opts.elapsed || currentDay;
    const actionStreak = opts.actionStreak || 0;
    const badges = [
      { icon: '&#127793;', label: 'First Step', earned: completedDays >= 1, desc: 'Complete your first day' },
      { icon: '&#128293;', label: '3-Day Streak', earned: streak >= 3, desc: '3 consecutive days' },
      { icon: '&#9889;', label: '7-Day Streak', earned: streak >= 7, desc: '7 consecutive days' },
      { icon: '&#127942;', label: '14-Day Streak', earned: streak >= 14, desc: '14 consecutive days' },
      { icon: '&#128081;', label: 'Champion', earned: streak >= 21, desc: 'Complete all 21 days' },
      { icon: '&#129504;', label: 'Breather', earned: breathingCount >= 5, desc: '5 breathing sessions' },
      { icon: '&#128170;', label: 'Halfway', earned: completedDays >= 11, desc: 'Complete 11+ days' },
      { icon: '&#127775;', label: 'All-Star', earned: completedDays >= 18, desc: '18+ days completed' },
      // Keep Your Margin badges (Day 22+)
      { icon: '&#128197;', label: 'Day 30', earned: elapsed >= 30, desc: '30 days since Day 1' },
      { icon: '&#127919;', label: '90-Day Plan', earned: elapsed >= 90, desc: '90 days since Day 1' },
      { icon: '&#127881;', label: 'One Year', earned: elapsed >= 365, desc: 'A full year of margin' },
      { icon: '&#127939;', label: 'Action x30', earned: actionStreak >= 30, desc: '30-day health action streak' },
      { icon: '&#128176;', label: 'Month Funded', earned: !!opts.pomFunded, desc: 'One month of essentials saved' },
      { icon: '&#127744;', label: 'Breather x25', earned: breathingCount >= 25, desc: '25 breathing sessions' },
      { icon: '&#128260;', label: 'Reset Pro', earned: (opts.resets || 0) >= 1, desc: 'Used your reset plan' }
    ];

    const container = document.getElementById('badges-grid');
    container.innerHTML = badges.map(b => {
      const cls = b.earned ? 'earned' : 'locked';
      return `<div class="badge-item ${cls}" title="${b.desc}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-label">${b.label}</div>
        ${!b.earned ? `<div class="badge-hint">${b.desc}</div>` : ''}
      </div>`;
    }).join('');
  }

  function renderPhases(currentDay, opts) {
    opts = opts || {};
    const marginMode = !!opts.marginMode;
    const phases = [
      { name: 'Welcome', days: '0', range: [0, 0] },
      { name: 'Foundation', days: '1-7', range: [1, 7] },
      { name: 'Momentum', days: '8-14', range: [8, 14] },
      { name: 'Activation', days: '15-21', range: [15, 21] },
      { name: 'Keep Your Margin', days: '22 and on', range: [22, Infinity], margin: true }
    ];

    const container = document.getElementById('phase-list');
    container.innerHTML = phases.map(p => {
      const isActive = p.margin ? marginMode : (!marginMode && currentDay >= p.range[0] && currentDay <= p.range[1]);
      const isDone = p.margin ? false : (marginMode || currentDay > p.range[1]);
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

  function renderHistory(logs, currentDay, opts) {
    opts = opts || {};
    const container = document.getElementById('log-history');
    const marginLogs = (opts.marginMode && typeof Margin !== 'undefined') ? Margin.getLogs() : {};
    if (Object.keys(logs).length === 0 && Object.keys(marginLogs).length === 0) {
      container.innerHTML = '<p style="color:var(--slate);font-size:0.875rem;">No check-ins yet. Complete today\'s exercise to get started!</p>';
      return;
    }

    const rows = [];
    // Keep Your Margin days first (newest first), then the 21 challenge days
    Object.keys(marginLogs).sort().reverse().slice(0, 30).forEach(key => {
      const l = marginLogs[key];
      const icon = l.action ? '<span style="color:var(--green);">&#10003;</span>' : '<span style="color:var(--text-light);">&#9675;</span>';
      rows.push(`<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:0.875rem;">
        ${icon}
        <span style="font-weight:600;">${Margin.shortDate(key)}</span>
        <span style="flex:1;"></span>
        <span style="color:var(--slate);">Stress: ${l.stress || '-'}</span>
        <span style="color:var(--slate);">Action: ${l.action ? 'yes' : 'no'}</span>
      </div>`);
    });
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
