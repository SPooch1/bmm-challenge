// Pre/Post Assessment Survey
const Survey = (() => {
  const QUESTIONS = [
    { id: 'stress', label: 'How stressed do you feel on a daily basis?', min: 'Not at all', max: 'Extremely' },
    { id: 'sleep', label: 'How would you rate your sleep quality?', min: 'Very poor', max: 'Excellent' },
    { id: 'financial', label: 'How confident are you in your financial situation?', min: 'Not confident', max: 'Very confident' },
    { id: 'energy', label: 'How would you rate your daily energy level?', min: 'Very low', max: 'Very high' },
    { id: 'overwhelm', label: 'How often do you feel overwhelmed?', min: 'Never', max: 'Constantly' },
    { id: 'savings', label: 'Do you have a Peace of Mind Account (a starter savings buffer)?', min: 'Nothing', max: '$500+' },
    { id: 'exercise', label: 'How often do you exercise or move intentionally?', min: 'Never', max: 'Daily' },
    { id: 'breathing', label: 'Do you practice any breathing or stress-relief techniques?', min: 'Never', max: 'Daily' },
    // --- Real Retirement Readiness: the 5 Pillars (baseline for the 12-Month Roadmap) ---
    { id: 'p_health', label: 'How would you rate your overall health — physical and mental — right now?', min: 'Poor', max: 'Excellent',
      section: 'Real Retirement Readiness', sectionNote: 'Five quick ones so we can track your bigger-picture progress over the year.' },
    { id: 'p_wealth', label: 'How would you rate your overall financial position — savings vs. debt?', min: 'Very weak', max: 'Very strong' },
    { id: 'p_finwell', label: 'How in control of your day-to-day money do you feel?', min: 'Not at all', max: 'Completely' },
    { id: 'p_retsave', label: "How confident are you that you're saving enough to retire on time?", min: 'Not confident', max: 'Very confident' },
    { id: 'p_jobskills', label: 'How confident are you that your skills keep you valuable and employable?', min: 'Not confident', max: 'Very confident' }
  ];

  // Roadmap milestone re-measures ask the 5 readiness pillars only (Months 3/6/12).
  const PILLAR_IDS = ['p_health', 'p_wealth', 'p_finwell', 'p_retsave', 'p_jobskills'];
  const MILESTONES = ['m3', 'm6', 'm12'];
  const MS_LABEL = { m3: '3-Month', m6: '6-Month', m12: '12-Month' };
  const isMilestone = type => MILESTONES.includes(type);
  // Milestone surveys = pillars only; pre/post = the full set.
  const questionsFor = type => isMilestone(type) ? QUESTIONS.filter(q => PILLAR_IDS.includes(q.id)) : QUESTIONS;

  function buildSurveyHTML(type) {
    const title = isMilestone(type) ? `Your ${MS_LABEL[type]} Check-In`
      : type === 'pre' ? 'Before We Start...' : 'Challenge Complete!';
    const subtitle = isMilestone(type) ? 'A quick re-rating of the five areas your Roadmap is moving. Takes about a minute.'
      : type === 'pre' ? 'Rate each area from 1-10. This helps us measure your progress.'
      : 'Rate each area again so we can see how far you\'ve come.';

    let html = `<div class="card"><h2>${title}</h2><p style="color:var(--slate);margin-bottom:16px;">${subtitle}</p>`;
    html += '<form id="survey-form">';

    questionsFor(type).forEach(q => {
      // Skip the section divider on milestone surveys (pillars are the whole survey there).
      if (q.section && isMilestone(type)) { /* no header */ } else
      if (q.section) {
        html += `<div style="margin:10px 0 14px;padding-top:14px;border-top:1px solid var(--border);">
          <h3 style="font-size:1rem;margin:0 0 2px;">${q.section}</h3>
          <p style="color:var(--slate);font-size:0.8rem;margin:0;">${q.sectionNote || ''}</p></div>`;
      }
      html += `
        <div class="form-group" style="margin-bottom:20px;">
          <label style="font-weight:600;margin-bottom:8px;display:block;">${q.label}: <span id="survey-${q.id}-val" style="color:var(--green);font-size:1.1em;">5</span>/10</label>
          <input type="range" id="survey-${q.id}" min="1" max="10" value="5" style="width:100%;" oninput="document.getElementById('survey-${q.id}-val').textContent=this.value">
          <div class="range-labels"><span>${q.min}</span><span>${q.max}</span></div>
        </div>`;
    });

    html += '<button type="submit" class="btn btn-primary btn-full">Submit</button>';
    html += '</form></div>';
    return html;
  }

  function collectResponses(type) {
    const responses = {};
    questionsFor(type).forEach(q => {
      responses[q.id] = parseInt(document.getElementById('survey-' + q.id).value);
    });
    return responses;
  }

  async function saveSurvey(uid, type, responses) {
    await db.collection('users').doc(uid).collection('assessments').doc(type).set({
      responses,
      completedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function getSurvey(uid, type) {
    const doc = await db.collection('users').doc(uid).collection('assessments').doc(type).get();
    return doc.exists ? doc.data() : null;
  }

  async function showSurvey(uid, type, container, onComplete) {
    container.innerHTML = buildSurveyHTML(type);
    document.getElementById('survey-form').addEventListener('submit', async e => {
      e.preventDefault();
      const responses = collectResponses(type);
      await saveSurvey(uid, type, responses);
      if (onComplete) onComplete(responses);
    });
  }

  function renderComparison(preData, postData, container, type) {
    if (!preData || !postData) return;

    const heading = isMilestone(type) ? `Baseline → ${MS_LABEL[type]}` : 'Your Progress';
    let html = `<div class="card"><h3>${heading}</h3>`;
    html += '<div style="margin-top:12px;">';
    questionsFor(type).forEach(q => {
      const pre = preData.responses[q.id];
      const post = postData.responses[q.id];
      if (pre == null || post == null) return; // skip areas without both points (e.g. legacy pre-survey)
      const improved = q.id === 'stress' || q.id === 'overwhelm' ? post < pre : post > pre;
      const delta = post - pre;
      const arrow = improved ? '<span style="color:var(--green);">&#9650;</span>' : delta === 0 ? '<span style="color:var(--slate);">&#8212;</span>' : '<span style="color:var(--red);">&#9660;</span>';
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.875rem;">
        <span style="flex:1;font-weight:500;">${q.label.replace('How ', '').replace('Do you ', '').replace('?', '')}</span>
        <span style="color:var(--slate);">${pre}</span>
        <span>→</span>
        <span style="font-weight:600;">${post}</span>
        ${arrow}
      </div>`;
    });
    html += '</div></div>';
    container.innerHTML = html;
  }

  return { showSurvey, getSurvey, renderComparison, QUESTIONS, MILESTONES };
})();
