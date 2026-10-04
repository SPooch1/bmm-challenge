// The Employee Roadmap (Months 2-12) inside Keep Your Margin mode.
// Month 1 is the 21-Day Challenge (Module 1, Storm Proof). Module N (2..12)
// unlocks on elapsed day 22 + 30 * (N - 2): Module 2 on Day 22, Module 3 on
// Day 52, ... Module 12 on Day 322. Shown only when the person's invite code has
// roadmap: true (set per code by the program owner in the dashboard Invite tab).
// "Mark this step done" lives owner-only in users/{uid}/private/margin.roadmap.{N} = { doneAt }.
const Roadmap = (() => {
  // Module PDFs. Titles, phases and action steps come from the module sources in
  // Basecamp/assets/bmm/employee-roadmap-modules/modules/*.html (META block).
  const CONFIG = {
    baseUrl: 'https://bmm-deliverables-a.s3.amazonaws.com/employee-roadmap/',
    modules: [
      { n: 1, title: 'Storm Proof', file: 'Employee_Roadmap_Module_01_Storm_Proof.pdf', step: 'I have a separate Peace of Mind (P.O.M.) account funded by payroll deduction.' },
      { n: 2, title: 'Picture It', file: 'Employee_Roadmap_Module_02_Picture_It.pdf', step: "I've logged into my 401(k) account and imagined how I want life to look when I reach age 70." },
      { n: 3, title: 'Know Your #s', file: 'Employee_Roadmap_Module_03_Know_Your_Numbers.pdf', step: "I know where all my money went last month and use it to guide this month's spending." },
      { n: 4, title: 'Destroy Debt', file: 'Employee_Roadmap_Module_04_Destroy_Debt.pdf', step: 'I have a debt-destruction system in place and am aggressively paying down my debt.' },
      { n: 5, title: 'Retirement Reality', file: 'Employee_Roadmap_Module_05_Retirement_Reality.pdf', step: 'I have all my important documents in one file, plus a list of passwords & key info.' },
      { n: 6, title: 'Investing: Building Blocks', file: 'Employee_Roadmap_Module_06_Investing_Building_Blocks.pdf', step: 'I have a list of all my investment accounts and have considered consolidating some.' },
      { n: 7, title: 'Investing: OK, Now What?', file: 'Employee_Roadmap_Module_07_Investing_OK_Now_What.pdf', step: 'I have a plan for how my dollars are allocated and for how & when to make changes.' },
      { n: 8, title: "Lookin' Good, Feelin' Good", file: 'Employee_Roadmap_Module_08_Lookin_Good_Feelin_Good.pdf', step: 'I have updated health numbers and am consistently achieving my MDAs.' },
      { n: 9, title: 'Insurance Demystified', file: 'Employee_Roadmap_Module_09_Insurance_Demystified.pdf', step: 'I have a file for my insurance documents and understand my coverages.' },
      { n: 10, title: 'Ending Well', file: 'Employee_Roadmap_Module_10_Ending_Well.pdf', step: 'I have a current Will, POA & Health Care Directive, and my beneficiary forms are up to date.' },
      { n: 11, title: 'Preparing for the Next Stage', file: 'Employee_Roadmap_Module_11_Preparing_for_the_Next_Stage.pdf', step: 'I have a spending plan and know how much each retirement income source will generate.' },
      { n: 12, title: 'Skill-Up', file: 'Employee_Roadmap_Module_12_Skill_Up.pdf', step: 'I have a plan to learn new skills that help me earn more and make me a valuable employee.' }
    ]
  };
  const PHASES = ['Get Grounded', 'Take Control', 'Grow & Protect', 'Finish Strong'];
  const phaseOf = n => PHASES[Math.floor((n - 1) / 3)];
  const urlOf = m => CONFIG.baseUrl + m.file;
  // Elapsed day on which module n opens (Module 1 = the challenge, from Day 0).
  const unlockDay = n => (n <= 1 ? 0 : 22 + 30 * (n - 2));
  function currentModule(elapsed) {
    let cur = 1;
    for (let n = 2; n <= 12; n++) if (elapsed >= unlockDay(n)) cur = n;
    return cur;
  }

  let enabled = false;
  let startDate = null;

  // Is the Roadmap on for this person? Only cohort members whose invite code has
  // roadmap: true (codes are public-get). Individuals never see it.
  async function load(userData) {
    enabled = false;
    startDate = userData ? userData.challengeStartDate : null;
    const code = userData && userData.companyId && userData.inviteCode;
    if (!code) return false;
    try {
      const doc = await db.collection('inviteCodes').doc(code).get();
      enabled = !!(doc.exists && doc.data() && doc.data().roadmap === true);
    } catch (e) { enabled = false; }
    return enabled;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const doneMap = () => (Margin.getSettings().roadmap || {});
  const isDone = n => !!(doneMap()[n] && doneMap()[n].doneAt);

  // One card on the Keep Your Margin home. slot = an element margin.js renders.
  function render(slot, elapsed) {
    if (!slot) return;
    if (!enabled || elapsed <= 21) { slot.innerHTML = ''; return; }
    const n = currentModule(elapsed);
    const m = CONFIG.modules[n - 1];
    const done = isDone(n);
    const nextLine = n < 12
      ? 'Next module: ' + esc(Margin.shortDate(Margin.addDays(startDate, unlockDay(n + 1))))
      : 'This is the last module of the Roadmap.';
    const earlier = CONFIG.modules.slice(0, n - 1).map(e =>
      `<li><a href="${urlOf(e)}" target="_blank" rel="noopener">Month ${e.n}: ${esc(e.title)}</a>${isDone(e.n) ? ' <span class="rm-done-mark">&#10003;</span>' : ''}</li>`).join('');
    slot.innerHTML = `
      <div class="card roadmap-card" id="roadmap-card">
        <div class="rm-label">The Employee Roadmap · Month ${n} of 12 · ${esc(phaseOf(n))}</div>
        <h3 style="margin-top:4px;">Module ${n}: ${esc(m.title)}</h3>
        <div class="rm-step-label">This month's action step</div>
        <p class="rm-step">${esc(m.step)}</p>
        <a class="btn btn-primary btn-full" id="roadmap-open" href="${urlOf(m)}" target="_blank" rel="noopener">Open this month's module</a>
        <button type="button" class="btn btn-outline btn-full" id="roadmap-done" aria-pressed="${done}" style="margin-top:8px;">${done ? '&#10003; Step marked done' : 'Mark this step done'}</button>
        <div class="rm-next">${nextLine}</div>
        ${earlier ? `<details class="rm-earlier"><summary>Earlier months</summary><ul>${earlier}</ul></details>` : ''}
      </div>`;
    document.getElementById('roadmap-done').onclick = async () => {
      const btn = document.getElementById('roadmap-done');
      btn.disabled = true;
      try {
        await Margin.saveRoadmapStep(n, !isDone(n));
      } catch (err) {
        console.error('roadmap step save failed', err);
        showToast('Save failed. Check your connection and try again.');
      }
      render(slot, elapsed);
    };
  }

  return { CONFIG, unlockDay, currentModule, phaseOf, load, render, isEnabled: () => enabled };
})();
