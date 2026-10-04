// Peace of Mind Account (savings tracker)
// During the 21 days: the $500 starter goal, paced to Day 21.
// After: the person's own Peace of Mind number (one month of essentials, written
// on Day 2) with 1 / 2 / 3-month milestones, deposits and withdrawals, and a pace
// line based on their real deposit rate.
const PeaceOfMind = (() => {
  const amountEl = document.getElementById('savings-amount');
  const ringCircle = document.getElementById('savings-ring-circle');
  const addBtn = document.getElementById('savings-add');
  const useBtn = document.getElementById('savings-use');
  const inputEl = document.getElementById('savings-input');
  const historyEl = document.getElementById('savings-history');

  const STARTER = 500;
  let entries = [];
  let uid = null;
  let currentDay = 0;
  let marginMode = false;
  let target = 0;

  async function load(userId, day, opts) {
    uid = userId;
    currentDay = day || 0;
    opts = opts || {};
    marginMode = !!opts.marginMode;
    target = opts.target || 0;
    // Owner-only users/{uid}/private/savings (falls back to the pre-split user-doc array)
    entries = await Privacy.loadSavings(uid);
    render();
  }

  function setTarget(n) { target = n || 0; render(); }
  function getTotal() { return entries.reduce((sum, e) => sum + (e.amount || 0), 0); }
  function getEntries() { return entries; }

  // Every entry gets an ISO day key; older entries only have the readable date.
  function entryKey(e) {
    if (e.iso) return e.iso;
    if (typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) return e.date; // ISO stays local, never UTC-shifted
    const d = new Date(e.date);
    return isNaN(d) ? null : Margin.dateKey(d);
  }
  function sumBetween(fromKey, toKey) {
    return entries.reduce((s, e) => {
      const k = entryKey(e);
      return k && k >= fromKey && k <= toKey ? s + (e.amount || 0) : s;
    }, 0);
  }

  function fmt(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function formatDate(e) {
    const k = entryKey(e);
    if (k) return new Date(k + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return e.date || '';
  }

  function milestones() {
    const list = [{ amount: STARTER, label: '$500 starter goal', emoji: '🎉', msg: '$500 starter goal reached!' }];
    if (target > 0) {
      [1, 2, 3].forEach(m => {
        const amt = target * m;
        const label = m + (m === 1 ? ' month' : ' months') + ' of essentials';
        const same = list.find(x => x.amount === amt);
        if (same) { same.label += ' · ' + label; return; } // e.g. a $500 number: starter = 1 month
        list.push({ amount: amt, label, emoji: m === 3 ? '🏆' : '💪', msg: label + ' funded!' });
      });
    } else {
      list.unshift({ amount: 100, label: 'first $100', emoji: '🌱', msg: 'First $100 saved!' });
      list.splice(1, 0, { amount: 250, label: 'halfway to $500', emoji: '💪', msg: 'Halfway there, $250!' });
    }
    return list.sort((a, b) => a.amount - b.amount);
  }

  function nextMilestone(total) {
    const ms = milestones();
    return ms.find(m => total < m.amount) || null;
  }

  function monthlyDepositRate() {
    // Average monthly net deposits over the trailing 90 days (or since the first
    // entry if the account is younger than that).
    const today = Margin.todayKey();
    const keys = entries.map(entryKey).filter(Boolean).sort();
    if (!keys.length) return 0;
    const firstKey = keys[0];
    const start90 = Margin.addDays(today, -89);
    const from = firstKey > start90 ? firstKey : start90;
    const days = Math.max(7, Math.round((new Date(today + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000) + 1);
    const sum = sumBetween(from, today);
    return sum / (days / 30.4);
  }

  function render() {
    const total = getTotal();
    amountEl.textContent = '$' + total.toFixed(2);
    // During the 21 days the ring is the $500 starter goal, full stop (settled).
    // After Day 21 it advances through the personal milestones.
    const ladderNext = nextMilestone(total);
    const next = marginMode ? ladderNext : (total < STARTER ? { amount: STARTER, label: 'starter goal' } : null);
    const ringGoal = next ? next.amount : (marginMode ? (milestones().slice(-1)[0] || {}).amount || STARTER : STARTER);
    const pct = Math.max(0, Math.min(100, Math.round((total / ringGoal) * 100)));
    if (ringCircle) {
      const circumference = 326.73;
      ringCircle.style.strokeDashoffset = circumference - (pct / 100) * circumference;
      ringCircle.style.stroke = !next ? 'var(--green)' : 'var(--amber)';
    }

    const goalEl = document.querySelector('.savings-goal');
    if (goalEl) {
      if (!next && !marginMode) {
        goalEl.innerHTML = '<strong style="color:var(--green);">Goal reached!</strong>';
        amountEl.style.color = 'var(--green)';
      } else if (!next) {
        goalEl.innerHTML = '<strong style="color:var(--green);">' + (target ? '3 months of essentials funded' : 'Goal reached!') + '</strong>';
        amountEl.style.color = 'var(--green)';
      } else {
        goalEl.textContent = 'of ' + fmt(next.amount) + ' · ' + next.label;
        amountEl.style.color = '';
      }
    }

    // Intro line + target editor
    const intro = document.getElementById('savings-intro');
    if (intro) {
      if (target) {
        const months = total / target;
        intro.innerHTML = 'Your Peace of Mind number is <strong>' + fmt(target) + '</strong> a month. You have <strong>' + months.toFixed(1) + '</strong> ' + (months === 1 ? 'month' : 'months') + ' of essentials set aside.';
      } else {
        intro.innerHTML = 'Track your $500 starter goal, your financial safety net. ' + (currentDay >= 2 || marginMode ? 'Add your Peace of Mind number below to track months of essentials.' : '');
      }
    }
    const targetRow = document.getElementById('savings-target-row');
    if (targetRow) {
      targetRow.style.display = (currentDay >= 2 || marginMode) ? 'block' : 'none';
      const cur = document.getElementById('savings-target-current');
      if (cur) cur.textContent = target ? fmt(target) + ' a month' : 'Not set yet';
    }

    // Milestone ladder
    const ladder = document.getElementById('savings-milestones');
    if (ladder) {
      ladder.innerHTML = milestones().map(m => {
        const hit = total >= m.amount;
        return `<div class="ms-row ${hit ? 'hit' : ''}"><span class="ms-dot">${hit ? '✓' : ''}</span><span style="flex:1;">${m.label}</span><span>${fmt(m.amount)}</span></div>`;
      }).join('');
    }

    // Pace line
    const paceEl = document.getElementById('savings-pace');
    if (paceEl) {
      paceEl.style.color = 'var(--slate)';
      if (!next) {
        paceEl.textContent = '';
      } else if (!marginMode) {
        if (total >= STARTER || currentDay <= 0) {
          paceEl.textContent = '';
        } else {
          const expected = STARTER * Math.min(currentDay, 21) / 21;
          if (total >= expected) { paceEl.textContent = '✅ On track for $500 by Day 21'; paceEl.style.color = 'var(--green)'; }
          else paceEl.textContent = fmt(Math.ceil(expected - total)) + ' to get back on pace for Day 21';
        }
      } else {
        const rate = monthlyDepositRate();
        if (rate <= 0) {
          paceEl.textContent = 'Add a deposit to see your pace.';
        } else {
          const monthsLeft = (next.amount - total) / rate;
          const eta = new Date(); eta.setDate(1); eta.setMonth(eta.getMonth() + Math.ceil(monthsLeft)); // day 1 first so short months never overflow
          const when = monthsLeft < 1 ? 'within the month' : 'in about ' + Math.ceil(monthsLeft) + ' months (' + eta.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) + ')';
          paceEl.textContent = 'At about ' + fmt(rate) + ' a month, you reach ' + next.label + ' ' + when + '.';
        }
      }
    }

    if (entries.length === 0) {
      historyEl.innerHTML = '<p style="color:var(--slate);font-size:0.8rem;">No deposits yet. Start small. Even $5 counts.</p>';
    } else {
      historyEl.innerHTML = entries.slice().reverse().slice(0, 12).map((e, i) => {
        const originalIdx = entries.length - 1 - i;
        const neg = e.amount < 0;
        return `<div style="display:flex;align-items:center;gap:4px;padding:5px 0;font-size:0.8rem;border-bottom:1px solid var(--border);">
          <span style="flex:1;${neg ? 'color:var(--amber-dark);' : ''}">${neg ? '-$' + Math.abs(e.amount).toFixed(2) + ' used' : '+$' + e.amount.toFixed(2)}</span>
          <span style="color:var(--slate);margin-right:8px;">${formatDate(e)}</span>
          <button class="delete-entry-btn" data-idx="${originalIdx}" style="background:none;border:none;color:var(--text-light);cursor:pointer;font-size:1rem;line-height:1;padding:0 2px;opacity:0.5;" title="Remove entry">&times;</button>
        </div>`;
      }).join('');
    }
  }

  function showMilestone(m) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:linear-gradient(135deg,var(--navy),var(--navy-light));color:#fff;padding:24px 32px;border-radius:16px;text-align:center;z-index:500;font-weight:600;font-size:1.1rem;box-shadow:0 12px 40px rgba(15,23,42,0.45);max-width:90vw;';
    const sub = m.amount >= STARTER ? '<br><span style="font-size:0.85rem;font-weight:400;opacity:0.9;">Your Peace of Mind Account is working.</span>' : '';
    el.innerHTML = '<img src="/icons/bitsy.png" alt="Bitsy" style="width:64px;height:64px;margin-bottom:8px;animation:bitsy-pop 0.5s cubic-bezier(0.34,1.56,0.64,1);"><br>' + m.emoji + ' ' + m.msg + sub;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }, 3200);
  }

  // Save the entries privately, then move the cohort savings total by this
  // person's change (fire-and-forget; never blocks the save).
  async function persist() {
    await Privacy.saveSavings(uid, entries);
    Aggregates.record('savings', Aggregates.savingsDesired(getTotal()));
  }

  async function addEntry(sign) {
    const val = parseFloat(inputEl.value);
    if (!val || val <= 0) return;
    const prevTotal = getTotal();
    if (sign < 0 && val > prevTotal) {
      showToast('That is more than the account holds (' + fmt(prevTotal) + ').');
      return;
    }
    entries.push({
      amount: sign < 0 ? -val : val,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      iso: Margin.todayKey()
    });
    await persist();
    inputEl.value = '';
    render();
    const newTotal = getTotal();
    if (sign > 0) {
      milestones().forEach(m => { if (prevTotal < m.amount && newTotal >= m.amount) showMilestone(m); });
    } else {
      showToast('Logged. That is exactly what the account is for.');
    }
  }

  async function deleteEntry(idx) {
    if (idx < 0 || idx >= entries.length) return;
    if (getTotal() - (entries[idx].amount || 0) < 0) {
      showToast('Removing that would put the account below zero. Remove the withdrawal first.');
      return;
    }
    entries.splice(idx, 1);
    await persist();
    render();
  }

  historyEl.addEventListener('click', e => {
    const btn = e.target.closest('.delete-entry-btn');
    if (!btn) return;
    if (btn.dataset.armed === '1') { deleteEntry(parseInt(btn.dataset.idx)); return; }
    btn.dataset.armed = '1';
    btn.textContent = 'Remove?';
    btn.style.opacity = '1';
    btn.style.color = 'var(--red)';
    btn.style.fontSize = '0.75rem';
    setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.innerHTML = '&times;'; btn.style.opacity = '0.5'; btn.style.color = 'var(--text-light)'; btn.style.fontSize = '1rem'; } }, 3000);
  });

  addBtn.addEventListener('click', () => addEntry(1));
  if (useBtn) useBtn.addEventListener('click', () => addEntry(-1));
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(1); } });

  // Target editor on the Savings view
  const targetEdit = document.getElementById('savings-target-edit');
  if (targetEdit) {
    targetEdit.addEventListener('click', e => {
      e.preventDefault();
      const form = document.getElementById('savings-target-form');
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
      const inp = document.getElementById('savings-target-input');
      if (inp && target) inp.value = Math.round(target);
    });
    document.getElementById('savings-target-save').addEventListener('click', async () => {
      const v = parseFloat(document.getElementById('savings-target-input').value);
      if (!v || v <= 0) return;
      await Margin.saveSettings({ pomTarget: v });
      document.getElementById('savings-target-form').style.display = 'none';
      setTarget(v);
      showToast('Peace of Mind number saved.');
    });
  }

  return { load, getTotal, getEntries, setTarget, sumBetween, getTarget: () => target };
})();
