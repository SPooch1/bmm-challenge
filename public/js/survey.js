// Pre/Post Assessment Survey
const Survey = (() => {
  const QUESTIONS = [
    { id: 'stress', label: 'How stressed do you feel on a daily basis?', min: 'Not at all', max: 'Extremely' },
    { id: 'sleep', label: 'How would you rate your sleep quality?', min: 'Very poor', max: 'Excellent' },
    { id: 'financial', label: 'How confident are you in your financial situation?', min: 'Not confident', max: 'Very confident' },
    { id: 'energy', label: 'How would you rate your daily energy level?', min: 'Very low', max: 'Very high' },
    { id: 'overwhelm', label: 'How often do you feel overwhelmed?', min: 'Never', max: 'Constantly' },
    { id: 'savings', label: 'Do you have an emergency savings buffer?', min: 'Nothing', max: '$500+' },
    { id: 'exercise', label: 'How often do you exercise or move intentionally?', min: 'Never', max: 'Daily' },
    { id: 'breathing', label: 'Do you practice any breathing or stress-relief techniques?', min: 'Never', max: 'Daily' }
  ];

  function buildSurveyHTML(type) {
    const title = type === 'pre' ? 'Before We Start...' : 'Challenge Complete!';
    const subtitle = type === 'pre'
      ? 'Rate each area from 1-10. This helps us measure your progress.'
      : 'Rate each area again so we can see how far you\'ve come.';

    let html = `<div class="card"><h2>${title}</h2><p style="color:var(--slate);margin-bottom:16px;">${subtitle}</p>`;
    html += '<form id="survey-form">';

    QUESTIONS.forEach(q => {
      html += `
        <div class="form-group" style="margin-bottom:20px;">
          <label style="font-weight:600;margin-bottom:8px;display:block;">${q.label}</label>
          <input type="range" id="survey-${q.id}" min="1" max="10" value="5" style="width:100%;">
          <div class="range-labels"><span>${q.min}</span><span>${q.max}</span></div>
        </div>`;
    });

    html += '<button type="submit" class="btn btn-primary btn-full">Submit</button>';
    html += '</form></div>';
    return html;
  }

  function collectResponses() {
    const responses = {};
    QUESTIONS.forEach(q => {
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
      const responses = collectResponses();
      await saveSurvey(uid, type, responses);
      if (onComplete) onComplete(responses);
    });
  }

  function renderComparison(preData, postData, container) {
    if (!preData || !postData) return;

    let html = '<div class="card"><h3>Your Progress</h3>';
    html += '<div style="margin-top:12px;">';
    QUESTIONS.forEach(q => {
      const pre = preData.responses[q.id];
      const post = postData.responses[q.id];
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

  return { showSurvey, getSurvey, renderComparison, QUESTIONS };
})();
