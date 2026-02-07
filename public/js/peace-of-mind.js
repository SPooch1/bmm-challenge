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
    const data = doc.data();
    entries = data.savingsEntries || [];
    render();
  }

  function getTotal() {
    return entries.reduce((sum, e) => sum + e.amount, 0);
  }

  function render() {
    const total = getTotal();
    amountEl.textContent = '$' + total.toFixed(2);
    const pct = Math.min(100, Math.round((total / GOAL) * 100));
    barFill.style.width = pct + '%';

    if (entries.length === 0) {
      historyEl.innerHTML = '<p style="color:var(--slate);font-size:0.8rem;">No deposits yet.</p>';
    } else {
      historyEl.innerHTML = entries.slice().reverse().slice(0, 10).map(e =>
        `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.8rem;border-bottom:1px solid var(--border);">
          <span>+$${e.amount.toFixed(2)}</span>
          <span style="color:var(--slate);">${e.date}</span>
        </div>`
      ).join('');
    }
  }

  async function addEntry() {
    const val = parseFloat(inputEl.value);
    if (!val || val <= 0) return;

    entries.push({
      amount: val,
      date: new Date().toISOString().split('T')[0]
    });

    await db.collection('users').doc(uid).update({
      savingsEntries: entries
    });

    inputEl.value = '';
    render();
  }

  addBtn.addEventListener('click', addEntry);
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } });

  return { load, getTotal };
})();
