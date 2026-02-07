// Daily check-in module
const Checkin = (() => {
  const form = document.getElementById('checkin-form');
  const savedMsg = document.getElementById('checkin-saved');
  const submitBtn = document.getElementById('checkin-submit');

  async function loadCheckin(uid, day) {
    const doc = await db.collection('users').doc(uid).collection('dailyLogs').doc(String(day)).get();
    if (doc.exists) {
      const data = doc.data();
      document.getElementById('checkin-completed').checked = data.completed || false;
      document.getElementById('checkin-stress').value = data.stress || 5;
      document.getElementById('checkin-sleep').value = data.sleep || 5;
      document.getElementById('checkin-steps').value = data.steps || '';
      document.getElementById('checkin-breathing').checked = data.breathing || false;
      document.getElementById('checkin-meal').checked = data.meal || false;
      // Show saved state
      submitBtn.textContent = 'Update Check-in';
    } else {
      // Reset form
      document.getElementById('checkin-completed').checked = false;
      document.getElementById('checkin-stress').value = 5;
      document.getElementById('checkin-sleep').value = 5;
      document.getElementById('checkin-steps').value = '';
      document.getElementById('checkin-breathing').checked = false;
      document.getElementById('checkin-meal').checked = false;
      submitBtn.textContent = 'Save Check-in';
    }
    savedMsg.style.display = 'none';
  }

  async function saveCheckin(uid, day) {
    const data = {
      completed: document.getElementById('checkin-completed').checked,
      stress: parseInt(document.getElementById('checkin-stress').value),
      sleep: parseInt(document.getElementById('checkin-sleep').value),
      steps: parseInt(document.getElementById('checkin-steps').value) || 0,
      breathing: document.getElementById('checkin-breathing').checked,
      meal: document.getElementById('checkin-meal').checked,
      savedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('users').doc(uid).collection('dailyLogs').doc(String(day)).set(data, { merge: true });

    savedMsg.style.display = 'block';
    submitBtn.textContent = 'Update Check-in';
    setTimeout(() => { savedMsg.style.display = 'none'; }, 3000);
  }

  function init(getUid, getCurrentDay) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      submitBtn.disabled = true;
      try {
        await saveCheckin(getUid(), getCurrentDay());
      } catch (err) {
        console.error('Failed to save check-in:', err);
      }
      submitBtn.disabled = false;
    });
  }

  return { loadCheckin, saveCheckin, init };
})();
