// Keep Your Margin: everything that outlives the 21 days.
// Owns the owner-only settings doc (users/{uid}/private/margin), the date-keyed
// post-challenge logs (users/{uid}/marginLogs/{YYYY-MM-DD}), the Day 22+ home
// screen, the in-challenge capture inputs (Peace of Mind number on Day 2, health
// action on Days 17-21), the reset plan, the weekly check, and the individual re-run flow.
const Margin = (() => {
  const pad = n => (n < 10 ? '0' : '') + n;
  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseKey(k) { return new Date(k + 'T00:00:00'); }
  function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
  function dateForDay(startDate, day) { return addDays(startDate, day); }
  function todayKey() { return dateKey(new Date()); }
  function shortDate(k) {
    const d = parseKey(k);
    return isNaN(d) ? k : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function fmtMoney(n) {
    const r = Math.round(n || 0);
    return (r < 0 ? '-$' : '$') + Math.abs(r).toLocaleString('en-US');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let uid = null;
  let settings = {};
  let logs = {};
  let hooks = { switchView: () => {}, runMilestone: () => {}, getUid: () => null };
  let lastCtx = null;
  let renderedKey = null;

  // Current unsaved form state on the margin home (so re-renders keep it)
  function currentDraft() {
    const stress = document.getElementById('margin-stress');
    const notes = document.getElementById('margin-notes');
    const wrap = document.getElementById('margin-notes-wrap');
    const wcAdjust = document.getElementById('wc-adjust');
    const wcProtect = document.getElementById('wc-protect');
    const wc = {};
    if (wcAdjust) wc.wcAdjust = wcAdjust.value;
    if (wcProtect) wc.wcProtect = wcProtect.value;
    if (!stress) return Object.keys(wc).length ? wc : null;
    return Object.assign({ stress: parseInt(stress.value), notes: notes ? notes.value : '', notesOpen: wrap ? wrap.style.display !== 'none' : false }, wc);
  }
  // Re-render the home with fresh numbers (savings/breathing changed on another
  // tab, or the day rolled over while the app stayed open).
  function refreshHome() {
    if (!lastCtx) return;
    if (renderedKey && renderedKey !== todayKey()) { window.location.reload(); return; }
    renderHome(Object.assign({}, lastCtx, { draft: currentDraft() }));
  }

  function settingsRef() { return db.collection('users').doc(uid).collection('private').doc('margin'); }

  async function load(userId) {
    uid = userId;
    const [sDoc, lSnap] = await Promise.all([
      settingsRef().get(),
      db.collection('users').doc(uid).collection('marginLogs').get()
    ]);
    settings = sDoc.exists ? (sDoc.data() || {}) : {};
    logs = {};
    lSnap.forEach(d => { logs[d.id] = d.data(); });
    return settings;
  }

  function getSettings() { return settings; }
  function getLogs() { return logs; }

  async function saveSettings(patch) {
    settings = Object.assign({}, settings, patch);
    await settingsRef().set(Object.assign({}, patch, { updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
    return settings;
  }

  // Weekly check (the book's five-minute check, Part Three): one entry per
  // Monday-start week in the owner-only settings doc. Merge-writes only this
  // week's entry so other weeks are never overwritten.
  async function saveWeeklyCheck(wk, entry) {
    await settingsRef().set({ weeklyChecks: { [wk]: entry }, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const all = Object.assign({}, settings.weeklyChecks || {});
    all[wk] = entry;
    settings = Object.assign({}, settings, { weeklyChecks: all });
  }

  async function saveLog(key, data) {
    logs[key] = Object.assign({}, logs[key] || {}, data);
    await db.collection('users').doc(uid).collection('marginLogs').doc(key)
      .set(Object.assign({}, data, { savedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
    recordActivity(key, { checkin: true, action: logs[key].action === true });
  }

  // ---------- Engagement summary the cohort dashboard may read ----------
  // users/{uid}/engagement/weekly = { weeks: { <monday YYYY-MM-DD>: { days: {date:true},
  // actionDays: {date:true}, breathDays: {date:true} } } }. Dates only: no
  // stress, no notes, no dollars. Idempotent merge writes, fire-and-forget, so a
  // failure here can never block a check-in or a breathing session.
  function weekKey(k) {
    const d = parseKey(k);
    const dow = (d.getDay() + 6) % 7; // Monday = 0
    return addDays(k, -dow);
  }
  function recordActivity(dateKey_, what) {
    if (!uid || !dateKey_) return;
    const wk = weekKey(dateKey_);
    const entry = { days: { [dateKey_]: true } };
    if (what && what.action) entry.actionDays = { [dateKey_]: true };
    if (what && what.breath) entry.breathDays = { [dateKey_]: true };
    const payload = { weeks: { [wk]: entry }, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      db.collection('users').doc(uid).collection('engagement').doc('weekly')
        .set(payload, { merge: true })
        .catch(err => console.warn('engagement write skipped', err));
    } catch (e) { /* never block the user */ }
  }

  // One date-keyed series for the whole journey: challenge dailyLogs (mapped from
  // day number to calendar date) plus post-challenge marginLogs.
  function buildSeries(dailyLogs, startDate) {
    const s = {};
    if (startDate) {
      Object.keys(dailyLogs || {}).forEach(k => {
        const d = Number(k);
        if (isNaN(d)) return;
        const l = dailyLogs[k] || {};
        s[dateForDay(startDate, d)] = {
          stress: l.stress || null, action: l.action === true, completed: !!l.completed,
          breathing: !!l.breathing, notes: l.notes || '', src: 'challenge', day: d
        };
      });
    }
    // Challenge records win on an overlapping date (only possible right after a
    // restart, when an older margin log shares today's date with new Day 0).
    Object.keys(logs).forEach(key => {
      if (s[key]) return;
      const l = logs[key] || {};
      s[key] = {
        stress: l.stress || null, action: l.action === true, completed: true,
        notes: l.notes || '', src: 'margin'
      };
    });
    return s;
  }

  // Health-action streak: consecutive days ending today (today itself is never
  // penalized), one grace day like the challenge streak, floored at the last
  // Reset or at the day the action was set.
  function actionStreak(series) {
    const today = todayKey();
    const floor = settings.resetAt || settings.healthActionSetAt || null;
    let streak = 0, grace = false;
    for (let i = 0; i < 3660; i++) {
      const key = addDays(today, -i);
      if (floor && key < floor) break;
      const e = series[key];
      if (e && e.action) streak++;
      else if (i === 0) continue;
      else if (!grace) { grace = true; continue; }
      else break;
    }
    return streak;
  }

  function windowStats(series, endKey, days) {
    let stressSum = 0, stressN = 0, actionDays = 0, checkins = 0;
    for (let i = 0; i < days; i++) {
      const e = series[addDays(endKey, -i)];
      if (!e) continue;
      checkins++;
      if (e.stress) { stressSum += e.stress; stressN++; }
      if (e.action) actionDays++;
    }
    return { stressAvg: stressN ? stressSum / stressN : null, actionDays, checkins };
  }

  // ---------- In-challenge capture (Day 2 number, Day 17+ health action) ----------
  function renderCapture(day, opts) {
    const box = document.getElementById('exercise-capture');
    if (!box) return;
    const marginMode = !!(opts && opts.marginMode);
    box.style.display = 'none';
    box.innerHTML = '';
    if (marginMode) return;

    if (day === 2) {
      const cur = settings.pomTarget ? Math.round(settings.pomTarget) : '';
      box.style.display = 'block';
      box.innerHTML = `
        <div class="capture-label">Write it here so the app can track it with you</div>
        <label for="capture-pom" style="font-weight:600;font-size:0.85rem;">My Peace of Mind number (one month of essentials)</label>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <input type="number" id="capture-pom" inputmode="numeric" min="0" step="1" placeholder="e.g. 2400" value="${cur}" style="flex:1;">
          <button type="button" class="btn btn-primary" id="capture-pom-save">Save</button>
        </div>
        <div id="capture-pom-msg" class="capture-msg"></div>`;
      document.getElementById('capture-pom-save').onclick = async () => {
        const v = parseFloat(document.getElementById('capture-pom').value);
        const msg = document.getElementById('capture-pom-msg');
        if (!v || v <= 0) { msg.textContent = 'Enter a dollar amount first.'; return; }
        await saveSettings({ pomTarget: v });
        msg.textContent = 'Saved. Your Savings tab now tracks toward ' + fmtMoney(v) + '.';
        if (typeof PeaceOfMind !== 'undefined') PeaceOfMind.setTarget(v);
      };
      return;
    }

    if (day >= 17 && day <= 21) {
      const cur = settings.healthAction || '';
      box.style.display = 'block';
      box.innerHTML = `
        <div class="capture-label">Carry one thing past Day 21</div>
        <label for="capture-action" style="font-weight:600;font-size:0.85rem;">The one health action I will keep doing</label>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <input type="text" id="capture-action" maxlength="80" placeholder="e.g. Walk 20 minutes after lunch" value="${esc(cur)}" style="flex:1;">
          <button type="button" class="btn btn-primary" id="capture-action-save">Save</button>
        </div>
        <div id="capture-action-msg" class="capture-msg">${cur ? 'Your daily check-in now asks about this.' : 'One action. Small enough to do on a bad day.'}</div>`;
      document.getElementById('capture-action-save').onclick = async () => {
        const v = document.getElementById('capture-action').value.trim();
        const msg = document.getElementById('capture-action-msg');
        if (!v) { msg.textContent = 'Name the action first.'; return; }
        const patch = { healthAction: v };
        if (!settings.healthActionSetAt) patch.healthActionSetAt = todayKey();
        await saveSettings(patch);
        msg.textContent = 'Saved. Your daily check-in now asks about this.';
        if (typeof Checkin !== 'undefined') Checkin.setHealthAction(v);
      };
    }
  }

  // ---------- Day 22+ home ----------
  function bitsyLine(elapsed, streak, actionSet) {
    if (!actionSet) return "The challenge ended. The margin doesn't have to. Name one health action below.";
    if (streak >= 30) return streak + ' days on your health action. This is who you are now.';
    if (streak >= 7) return streak + '-day streak. Momentum is doing the work for you.';
    const lines = [
      'One tap today: did you do your health action?',
      'Your Peace of Mind Account grows on deposits, not intentions.',
      'Two minutes of breathing still counts as two minutes.',
      'Slipped? That is data. Reset and keep going.',
      'Small moves on ordinary days. That is the whole game.',
      'Check in, breathe, save a little. Same as Day 1.',
      'The 21 days built the habit. Today keeps it.'
    ];
    return lines[elapsed % lines.length];
  }

  function heroTitle(elapsed) {
    if (elapsed <= 90) return '90-Day Plan · Day ' + elapsed + ' of 90';
    const week = Math.ceil(elapsed / 7);
    return 'Week ' + week + ' since Day 1';
  }

  function renderHome(ctx) {
    lastCtx = ctx;
    const home = document.getElementById('margin-home');
    if (!home) return;
    const { elapsed, dailyLogs, startDate, dueMilestone } = ctx;
    const series = buildSeries(dailyLogs, startDate);
    const today = todayKey();
    const streak = actionStreak(series);
    const thisWk = windowStats(series, today, 7);
    const lastWk = windowStats(series, addDays(today, -7), 7);
    const actionSet = !!settings.healthAction;

    const pom = typeof PeaceOfMind !== 'undefined' ? PeaceOfMind : null;
    const total = pom ? pom.getTotal() : 0;
    const target = settings.pomTarget || 0;
    const depThis = pom ? pom.sumBetween(addDays(today, -6), today) : 0;
    const depLast = pom ? pom.sumBetween(addDays(today, -13), addDays(today, -7)) : 0;
    const bt = typeof BreathingTimer !== 'undefined' ? BreathingTimer : null;
    const brThis = bt ? bt.countBetween(addDays(today, -6), today) : 0;
    const brLast = bt ? bt.countBetween(addDays(today, -13), addDays(today, -7)) : 0;

    const stressTxt = thisWk.stressAvg != null ? thisWk.stressAvg.toFixed(1) : '–';
    let stressDelta = '';
    if (thisWk.stressAvg != null && lastWk.stressAvg != null) {
      const d = thisWk.stressAvg - lastWk.stressAvg;
      if (Math.abs(d) >= 0.05) stressDelta = `<span class="tile-delta ${d < 0 ? 'good' : 'bad'}">${d < 0 ? '▼' : '▲'} ${Math.abs(d).toFixed(1)} vs last week</span>`;
      else stressDelta = '<span class="tile-delta">same as last week</span>';
    }
    let pomSub;
    if (target) {
      const months = total / target;
      pomSub = months.toFixed(1) + (months === 1 ? ' month' : ' months') + ' of essentials';
    } else {
      pomSub = total >= 500 ? '$500 starter goal reached' : 'of $500 starter goal';
    }

    const todayLog = logs[today] || {};
    const todayDone = todayLog.action === true;
    // Unsaved edits survive a re-render (toggle tap, tab switch)
    const draft = ctx.draft || {};
    const stressVal = draft.stress || todayLog.stress || 5;
    const notesVal = draft.notes != null ? draft.notes : (todayLog.notes || '');
    const notesOpen = draft.notesOpen != null ? draft.notesOpen : !!todayLog.notes;
    renderedKey = today;

    home.innerHTML = `
      <div class="card margin-hero">
        <div class="margin-eyebrow">Keep Your Margin</div>
        <h2>${heroTitle(elapsed)}</h2>
        <div class="bitsy-line" style="margin:12px 0 0;background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.12);">
          <img src="/icons/bitsy.png" alt="Bitsy" class="bitsy-avatar">
          <div>${esc(bitsyLine(elapsed, streak, actionSet))}</div>
        </div>
      </div>

      <div class="stats-grid margin-tiles">
        <div class="stat-card">
          <div class="stat-value">${stressTxt}</div>
          <div class="stat-label">Stress, 7-day avg</div>
          ${stressDelta}
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:1.25rem;">${fmtMoney(total)}</div>
          <div class="stat-label">Peace of Mind</div>
          <span class="tile-delta">${esc(pomSub)}</span>
        </div>
        <div class="stat-card">
          <div class="stat-value">${thisWk.actionDays}<span style="font-size:0.9rem;color:var(--text-light);">/7</span></div>
          <div class="stat-label">Health action</div>
          <span class="tile-delta ${streak >= 3 ? 'good' : ''}">${streak ? streak + '-day streak' : 'this week'}</span>
        </div>
      </div>

      <div class="card" id="margin-checkin-card">
        ${actionSet ? `
          <h3 style="display:flex;align-items:center;justify-content:space-between;">Today
            <span style="font-size:0.75rem;font-weight:500;color:var(--slate);">${shortDate(today)}</span></h3>
          <div class="action-row">
            <div style="flex:1;">
              <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--slate);">My health action</div>
              <div style="font-weight:600;" id="margin-action-text">${esc(settings.healthAction)}</div>
              <a href="#" id="margin-action-edit" style="font-size:0.75rem;color:var(--sky-dark);">Change</a>
            </div>
            <button type="button" id="margin-action-toggle" class="action-toggle ${todayDone ? 'on' : ''}" aria-pressed="${todayDone}">
              ${todayDone ? '✓ Done today' : 'Did it today'}
            </button>
          </div>
          <div id="margin-action-editor" style="display:none;margin-top:10px;">
            <div style="display:flex;gap:8px;">
              <input type="text" id="margin-action-input" maxlength="80" value="${esc(settings.healthAction)}" style="flex:1;">
              <button type="button" class="btn btn-primary" id="margin-action-save">Save</button>
            </div>
          </div>
          <div class="form-group" style="margin-top:14px;">
            <label>Stress today: <span id="margin-stress-val" style="color:var(--green);font-size:1.1em;">${stressVal}</span>/10</label>
            <input type="range" id="margin-stress" min="1" max="10" value="${stressVal}" aria-label="Stress level from 1 to 10">
            <div class="range-labels"><span>Low</span><span>High</span></div>
          </div>
          <button type="button" id="margin-notes-toggle" style="width:100%;padding:8px;background:none;border:1px dashed var(--border);border-radius:var(--radius);color:var(--slate);font-size:0.8rem;cursor:pointer;">+ Add a note (optional)</button>
          <div id="margin-notes-wrap" style="display:${notesOpen ? 'block' : 'none'};margin-top:10px;">
            <textarea id="margin-notes" rows="2" placeholder="One line is plenty." style="resize:vertical;">${esc(notesVal)}</textarea>
          </div>
          <button type="button" class="btn btn-primary btn-full" id="margin-save" style="margin-top:12px;">${logs[today] ? 'Update today' : 'Save today'}</button>
          <div id="margin-saved" style="display:none;text-align:center;color:var(--green);font-weight:600;padding:10px;">Saved!</div>
        ` : `
          <h3>Name one health action</h3>
          <p style="font-size:0.9rem;color:var(--slate);margin-top:6px;">The one thing from the 21 days you will keep doing. Small enough to do on a bad day.</p>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <input type="text" id="margin-action-input" maxlength="80" placeholder="e.g. Walk 20 minutes after lunch" style="flex:1;">
            <button type="button" class="btn btn-primary" id="margin-action-save">Save</button>
          </div>
        `}
      </div>

      <div class="quick-actions">
        <button type="button" class="quick-btn" id="margin-go-breathe">
          <span class="quick-icon">◎</span><span>Breathe now</span><small>2 minutes</small>
        </button>
        <button type="button" class="quick-btn" id="margin-go-savings">
          <span class="quick-icon">$</span><span>Add a deposit</span><small>Peace of Mind</small>
        </button>
      </div>

      ${dueMilestone ? `
      <div class="card milestone-card">
        <h3>Your ${dueMilestone.label} check-in is ready</h3>
        <p style="font-size:0.9rem;color:var(--slate);margin:6px 0 12px;">Five quick ratings, about a minute. You will see how today compares with your Day 0 baseline.</p>
        <button type="button" class="btn btn-primary btn-full" id="margin-milestone-btn">Start the ${dueMilestone.label} check-in</button>
      </div>` : ''}

      <div class="card">
        <h3>This week</h3>
        <div class="week-table">
          <div class="week-head"><span></span><span>This week</span><span>Last week</span></div>
          ${weekRow('Check-ins', thisWk.checkins + '/7', lastWk.checkins + '/7')}
          ${weekRow('Health action', thisWk.actionDays + '/7', lastWk.actionDays + '/7')}
          ${weekRow('Stress avg', thisWk.stressAvg != null ? thisWk.stressAvg.toFixed(1) : '–', lastWk.stressAvg != null ? lastWk.stressAvg.toFixed(1) : '–')}
          ${weekRow('Breathing', brThis + (brThis === 1 ? ' session' : ' sessions'), brLast + (brLast === 1 ? ' session' : ' sessions'))}
          ${weekRow('Net saved', fmtMoney(depThis), fmtMoney(depLast))}
        </div>
      </div>

      ${weeklyCheckHtml(ctx, { total, depThis, actionDays: thisWk.actionDays, brThis, dailyLogs })}

      <div class="card">
        <h3 style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;" id="margin-reset-toggle">Slipped? Read your reset plan
          <span style="font-size:0.8rem;color:var(--slate);">&#9660;</span></h3>
        <div id="margin-reset-body" style="display:none;margin-top:10px;">
          <p style="font-size:0.9rem;color:var(--slate);">You wrote this on Day 19. A slip is information, not failure. Restart at the very next chance, with the smallest version.</p>
          <blockquote class="reset-quote">${esc(resetText(dailyLogs))}</blockquote>
          <button type="button" class="btn btn-outline btn-full" id="margin-reset-btn">Start a fresh streak from today</button>
          ${settings.resetAt ? `<div style="font-size:0.75rem;color:var(--slate);text-align:center;margin-top:8px;">Last reset: ${shortDate(settings.resetAt)}</div>` : ''}
        </div>
      </div>

      <div class="card">
        <h3 style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;" id="margin-revisit-toggle">Revisit the 21 days
          <span style="font-size:0.8rem;color:var(--slate);">&#9660;</span></h3>
        <p style="font-size:0.85rem;color:var(--slate);margin-top:6px;">Every video and exercise stays here. Use the arrows to move between days.</p>
      </div>
    `;

    // wire up
    const goBreathe = document.getElementById('margin-go-breathe');
    if (goBreathe) goBreathe.onclick = () => hooks.switchView('breathing');
    const goSavings = document.getElementById('margin-go-savings');
    if (goSavings) goSavings.onclick = () => hooks.switchView('savings');

    const msBtn = document.getElementById('margin-milestone-btn');
    if (msBtn && dueMilestone) msBtn.onclick = () => hooks.runMilestone(dueMilestone.id);

    const saveActionBtn = document.getElementById('margin-action-save');
    if (saveActionBtn) saveActionBtn.onclick = async () => {
      const v = document.getElementById('margin-action-input').value.trim();
      if (!v) return;
      const patch = { healthAction: v };
      if (!settings.healthActionSetAt) patch.healthActionSetAt = todayKey();
      await saveSettings(patch);
      if (typeof Checkin !== 'undefined') Checkin.setHealthAction(v);
      showToast('Health action saved.');
      renderHome(Object.assign({}, lastCtx, { draft: wcOnly(currentDraft()) }));
    };
    const editLink = document.getElementById('margin-action-edit');
    if (editLink) editLink.onclick = e => {
      e.preventDefault();
      const ed = document.getElementById('margin-action-editor');
      ed.style.display = ed.style.display === 'none' ? 'block' : 'none';
    };

    const toggle = document.getElementById('margin-action-toggle');
    if (toggle) toggle.onclick = async () => {
      if (todayKey() !== today) { window.location.reload(); return; }
      const on = !toggle.classList.contains('on');
      toggle.classList.toggle('on', on);
      toggle.setAttribute('aria-pressed', String(on));
      toggle.textContent = on ? '✓ Done today' : 'Did it today';
      const draft = currentDraft();
      try {
        await saveLog(today, { action: on });
      } catch (err) {
        console.error('action save failed', err);
        showToast('Could not save. Check your connection.');
        return;
      }
      if (on && navigator.vibrate) navigator.vibrate(40);
      renderHome(Object.assign({}, lastCtx, { draft }));
    };

    const stress = document.getElementById('margin-stress');
    if (stress) stress.oninput = () => { document.getElementById('margin-stress-val').textContent = stress.value; };
    const notesToggle = document.getElementById('margin-notes-toggle');
    if (notesToggle) notesToggle.onclick = () => {
      const w = document.getElementById('margin-notes-wrap');
      w.style.display = w.style.display === 'none' ? 'block' : 'none';
    };
    const saveBtn = document.getElementById('margin-save');
    if (saveBtn) saveBtn.onclick = async () => {
      if (todayKey() !== today) { window.location.reload(); return; }
      saveBtn.disabled = true;
      try {
        await saveLog(today, {
          action: document.getElementById('margin-action-toggle').classList.contains('on'),
          stress: parseInt(document.getElementById('margin-stress').value),
          notes: document.getElementById('margin-notes').value.trim()
        });
        const ok = document.getElementById('margin-saved');
        ok.style.display = 'block';
        if (typeof Checkin !== 'undefined' && Checkin.showConfetti) Checkin.showConfetti();
        setTimeout(() => { renderHome(Object.assign({}, lastCtx, { draft: wcOnly(currentDraft()) })); }, 900);
      } catch (err) {
        console.error('margin save failed', err);
        showToast('Save failed. Check your connection and try again.');
        saveBtn.disabled = false;
      }
    };

    const resetToggle = document.getElementById('margin-reset-toggle');
    if (resetToggle) resetToggle.onclick = () => {
      const b = document.getElementById('margin-reset-body');
      b.style.display = b.style.display === 'none' ? 'block' : 'none';
    };
    const resetBtn = document.getElementById('margin-reset-btn');
    if (resetBtn) resetBtn.onclick = async () => {
      await saveSettings({ resetAt: todayKey(), resets: (settings.resets || []).concat([todayKey()]) });
      showToast('Fresh start. Streak counts from today.');
      renderHome(Object.assign({}, lastCtx, { draft: currentDraft() }));
    };

    const wcSave = document.getElementById('wc-save');
    if (wcSave) wcSave.onclick = async () => {
      const protect = document.getElementById('wc-protect').value.trim();
      const adjust = document.getElementById('wc-adjust').value.trim();
      const wk = weekKey(todayKey());
      if (!protect) { showToast('Pick one thing to protect next week.'); return; }
      wcSave.disabled = true;
      try {
        await saveWeeklyCheck(wk, { protect, adjust, savedOn: todayKey() });
        showToast('Weekly check saved.');
        weeklyEditing = false;
        const d = currentDraft();
        if (d) { delete d.wcAdjust; delete d.wcProtect; }
        renderHome(Object.assign({}, lastCtx, { draft: d }));
      } catch (err) {
        console.error('weekly check save failed', err);
        showToast('Save failed. Check your connection and try again.');
        wcSave.disabled = false;
      }
    };
    const wcEdit = document.getElementById('wc-edit');
    if (wcEdit) wcEdit.onclick = e => {
      e.preventDefault();
      weeklyEditing = true;
      renderHome(Object.assign({}, lastCtx, { draft: currentDraft() }));
    };

    const revisit = document.getElementById('margin-revisit-toggle');
    if (revisit) revisit.onclick = () => {
      const ch = document.getElementById('challenge-home');
      const show = ch.style.display === 'none';
      ch.style.display = show ? 'block' : 'none';
      if (show) ch.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  let weeklyEditing = false;
  // Keep only unsaved weekly-check text (the daily fields reload from the saved log)
  function wcOnly(d) {
    if (!d) return null;
    const o = {};
    if (d.wcAdjust != null) o.wcAdjust = d.wcAdjust;
    if (d.wcProtect != null) o.wcProtect = d.wcProtect;
    return Object.keys(o).length ? o : null;
  }
  function weeklyCheckHtml(ctx, n) {
    const draft = ctx.draft || {};
    const wk = weekKey(todayKey());
    const checks = settings.weeklyChecks || {};
    const mine = checks[wk];
    const prior = Object.keys(checks).filter(k => k < wk).sort().pop();
    const lastProtect = prior && checks[prior] && checks[prior].protect;
    const onePage = n.dailyLogs && n.dailyLogs['20'] && n.dailyLogs['20'].notes && n.dailyLogs['20'].notes.trim();
    const head = `<h3 style="display:flex;align-items:center;justify-content:space-between;">Weekly check
          <span style="font-size:0.75rem;font-weight:500;color:var(--slate);">5 minutes, once a week</span></h3>
        ${lastProtect ? `<p class="wc-last">Last week you chose to protect: <strong>${esc(lastProtect)}</strong></p>` : ''}`;
    if (mine && !weeklyEditing) {
      return `<div class="card" id="weekly-check-card">${head}
        <p style="font-size:0.9rem;margin-top:8px;">&#10003; Done for this week. Protecting: <strong>${esc(mine.protect)}</strong></p>
        ${mine.adjust ? `<p style="font-size:0.85rem;color:var(--slate);margin-top:4px;">Adjusting: ${esc(mine.adjust)}</p>` : ''}
        <a href="#" id="wc-edit" style="font-size:0.75rem;color:var(--sky-dark);">Edit</a>
      </div>`;
    }
    const adjustVal = draft.wcAdjust != null ? draft.wcAdjust : (mine ? mine.adjust || '' : '');
    const protectVal = draft.wcProtect != null ? draft.wcProtect : (mine ? mine.protect || '' : '');
    return `<div class="card" id="weekly-check-card">${head}
      <ol class="wc-steps">
        <li><strong>Check your Peace of Mind balance.</strong> ${fmtMoney(n.total)} today, ${fmtMoney(n.depThis)} net in the past 7 days. Did your automatic transfer go through?</li>
        <li><strong>Look at your week.</strong> In the past 7 days: health action ${n.actionDays} of 7 days, breathing ${n.brThis} ${n.brThis === 1 ? 'session' : 'sessions'}. Don't grade yourself. Just notice.</li>
        <li><strong>Read your one page.</strong> Does anything need to change? A habit that's too big? A cue that isn't working?
          ${onePage ? `<blockquote class="reset-quote">${esc(onePage)}</blockquote>` : `<div style="font-size:0.8rem;color:var(--slate);margin-top:4px;">Your Day 20 one page isn't saved in the app. Read your paper or phone copy.</div>`}
          <textarea id="wc-adjust" rows="2" maxlength="300" placeholder="Optional: one thing to make smaller or change." style="resize:vertical;margin-top:6px;">${esc(adjustVal)}</textarea></li>
        <li><strong>Pick one thing to protect next week.</strong> The habit most likely to slip.
          <input type="text" id="wc-protect" maxlength="80" value="${esc(protectVal)}" placeholder="e.g. My lunchtime walk" style="margin-top:6px;"></li>
      </ol>
      <button type="button" class="btn btn-primary btn-full" id="wc-save">${mine ? 'Update this week' : 'Save my weekly check'}</button>
    </div>`;
  }

  function weekRow(label, a, b) {
    return `<div class="week-row"><span>${label}</span><strong>${a}</strong><span style="color:var(--slate);">${b}</span></div>`;
  }

  function resetText(dailyLogs) {
    const l = dailyLogs && dailyLogs['19'];
    if (l && l.notes && l.notes.trim()) return l.notes.trim();
    const d = typeof Challenge !== 'undefined' ? Challenge.getDayData(19) : null;
    return d ? 'You did not write your reset plan down on Day 19. Here is the prompt: ' + d.exercise : 'What is your smallest restart in money, body, and stress?';
  }

  // ---------- Re-run the 21 days (individual accounts) ----------
  function renderRestartCard(userData, dailyLogs, progressData, postSurvey) {
    const card = document.getElementById('restart-card');
    if (!card) return;
    const elapsed = Challenge.calculateElapsedDay(userData.challengeStartDate);
    if (elapsed <= 21) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    const runs = settings.pastRuns || [];
    const runsHtml = runs.length ? `<div style="font-size:0.75rem;color:var(--slate);margin-top:8px;">Past runs: ${runs.map(r => shortDate(r.start) + ' (' + (r.completedDays || 0) + ' days)').join(' · ')}</div>` : '';
    if (userData.companyId) {
      card.innerHTML = `<h3>Run the 21 days again</h3>
        <p style="font-size:0.9rem;color:var(--slate);margin-top:6px;">Your company runs the challenge in cohorts. Ask your program lead about the next one. Everything here keeps working in the meantime.</p>${runsHtml}`;
      return;
    }
    card.innerHTML = `<h3>Run the 21 days again</h3>
      <p style="font-size:0.9rem;color:var(--slate);margin-top:6px;">Start a fresh 21-day run from today. Your Peace of Mind Account, breathing history, and health action carry over. This run's daily check-ins are archived as a summary.</p>
      <button type="button" class="btn btn-outline btn-full" id="restart-btn" style="margin-top:10px;">Restart the challenge</button>
      <div id="restart-confirm" style="display:none;margin-top:10px;padding:12px;border:1px solid var(--amber);border-radius:var(--radius);background:var(--amber-soft);color:var(--navy);">
        <div style="font-weight:600;margin-bottom:8px;">Start over from Day 0 today?</div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-primary" id="restart-yes" style="flex:1;">Yes, restart</button>
          <button type="button" class="btn btn-outline" id="restart-no" style="flex:1;">Not now</button>
        </div>
      </div>${runsHtml}`;
    document.getElementById('restart-btn').onclick = () => { document.getElementById('restart-confirm').style.display = 'block'; };
    document.getElementById('restart-no').onclick = () => { document.getElementById('restart-confirm').style.display = 'none'; };
    document.getElementById('restart-yes').onclick = async () => {
      const yes = document.getElementById('restart-yes');
      yes.disabled = true; yes.textContent = 'Restarting...';
      try {
        await restartChallenge(userData, dailyLogs, progressData, postSurvey);
      } catch (err) {
        console.error('restart failed', err);
        yes.disabled = false; yes.textContent = 'Yes, restart';
        showToast('Restart failed. Check your connection and try again.');
      }
    };
  }

  async function restartChallenge(userData, dailyLogs, progressData, postSurvey) {
    const userRef = db.collection('users').doc(uid);
    // Fresh reads: the post-survey may have been completed this session, and the
    // logs may have changed since the page loaded.
    const [postFresh, logSnap] = await Promise.all([
      Privacy.loadAssessment(uid, 'post'),
      userRef.collection('dailyLogs').get()
    ]);
    const post = postFresh || postSurvey;
    const run = {
      start: userData.challengeStartDate,
      end: todayKey(),
      completedDays: progressData ? progressData.completedDays : 0,
      streak: progressData ? progressData.streak : 0
    };
    if (post && post.responses) run.postResponses = post.responses;

    // One atomic batch: archive + reset boundary + wipe + new start date
    const batch = db.batch();
    batch.set(settingsRef(), { pastRuns: (settings.pastRuns || []).concat([run]), resetAt: null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const keys = {};
    Object.keys(dailyLogs || {}).forEach(k => { keys[k] = 1; });
    logSnap.forEach(d => { keys[d.id] = 1; });
    // Each day's owner-only private subdoc goes with its shell (subcollections are
    // not deleted with their parent doc).
    Object.keys(keys).forEach(k => {
      batch.delete(Privacy.dailyPrivateRef(uid, k));
      batch.delete(userRef.collection('dailyLogs').doc(k));
    });
    batch.delete(Privacy.assessPrivateRef(uid, 'post'));
    batch.delete(userRef.collection('assessments').doc('post'));
    batch.update(userRef, { challengeStartDate: todayKey() });
    await batch.commit();
    localStorage.removeItem('checkinDraft');
    localStorage.removeItem('onboardingSeen');
    window.location.reload();
  }

  function init(h) { hooks = Object.assign(hooks, h || {}); }

  return {
    init, load, getSettings, getLogs, saveSettings, saveLog, buildSeries, actionStreak, windowStats,
    renderCapture, renderHome, refreshHome, renderRestartCard, dateKey, addDays, dateForDay, todayKey, shortDate, fmtMoney,
    weekKey, recordActivity
  };
})();
