// 4x4x4x4 Breathing Timer
const BreathingTimer = (() => {
  const circle = document.getElementById('breathing-circle');
  const textEl = document.getElementById('breathing-text');
  const countEl = document.getElementById('breathing-count');
  const cycleEl = document.getElementById('breathing-cycle');
  const startBtn = document.getElementById('breathing-start');
  const stopBtn = document.getElementById('breathing-stop');

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
  let timerInterval = null;
  let currentPhase = 0;
  let currentCount = 0;
  let currentCycle = 0;

  function start() {
    running = true;
    currentPhase = 0;
    currentCycle = 1;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-flex';
    runPhase();
  }

  function stop() {
    running = false;
    clearInterval(timerInterval);
    circle.className = 'breathing-circle';
    textEl.textContent = 'Ready';
    countEl.textContent = '';
    cycleEl.textContent = 'Tap Start to begin';
    startBtn.style.display = 'inline-flex';
    stopBtn.style.display = 'none';
  }

  function runPhase() {
    if (!running) return;

    if (currentCycle > TOTAL_CYCLES) {
      complete();
      return;
    }

    const phase = PHASES[currentPhase];
    currentCount = phase.duration;

    // Haptic + audio feedback on phase change
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
    clearInterval(timerInterval);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    playChime(784, 0.8);
    setTimeout(() => playChime(1047, 0.6), 300);
    sessionCount++;
    localStorage.setItem('breathingSessions', String(sessionCount));
    if (totalEl) totalEl.textContent = sessionCount;
    circle.className = 'breathing-circle';
    textEl.textContent = 'Complete!';
    countEl.textContent = '';
    cycleEl.textContent = '4 cycles done. Great job!';
    startBtn.style.display = 'inline-flex';
    startBtn.textContent = 'Restart';
    stopBtn.style.display = 'none';
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);

  // Spacebar to start/stop when breathing view is active
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space') return;
    const breathingView = document.getElementById('view-breathing');
    if (!breathingView || !breathingView.classList.contains('active')) return;
    e.preventDefault();
    if (running) stop(); else start();
  });

  return { start, stop };
})();
