// Daily check-in module
const Checkin = (() => {
  const form = document.getElementById('checkin-form');
  const savedMsg = document.getElementById('checkin-saved');
  const submitBtn = document.getElementById('checkin-submit');
  const actionRow = document.getElementById('checkin-action-row');
  const actionLabel = document.getElementById('checkin-action-label');
  // Days that already have a saved log this session (first save of a day is what
  // the comeback card and the owner's funnel counts care about).
  const logged = {};
  let onSaved = () => {};
  let loadedDay = null;

  // Health action (locked in on Days 17-21) shows as one extra checkbox on the
  // daily check-in so the streak starts before the challenge ends.
  function setHealthAction(text) {
    if (!actionRow) return;
    if (text) {
      actionRow.style.display = 'flex';
      actionLabel.textContent = 'My health action: ' + text;
    } else {
      actionRow.style.display = 'none';
    }
  }

  async function loadCheckin(uid, day) {
    // Shell (engagement) + owner-only private subdoc, merged (privacy.js)
    const data = await Privacy.loadDailyLog(uid, day);
    loadedDay = day;
    if (data) logged[String(day)] = true;
    if (data) {
      document.getElementById('checkin-action').checked = data.action || false;
      document.getElementById('checkin-completed').checked = data.completed || false;
      document.getElementById('checkin-stress').value = data.stress || 5;
      document.getElementById('checkin-sleep').value = data.sleep || 5;
      document.getElementById('checkin-steps').value = data.steps || '';
      document.getElementById('checkin-breathing').checked = data.breathing || false;
      document.getElementById('checkin-meal').checked = data.meal || false;
      document.getElementById('checkin-notes').value = data.notes || '';
      submitBtn.textContent = 'Update Check-in';
      clearDraft(day);
    } else {
      document.getElementById('checkin-action').checked = false;
      document.getElementById('checkin-completed').checked = false;
      document.getElementById('checkin-stress').value = 5;
      document.getElementById('checkin-sleep').value = 5;
      document.getElementById('checkin-steps').value = '';
      document.getElementById('checkin-breathing').checked = false;
      document.getElementById('checkin-meal').checked = false;
      document.getElementById('checkin-notes').value = '';
      submitBtn.textContent = day === Challenge.calculateCurrentDay(Auth.getUser() && Auth.getUser().challengeStartDate) ? 'Save Check-in' : 'Log Day ' + day;
      // Try loading draft if no saved data
      loadDraft(day);
    }
    // Sync slider value displays
    document.getElementById('stress-val').textContent = document.getElementById('checkin-stress').value;
    document.getElementById('sleep-val').textContent = document.getElementById('checkin-sleep').value;
    savedMsg.style.display = 'none';
  }

  async function saveCheckin(uid, day) {
    const data = {
      completed: document.getElementById('checkin-completed').checked,
      action: document.getElementById('checkin-action').checked,
      stress: parseInt(document.getElementById('checkin-stress').value),
      sleep: parseInt(document.getElementById('checkin-sleep').value),
      steps: parseInt(document.getElementById('checkin-steps').value) || 0,
      breathing: document.getElementById('checkin-breathing').checked,
      meal: document.getElementById('checkin-meal').checked,
      notes: document.getElementById('checkin-notes').value.trim()
    };

    // Engagement fields go to the admin-readable shell; stress, sleep, steps and
    // notes go to the owner-only subdoc. The cohort stress total is updated after,
    // fire-and-forget: it can never block or fail the check-in itself.
    await Privacy.saveDailyLog(uid, day, data);
    Aggregates.record(Aggregates.dayBucket(day), { ['d' + day]: data.stress });

    const firstSave = !logged[String(day)];
    logged[String(day)] = true;
    savedMsg.style.display = 'block';
    submitBtn.textContent = 'Update Check-in';
    showConfetti();
    setTimeout(() => { savedMsg.style.display = 'none'; }, 3000);
    try { onSaved(day, firstSave, data); } catch (e) { console.warn('onSaved hook failed', e); }
  }

  function hasLog(day) { return !!logged[String(day)]; }

  function showConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    const colors = ['#0EA5E9', '#F59E0B', '#0284C7', '#38BDF8', '#FBBF24'];
    for (let i = 0; i < 30; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = Math.random() * 0.5 + 's';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.width = (6 + Math.random() * 8) + 'px';
      piece.style.height = (6 + Math.random() * 8) + 'px';
      container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 3000);
  }

  // Auto-save draft to localStorage, one draft per challenge day
  const draftKey = day => 'checkinDraft:' + (day == null ? loadedDay : day);
  function saveDraft() {
    const draft = {
      completed: document.getElementById('checkin-completed').checked,
      action: document.getElementById('checkin-action').checked,
      stress: document.getElementById('checkin-stress').value,
      sleep: document.getElementById('checkin-sleep').value,
      steps: document.getElementById('checkin-steps').value,
      breathing: document.getElementById('checkin-breathing').checked,
      meal: document.getElementById('checkin-meal').checked,
      notes: document.getElementById('checkin-notes').value
    };
    try { localStorage.setItem(draftKey(), JSON.stringify(draft)); } catch (e) { /* storage unavailable */ }
  }

  function loadDraft(day) {
    let raw = null;
    try { raw = localStorage.getItem(draftKey(day)); } catch (e) { /* storage unavailable */ }
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      document.getElementById('checkin-completed').checked = d.completed || false;
      document.getElementById('checkin-action').checked = d.action || false;
      document.getElementById('checkin-stress').value = d.stress || 5;
      document.getElementById('checkin-sleep').value = d.sleep || 5;
      document.getElementById('checkin-steps').value = d.steps || '';
      document.getElementById('checkin-breathing').checked = d.breathing || false;
      document.getElementById('checkin-meal').checked = d.meal || false;
      document.getElementById('checkin-notes').value = d.notes || '';
      document.getElementById('stress-val').textContent = d.stress || 5;
      document.getElementById('sleep-val').textContent = d.sleep || 5;
    } catch (e) { /* ignore bad draft */ }
  }

  function clearDraft(day) {
    try { localStorage.removeItem(draftKey(day)); } catch (e) { /* storage unavailable */ }
  }

  function init(getUid, getCurrentDay, savedHook) {
    if (typeof savedHook === 'function') onSaved = savedHook;
    // Auto-save on any input change
    ['checkin-completed', 'checkin-action', 'checkin-stress', 'checkin-sleep', 'checkin-steps', 'checkin-breathing', 'checkin-meal', 'checkin-notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', saveDraft);
      if (el) el.addEventListener('change', saveDraft);
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      submitBtn.disabled = true;
      try {
        const day = getCurrentDay();
        await saveCheckin(getUid(), day);
        clearDraft(day);
      } catch (err) {
        console.error('Failed to save check-in:', err);
        savedMsg.textContent = 'Save failed. Check your connection and try again.';
        savedMsg.style.color = 'var(--red)';
        savedMsg.style.display = 'block';
        setTimeout(() => { savedMsg.style.display = 'none'; savedMsg.textContent = 'Saved!'; savedMsg.style.color = 'var(--green)'; }, 4000);
      }
      submitBtn.disabled = false;
    });
  }

  return { loadCheckin, saveCheckin, init, setHealthAction, showConfetti, hasLog };
})();
