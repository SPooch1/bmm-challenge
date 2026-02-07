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

  const TOTAL_CYCLES = 4;
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

  return { start, stop };
})();
