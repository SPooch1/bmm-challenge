// Funnel counts for the program owner: how many people sign up, where they came
// from (?src=book on the sign-up link), how many reach each challenge day, and
// how many finish the post-survey. COUNTS ONLY: nothing per person is written,
// no company, no wellness data. Path: stats/funnel/counters/{key} = { n }.
// Every write is fire-and-forget and moves one counter by exactly +1 (the rules
// refuse anything else). Only Scott's owner account can read them (dashboard).
const Funnel = (() => {
  const SOURCES = ['book', 'talk', 'guide', 'site', 'linkedin', 'podcast', 'email', 'qr'];
  const KEY = 'signupSource';

  // Sanitised source tag from ?src= / ?from= (kept on the device until sign-up)
  function readSourceFromUrl() {
    try {
      const q = new URLSearchParams(window.location.search);
      const raw = (q.get('src') || q.get('from') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
      if (raw) { localStorage.setItem(KEY, raw); return raw; }
      return localStorage.getItem(KEY) || '';
    } catch (e) { return ''; }
  }
  function clearSource() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function isKnownSource(s) { return SOURCES.includes(s); }

  function bump(key) {
    if (typeof db === 'undefined' || !key) return;
    try {
      db.collection('stats').doc('funnel').collection('counters').doc(key)
        .set({ n: firebase.firestore.FieldValue.increment(1) }, { merge: true })
        .catch(err => console.warn('funnel count skipped (' + key + ')', err && err.code));
    } catch (e) { /* never block the person */ }
  }

  function signedUp(source) {
    bump('signups');
    if (source) bump('src_' + source);
  }
  function dayLogged(day) { if (day >= 0 && day <= 21) bump('d' + day); }
  function postSurveyDone() { bump('post'); }

  // Owner dashboard: read all counters as { key: n }
  async function readAll() {
    const snap = await db.collection('stats').doc('funnel').collection('counters').get();
    const out = {};
    snap.forEach(d => { out[d.id] = (d.data() && d.data().n) || 0; });
    return out;
  }

  return { readSourceFromUrl, clearSource, isKnownSource, signedUp, dayLogged, postSurveyDone, readAll, SOURCES };
})();
