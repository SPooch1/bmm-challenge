// Peace of Mind Account (savings tracker)
const PeaceOfMind = (() => {
  const amountEl = document.getElementById('savings-amount');
  const ringCircle = document.getElementById('savings-ring-circle');
  const addBtn = document.getElementById('savings-add');
  const inputEl = document.getElementById('savings-input');
  const historyEl = document.getElementById('savings-history');

  const GOAL = 500;
  const MILESTONES = [
    { amount: 100, emoji: '🌱', msg: 'First $100 saved!' },
    { amount: 250, emoji: '💪', msg: 'Halfway there — $250!' },
    { amount: 500, emoji: '🎉', msg: '$500 Goal Reached!' }
  ];
  let entries = [];
  let uid = null;
  let currentDay = 0;

  async function load(userId, day) {
    uid = userId;
    currentDay = day || 0;
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists || !doc.data()) {
      entries = [];
    } else {
      entries = doc.data().savingsEntries || [];
    }
    render();
  }

  function getTotal() {
    return entries.reduce((sum, e) => sum + e.amount, 0);
  }

  function formatDate(isoOrReadable) {
    const d = new Date(isoOrReadable + (isoOrReadable.length === 10 ? 'T12:00:00' : ''));
    return isNaN(d) ? isoOrReadable : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function render() {
    const total = getTotal();
    amountEl.textContent = '$' + total.toFixed(2);
    const pct = Math.min(100, Math.round((total / GOAL) * 100));
    if (ringCircle) {
      const circumference = 326.73;
      ringCircle.style.strokeDashoffset = circumference - (pct / 100) * circumference;
      ringCircle.style.stroke = total >= GOAL ? 'var(--green)' : 'var(--amber)';
    }

    // Goal reached
    if (total >= GOAL) {
      amountEl.style.color = 'var(--green)';
      const goalEl = document.querySelector('.savings-goal');
      if (goalEl) goalEl.innerHTML = '<strong style="color:var(--green);">Goal reached!</strong>';
    } else {
      amountEl.style.color = '';
      const goalEl = document.querySelector('.savings-goal');
      if (goalEl) goalEl.textContent = 'of $' + GOAL + ' goal';
    }

    // Pace nudge — are they on track for $500 by Day 21?
    const paceEl = document.getElementById('savings-pace');
    if (paceEl) {
      if (total >= GOAL || currentDay <= 0) {
        paceEl.textContent = '';
      } else {
        const expected = GOAL * Math.min(currentDay, 21) / 21;
        if (total >= expected) {
          paceEl.textContent = '✅ On track for $500 by Day 21';
          paceEl.style.color = 'var(--green)';
        } else {
          paceEl.textContent = '$' + Math.ceil(expected - total) + ' to get back on pace for Day 21';
          paceEl.style.color = 'var(--slate)';
        }
      }
    }

    if (entries.length === 0) {
      historyEl.innerHTML = '<p style="color:var(--slate);font-size:0.8rem;">No deposits yet. Start small — even $5 counts.</p>';
    } else {
      historyEl.innerHTML = entries.slice().reverse().slice(0, 10).map((e, i) => {
        const originalIdx = entries.length - 1 - i;
        return `<div style="display:flex;align-items:center;gap:4px;padding:5px 0;font-size:0.8rem;border-bottom:1px solid var(--border);">
          <span style="flex:1;">+$${e.amount.toFixed(2)}</span>
          <span style="color:var(--slate);margin-right:8px;">${formatDate(e.date)}</span>
          <button class="delete-entry-btn" data-idx="${originalIdx}" style="background:none;border:none;color:var(--text-light);cursor:pointer;font-size:1rem;line-height:1;padding:0 2px;opacity:0.5;" title="Remove entry">&times;</button>
        </div>`;
      }).join('');
    }
  }

  function showMilestone(m) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,var(--navy),var(--navy-light));color:#fff;padding:24px 32px;border-radius:16px;text-align:center;z-index:500;font-weight:600;font-size:1.1rem;box-shadow:0 12px 40px rgba(15,23,42,0.45);';
    const sub = m.amount >= GOAL ? '<br><span style="font-size:0.85rem;font-weight:400;opacity:0.9;">Your Peace of Mind Account is funded.</span>' : '';
    el.innerHTML = '<img src="/icons/bitsy.png" alt="Bitsy" style="width:64px;height:64px;margin-bottom:8px;animation:bitsy-pop 0.5s cubic-bezier(0.34,1.56,0.64,1);"><br>' + m.emoji + ' ' + m.msg + sub;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }, 3200);
  }

  async function addEntry() {
    const val = parseFloat(inputEl.value);
    if (!val || val <= 0) return;

    const prevTotal = getTotal();

    entries.push({
      amount: val,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    });

    await db.collection('users').doc(uid).update({ savingsEntries: entries });

    inputEl.value = '';
    render();

    const newTotal = getTotal();
    MILESTONES.forEach(m => {
      if (prevTotal < m.amount && newTotal >= m.amount) showMilestone(m);
    });
  }

  async function deleteEntry(idx) {
    if (idx < 0 || idx >= entries.length) return;
    if (!confirm('Remove this entry?')) return;
    entries.splice(idx, 1);
    await db.collection('users').doc(uid).update({ savingsEntries: entries });
    render();
  }

  historyEl.addEventListener('click', e => {
    const btn = e.target.closest('.delete-entry-btn');
    if (btn) deleteEntry(parseInt(btn.dataset.idx));
  });

  addBtn.addEventListener('click', addEntry);
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } });

  return { load, getTotal };
})();
