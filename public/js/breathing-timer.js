// 4x4x4x4 Breathing Timer
// Each completed session is saved with its date and an optional before/after
// stress rating (users/{uid}/breathSessions), so the person can see what the
// technique does for them over time. The lifetime counter on the user doc stays
// for the cohort dashboard.
const BreathingTimer = (() => {
  const circle = document.getElementById('breathing-circle');
  const textEl = document.getElementById('breathing-text');
  const countEl = document.getElementById('breathing-count');
  const cycleEl = document.getElementById('breathing-cycle');
  const startBtn = document.getElementById('breathing-start');
  const stopBtn = document.getElementById('breathing-stop');
  const pauseBtn = document.getElementById('breathing-pause');
  const beforeWrap = document.getElementById('breath-before');
  const afterWrap = document.getElementById('breath-after');
  const statsEl = document.getElementById('breathing-stats');

  const PHASES = [
    { name: 'Breathe In', class: 'inhale', duration: 4 },
    { name: 'Hold', class: 'hold', duration: 4 },
    { name: 'Breathe Out', class: 'exhale', duration: 4 },
    { name: 'Hold', class: 'hold-out', duration: 4 }
  ];

  // Chime sound via Web Audio API
  let audioCtx = null;
  function playChime(freq, duration) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* audio not supported */ }
  }

  const TOTAL_CYCLES = 4;
  let sessionCount = parseInt(localStorage.getItem('breathingSessions') || '0');
  const totalEl = document.getElementById('breathing-total');
  if (totalEl) totalEl.textContent = sessionCount;
  let running = false;
  let paused = false;
  let timerInterval = null;
  let currentPhase = 0;
  let currentCount = 0;
  let currentCycle = 0;
  let beforeVal = null;
  let sessions = [];
  let pendingSessionRef = null;

  // ---- before / after rating chips ----
  function chips(container, name, onPick) {
    if (!container) return;
    const row = container.querySelector('.chip-row');
    if (!row) return;
    row.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = i;
      b.setAttribute('aria-label', name + ' stress ' + i + ' of 10');
      b.onclick = () => {
        row.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
        b.classList.add('on');
        onPick(i);
      };
      row.appendChild(b);
    }
  }
  chips(beforeWrap, 'Before', v => { beforeVal = v; });
  // After-rating: the session ref is captured per call so two quick taps cannot
  // race; the ref is kept so a correction re-saves the same session.
  let sessionBefore = null;
  chips(afterWrap, 'After', async v => {
    const ref = pendingSessionRef;
    const note = afterWrap.querySelector('.chip-note');
    if (!ref) { if (note) note.textContent = 'This session was not saved (offline?).'; return; }
    let ok = true;
    try { await ref.set({ after: v }, { merge: true }); } catch (e) { ok = false; }
    if (ok) {
      const s = sessions.find(x => x.id === ref.id);
      if (s) s.after = v;
    }
    if (note) {
      if (!ok) note.textContent = 'Could not save the rating. Check your connection.';
      else if (sessionBefore != null && v < sessionBefore) note.textContent = 'Down ' + (sessionBefore - v) + ' in two minutes. Saved.';
      else if (sessionBefore != null && v === sessionBefore) note.textContent = 'Held steady. Saved.';
      else note.textContent = 'Saved.';
    }
    // Ready for the next session's before-rating
    showBefore(true);
    renderStats();
  });

  function showBefore(show) {
    if (!beforeWrap) return;
    beforeWrap.style.display = show ? 'block' : 'none';
    if (show) { beforeVal = null; beforeWrap.querySelectorAll('.chip').forEach(c => c.classList.remove('on')); }
  }
  function showAfter(show) {
    if (!afterWrap) return;
    afterWrap.style.display = show ? 'block' : 'none';
    if (show) {
      afterWrap.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
      const note = afterWrap.querySelector('.chip-note');
      if (note) note.textContent = '';
    }
  }
  showBefore(true);
  showAfter(false);

  function start() {
    running = true;
    paused = false;
    currentPhase = 0;
    currentCycle = 1;
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-flex';
    pauseBtn.textContent = 'Pause';
    stopBtn.style.display = 'inline-flex';
    // Lock this session's before-rating and clear it so a restart never reuses it
    sessionBefore = beforeVal;
    beforeVal = null;
    pendingSessionRef = null;
    if (beforeWrap) beforeWrap.style.display = 'none';
    showAfter(false);
    runPhase();
  }

  function pause() {
    running = false;
    paused = true;
    clearInterval(timerInterval);
    pauseBtn.textContent = 'Resume';
    cycleEl.textContent = 'Paused. Tap Resume to continue';
  }

  function resume() {
    running = true;
    paused = false;
    pauseBtn.textContent = 'Pause';
    cycleEl.textContent = `Cycle ${currentCycle} of ${TOTAL_CYCLES}`;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      currentCount--;
      countEl.textContent = currentCount;
      if (currentCount <= 0) {
        clearInterval(timerInterval);
        currentPhase++;
        if (currentPhase >= PHASES.length) {
          currentPhase = 0;
          currentCycle++;
        }
        runPhase();
      }
    }, 1000);
  }

  function stop() {
    running = false;
    paused = false;
    clearInterval(timerInterval);
    circle.className = 'breathing-circle';
    textEl.textContent = 'Ready';
    countEl.textContent = '';
    cycleEl.textContent = 'Tap Start or press Space to begin';
    startBtn.style.display = 'inline-flex';
    startBtn.textContent = 'Start';
    pauseBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    showBefore(true);
    showAfter(false);
  }

  function runPhase() {
    if (!running) return;

    if (currentCycle > TOTAL_CYCLES) {
      complete();
      return;
    }

    const phase = PHASES[currentPhase];
    currentCount = phase.duration;

    if (navigator.vibrate) navigator.vibrate(50);
    const tones = { inhale: 523, hold: 659, exhale: 440, 'hold-out': 392 };
    playChime(tones[phase.class] || 440, 0.4);

    circle.className = 'breathing-circle ' + phase.class;
    textEl.textContent = phase.name;
    countEl.textContent = currentCount;
    cycleEl.textContent = `Cycle ${currentCycle} of ${TOTAL_CYCLES}`;

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      currentCount--;
      if (currentCount <= 0) {
        clearInterval(timerInterval);
        currentPhase++;
        if (currentPhase >= PHASES.length) {
          currentPhase = 0;
          currentCycle++;
        }
        runPhase();
      } else {
        countEl.textContent = currentCount;
      }
    }, 1000);
  }

  function complete() {
    running = false;
    paused = false;
    clearInterval(timerInterval);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    playChime(784, 0.8);
    setTimeout(() => playChime(1047, 0.6), 300);
    sessionCount++;
    localStorage.setItem('breathingSessions', String(sessionCount));
    if (totalEl) totalEl.textContent = sessionCount;
    try {
      const uid = typeof Auth !== 'undefined' && Auth.getUid ? Auth.getUid() : null;
      if (uid) {
        db.collection('users').doc(uid).update({ breathingSessions: sessionCount }).catch(() => {});
        const ref = db.collection('users').doc(uid).collection('breathSessions').doc();
        const rec = { date: Margin.todayKey(), before: sessionBefore, after: null, cycles: TOTAL_CYCLES, at: firebase.firestore.FieldValue.serverTimestamp() };
        pendingSessionRef = ref;
        ref.set(rec).then(() => {
          sessions.unshift({ id: ref.id, date: rec.date, before: sessionBefore, after: null });
          renderStats();
          if (Margin.recordActivity) Margin.recordActivity(rec.date, { breath: true });
        }).catch(() => {
          if (pendingSessionRef === ref) pendingSessionRef = null;
          sessionCount = Math.max(0, sessionCount - 1);
          localStorage.setItem('breathingSessions', String(sessionCount));
          if (totalEl) totalEl.textContent = sessionCount;
          if (typeof showToast === 'function') showToast('Session finished but could not be saved. Check your connection.');
        });
      }
    } catch (e) { /* ignore */ }
    circle.className = 'breathing-circle';
    textEl.textContent = 'Complete!';
    countEl.textContent = '';
    cycleEl.textContent = '4 cycles done. Great job!';
    startBtn.style.display = 'inline-flex';
    startBtn.textContent = 'Restart';
    pauseBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    showAfter(true);
    renderStats();
  }

  // ---- history / stats ----
  async function loadStats(uid) {
    try {
      const snap = await db.collection('users').doc(uid).collection('breathSessions')
        .orderBy('at', 'desc').limit(200).get();
      sessions = [];
      snap.forEach(d => { const x = d.data(); sessions.push({ id: d.id, date: x.date, before: x.before, after: x.after }); });
    } catch (e) {
      console.warn('breathSessions load failed', e);
      sessions = [];
    }
    renderStats();
    return sessions;
  }

  // The account's server count always wins over this device's localStorage:
  // a new phone starts at 0, and a shared device must not carry one account's
  // total into another.
  function setCount(n) {
    sessionCount = parseInt(n) || 0;
    localStorage.setItem('breathingSessions', String(sessionCount));
    if (totalEl) totalEl.textContent = sessionCount;
  }

  function countBetween(fromKey, toKey) {
    return sessions.filter(s => s.date && s.date >= fromKey && s.date <= toKey).length;
  }
  function getSessions() { return sessions; }

  function renderStats() {
    if (!statsEl) return;
    const today = Margin.todayKey();
    const week = countBetween(Margin.addDays(today, -6), today);
    const rated = sessions.filter(s => s.before != null && s.after != null);
    let html = `<div class="week-row"><span>This week</span><strong>${week} ${week === 1 ? 'session' : 'sessions'}</strong><span></span></div>`;
    html += `<div class="week-row"><span>All time</span><strong>${Math.max(sessionCount, sessions.length)}</strong><span></span></div>`;
    if (rated.length) {
      const avgB = rated.reduce((a, s) => a + s.before, 0) / rated.length;
      const avgA = rated.reduce((a, s) => a + s.after, 0) / rated.length;
      const drop = avgB - avgA;
      html += `<div class="week-row"><span>Your stress, before → after</span><strong>${avgB.toFixed(1)} → ${avgA.toFixed(1)}</strong><span style="color:${drop > 0 ? 'var(--green)' : 'var(--slate)'};">${drop > 0 ? 'down ' + drop.toFixed(1) : ''}</span></div>`;
      html += `<div style="font-size:0.72rem;color:var(--slate);margin-top:6px;">Across your ${rated.length} rated ${rated.length === 1 ? 'session' : 'sessions'}. Rate before and after to keep this honest.</div>`;
    } else {
      html += `<div style="font-size:0.72rem;color:var(--slate);margin-top:6px;">Rate your stress before and after a session to see what the technique does for you.</div>`;
    }
    statsEl.innerHTML = html;
  }

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', () => { if (paused) resume(); else pause(); });
  stopBtn.addEventListener('click', stop);

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    const breathingView = document.getElementById('view-breathing');
    if (!breathingView || !breathingView.classList.contains('active')) return;
    if (e.target && /INPUT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
    e.preventDefault();
    if (!running && !paused) start();
    else if (running) pause();
    else if (paused) resume();
  });

  return { start, stop, loadStats, countBetween, getSessions, renderStats, setCount };
})();
