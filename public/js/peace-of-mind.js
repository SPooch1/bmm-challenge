// Peace of Mind Account (savings tracker)
const PeaceOfMind = (() => {
  const amountEl = document.getElementById('savings-amount');
  const barFill = document.getElementById('savings-bar-fill');
  const addBtn = document.getElementById('savings-add');
  const inputEl = document.getElementById('savings-input');
  const historyEl = document.getElementById('savings-history');

  const GOAL = 500;
  let entries = [];
  let uid = null;

  async function load(userId) {
    uid = userId;
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
    barFill.style.width = pct + '%';

    // Goal reached
    if (total >= GOAL) {
      amountEl.style.color = 'var(--green)';
      barFill.style.background = 'var(--green)';
      const goalEl = document.querySelector('.savings-goal');
      if (goalEl) goalEl.innerHTML = '<strong style="color:var(--green);">Goal reached!</strong>';
    } else {
      amountEl.style.color = '';
      const goalEl = document.querySelector('.savings-goal');
      if (goalEl) goalEl.textContent = 'of $' + GOAL + ' goal';
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

  function showGoalCelebration() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--green);color:#fff;padding:24px 32px;border-radius:14px;text-align:center;z-index:500;font-weight:600;font-size:1.1rem;box-shadow:0 8px 32px rgba(46,204,113,0.4);';
    el.innerHTML = '&#127881; $500 Goal Reached!<br><span style="font-size:0.85rem;font-weight:400;opacity:0.9;">Your Peace of Mind Account is funded.</span>';
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }, 3500);
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

    if (prevTotal < GOAL && getTotal() >= GOAL) {
      showGoalCelebration();
    }
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
