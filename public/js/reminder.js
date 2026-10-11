// Daily reminder. The app sends no notifications (web push on iPhone needs the app
// installed to the Home Screen plus a push server, and the book tells readers to set
// a phone alarm). The lowest-friction option that works on iPhone, Android and
// desktop is a repeating calendar event with an alert: one .ics file, or a Google
// Calendar link. Nothing here touches Firestore; the chosen time is kept on the
// device only (localStorage), like the dark-mode switch.
const Reminder = (() => {
  const APP_URL = 'https://challenge.buildmoremargin.com';
  const KEY_TIME = 'reminderTime';
  const KEY_DISMISSED = 'reminderPromptDismissed';
  const pad = n => (n < 10 ? '0' : '') + n;

  function ymdOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function compact(ymd) { return String(ymd).replace(/-/g, ''); }
  function addDaysYmd(ymd, n) {
    const p = String(ymd).split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    d.setDate(d.getDate() + n);
    return ymdOf(d);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }

  // What the event covers: the rest of the 21 days, or (Day 22+) the 90-day plan.
  function plan(opts) {
    const today = ymdOf(new Date());
    const time = (opts && opts.time) || lsGet(KEY_TIME) || '07:00';
    const hm = time.split(':').map(Number);
    const now = new Date();
    // First alert = today at the chosen time if that is still ahead, else tomorrow
    const startsToday = hm[0] > now.getHours() || (hm[0] === now.getHours() && hm[1] > now.getMinutes());
    const first = startsToday ? today : addDaysYmd(today, 1);
    let until;
    if (opts && !opts.marginMode && opts.startDate) until = addDaysYmd(opts.startDate, 21);
    else until = addDaysYmd(today, 90);
    if (until < first) until = first;
    return { time, hm, first, until };
  }

  function escapeIcs(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }

  function icsText(opts) {
    const p = plan(opts);
    const start = compact(p.first) + 'T' + pad(p.hm[0]) + pad(p.hm[1]) + '00';
    const end = compact(p.first) + 'T' + pad(p.hm[0]) + pad(p.hm[1] + 5 < 60 ? p.hm[1] + 5 : 59) + '00';
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const uid = 'bmm-reminder-' + compact(p.first) + '-' + p.time.replace(':', '') + '@challenge.buildmoremargin.com';
    const title = opts && opts.marginMode ? 'Keep Your Margin: two minutes' : 'Build More Margin: today\'s two minutes';
    const desc = 'Open the app, do today\'s small action, check in. ' + APP_URL;
    // Floating local times (no Z, no TZID): the event lands at the chosen clock
    // time wherever the phone is.
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Build More Margin//Challenge//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + stamp,
      'DTSTART:' + start,
      'DTEND:' + end,
      'RRULE:FREQ=DAILY;UNTIL=' + compact(p.until) + 'T235959',
      'SUMMARY:' + escapeIcs(title),
      'DESCRIPTION:' + escapeIcs(desc),
      'URL:' + APP_URL,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:' + escapeIcs(title), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n') + '\r\n';
  }

  function googleUrl(opts) {
    const p = plan(opts);
    const start = compact(p.first) + 'T' + pad(p.hm[0]) + pad(p.hm[1]) + '00';
    const end = compact(p.first) + 'T' + pad(p.hm[0]) + pad(p.hm[1] + 5 < 60 ? p.hm[1] + 5 : 59) + '00';
    const title = opts && opts.marginMode ? 'Keep Your Margin: two minutes' : 'Build More Margin: today\'s two minutes';
    const q = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: start + '/' + end,
      details: 'Open the app, do today\'s small action, check in. ' + APP_URL,
      recur: 'RRULE:FREQ=DAILY;UNTIL=' + compact(p.until)
    });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }

  function downloadIcs(opts) {
    const text = icsText(opts);
    const name = 'build-more-margin-reminder.ics';
    try {
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text);
    }
  }

  // Renders the reminder card into `box`. opts: { startDate, marginMode, compact,
  // dismissable }. The Today-view prompt is dismissable; the Profile card is not.
  function render(box, opts) {
    if (!box) return;
    opts = opts || {};
    if (opts.dismissable && lsGet(KEY_DISMISSED) === '1') { box.style.display = 'none'; box.innerHTML = ''; return; }
    const saved = lsGet(KEY_TIME);
    const time = saved || '07:00';
    const scope = opts.marginMode ? 'every day for the next 90 days' : 'every day through Day 21';
    box.innerHTML = `
      <h3 style="display:flex;align-items:center;justify-content:space-between;">Daily reminder
        ${opts.dismissable ? '<button type="button" id="reminder-dismiss" aria-label="Hide this reminder prompt" style="background:none;border:none;color:var(--slate);font-size:1.2rem;cursor:pointer;padding:0 4px;">&times;</button>' : ''}</h3>
      <p style="font-size:0.9rem;color:var(--slate);margin-top:6px;">This app does not send notifications. A calendar alert at the same time each day works on any phone. Pick a time, then add it.</p>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
        <label for="reminder-time" style="font-size:0.85rem;font-weight:600;">Time</label>
        <input type="time" id="reminder-time" value="${time}" style="flex:0 0 130px;">
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" id="reminder-ics" style="flex:1;min-width:150px;">Add to my calendar</button>
        <a class="btn btn-outline" id="reminder-google" href="#" target="_blank" rel="noopener" style="flex:1;min-width:150px;text-decoration:none;text-align:center;">Google Calendar</a>
      </div>
      <div id="reminder-note" style="font-size:0.75rem;color:var(--slate);margin-top:8px;">Repeats ${scope}. iPhone: tap "Add to my calendar", then "Add All". Or set a daily alarm on your phone. ${saved ? 'Saved time: ' + saved + '.' : ''}</div>`;
    const timeEl = document.getElementById('reminder-time');
    const current = () => Object.assign({}, opts, { time: timeEl.value || '07:00' });
    const google = document.getElementById('reminder-google');
    const refreshGoogle = () => { google.href = googleUrl(current()); };
    refreshGoogle();
    timeEl.onchange = () => { lsSet(KEY_TIME, timeEl.value); refreshGoogle(); };
    document.getElementById('reminder-ics').onclick = () => {
      lsSet(KEY_TIME, timeEl.value || '07:00');
      downloadIcs(current());
      document.getElementById('reminder-note').textContent = 'Calendar file ready. If your phone showed a preview, tap "Add All" (iPhone) or "Save" (Android). Saved time: ' + (timeEl.value || '07:00') + '.';
    };
    google.onclick = () => { lsSet(KEY_TIME, timeEl.value || '07:00'); };
    const dismiss = document.getElementById('reminder-dismiss');
    if (dismiss) dismiss.onclick = () => { lsSet(KEY_DISMISSED, '1'); box.style.display = 'none'; };
    box.style.display = 'block';
  }

  return { render, icsText, googleUrl, plan };
})();
