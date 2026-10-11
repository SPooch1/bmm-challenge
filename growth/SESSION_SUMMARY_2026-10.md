# Session summary, growth sprint, 2026-10-11

Branch `byb-growth-2026-10`, 15 commits this sprint, all pushed. Nothing deployed, published, or sent.

## What changed

**App (9 commits, service worker v14)**
- Copy sweep: no dashes, no hype, no outcome claims anywhere in the UI.
- Comeback flow: a returning person sees how many days they missed, that it resets nothing, and can log the missed day. Earlier days now have their own check-in form.
- Daily reminder: one-tap calendar alert (.ics or Google Calendar) that repeats through Day 21, since the app sends no notifications.
- Book-to-app bridge: `?src=book` on the sign-up link opens Create Account with a note for readers and tags the account.
- Funnel counts, owner only: sign-ups, by source, people who logged each day, Day 21 survey. Counts only, nothing per person. New rules block, tests updated.
- Dashboard "Where people stop" card (owner only) and a demo mode at `dashboard.html?demo=1` for sales calls: sample company, made-up data, no login, no real reads.
- Day 22 one-time "the 21 days are done" card for everyone. Exercise now sits above the video. Welcome overlay no longer stacks on top of the baseline survey. Accessibility and load polish.
- Tech verdict: stay on plain HTML/JS. Details and the not-built list: `growth/APP_REVIEW_2026-10.md`.

**Book (1 commit)**
- Opening pages rewritten to start on the reader's problem; day hooks tightened; filler and prevalence words cut; "Division I" removed (unconfirmed); ending points to the app and the founding group. Every Today and Hard-day line unchanged (they mirror the app). Word count flat at about 13,570.
- New KDP listing `growth/book/launch/KDP_LISTING_Bend_Your_Baseline_2026-10-11.txt` with the KDP rules cited. The build works here (pandoc + Chromium); the repo's build files were not touched, so rebuild on your Mac with `python3 growth/book/build/build.py`. Change list: `growth/BOOK_NOTES_2026-10.md`.

**Podcasts (1 commit)**
- `growth/podcasts/PODCAST_TARGETS_2026-10.csv`: 74 shows ranked (39 re-checked, 35 added, 25 of them employer-side), with side, status, pitch route and source link.
- `growth/podcasts/PITCHES_2026-10.txt`: 15 draft pitches under 120 words, each tied to a recent episode, plus 3 + 3 episode angles. Not sent.
- `growth/podcasts/GUEST_SHEET_2026-10.html`: one-page guest sheet, bio facts from the book only.

**Employer funnel (1 commit)**
- `growth/EMPLOYER_FUNNEL_NOTES_2026-10.md`: the pilot hand-off belongs at Day 21 in the app, in the book's back matter as a third "way to keep going", and on a second QR in HR/CPA/owner rooms only. What HR should see first, in order. Recommendations only.

## Where it is

GitHub `SPooch1/bmm-challenge`, branch `byb-growth-2026-10`. App code in `public/`, rules in `firestore.rules` (+ regenerated `firestore.rules.final`), tests in `tests/`, everything else in `growth/`. CLAUDE.md has a new section listing the new paths and harness scenarios.

## What Scott must decide

1. Point the app link on bendyourbaseline.com/book (and the Day 0 QR) at `https://challenge.buildmoremargin.com/?src=book` so book readers are counted. The book text itself does not change.
2. Demo mode is a public URL with no login. Everything on it is labeled made-up. Keep it public, or require an owner login (one-line change)?
3. Book back cover (`growth/book/build/cover_wrap.html`) still says "Division I". The chapter text no longer does. Confirm the coaching fact or remove it from the cover before the rebuild.
4. KDP description no longer calls the app "free" (KDP's promotional-language rule). Restore it if you are comfortable with that risk.
5. Guest sheet facts to confirm: "turns 60 this year", "available in person or remote", 401Grow named in the bio, "ran the 800 meters in college" (from the book bio).
6. Podcasts: HR Mixtape's last confirmed episode is March 2026 on one mirror (the 9/27 list had August); confirm before pitching. Behavioral Grooves and The Unique CPA have no published pitch route.
7. Deploy timing: all app changes ride on the privacy-split deploy (rules first, then hosting, per CLAUDE.md). Nothing here can go to the live build on its own.

## Still needs the independent review before anything ships

Code review (every app commit):
- `2e375d7` App copy sweep
- `fe8d166` Comeback flow and late check-in (checkin.js, app.js, margin.js)
- `8a4c20a` Daily reminder (reminder.js)
- `6528669` Book bridge and funnel counters (auth.js, funnel.js, firestore.rules, rules-model.js, tests)
- `a056f84` Dashboard funnel card (admin.js)
- `fe9e94a` Dashboard demo mode (admin.js, dashboard.html)
- `f5dc40f` Accessibility and load polish
- `b90969d` Exercise above the video
- `3360c3a` Day 22 card (margin.js)
- Plus CLAUDE.md deploy step 0: both rules files against the Firestore emulator on the MacBook Pro.

Words review (every public-facing text):
- Book: `growth/book/01` to `05` (whole diff in `BOOK_NOTES_2026-10.md`)
- KDP listing: `growth/book/launch/KDP_LISTING_Bend_Your_Baseline_2026-10-11.txt`
- Pitches and guest sheet: `growth/podcasts/PITCHES_2026-10.txt`, `GUEST_SHEET_2026-10.html`
- App copy added this sprint: comeback card, reminder card, Day 22 card, onboarding overlay, sign-up note, demo banner and SAMPLE REPORT line, funnel card text, streak and Bitsy lines.

Checks already run here: rules tests 22/22, browser harness 121/121 (incl. new scenarios missed, book, demo), zero dashes in every new public file, banned-word grep clean.

## Review gates, run 2026-10-11 (local MacBook Pro session)

**Code gate (Codex gpt-5.5, read-only):** two findings. Taken: the reminder end time capped minutes at 59, so a 7:56 to 7:59 alert made a zero-length or short event; `endStamp()` in reminder.js now adds five real minutes and rolls into the next hour or day (checked at 07:00, 07:59, 08:58, 23:57). Accepted as a known limit, no code change: any signed-in user could inflate a funnel counter one +1 at a time from the browser console. Counts are owner-only and directional; never quote them outside. Codex confirmed: late check-in saves to the viewed day, funnel rules match in both rules files and the JS model, demo mode makes no Firestore calls, no wellness field lands on a shell or user doc, sw v14 caches funnel.js and reminder.js. Rules tests 22/22 rerun here. Not rerun here: the browser harness (Playwright is not installed on the MBP since the rebuild).

**Words gate (ChatGPT in Chrome):** verdict ship with fixes. Applied:
- Book: prevalence lines on Days 1, 3, 4 ("Many of us..."), "A small increase is easier to fit", transfer "takes a few minutes", Chapter 5 opener, "Organizations can live on the yo-yo too", Chapter 1 now points to the bonus chapter (not Part Three). Back cover now says "college distance runners", matching the interior, so Division I is off every page.
- KDP listing: blame line, hard-day line, "keep going after Day 21", bio clause about watching programs fail, keyword 1, paperback category note.
- Pitches: every "fades a quarter after launch", "the fix", "helps it hold" and "survive a bad week" claim rewritten as a starting point, not a result; athlete "worse shape" and "kept it up after graduation" claims removed; trades-crew stereotype removed; titles 2 to 6 reworded. All 15 still under 120 words.
- Guest sheet: lead line, baseline definition, Day 22 topic, employer topic and questions, privacy line for HR.
- App: funnel card is now "Check-ins by day" with a plain note that recent sign-ups make later bars run low and a missing check-in is not quitting; drops read "Day 1 to Day 2 (6 to 3)"; reminder titles "today's small action" / "today's check-in"; "works on any phone" removed.
Rejected (with reason): the book's push/baseline thesis lines and "design problem, not a character problem" (settled spine); first-person lines ("In my experience... it seldom does", "I'm going to be 60 this year"); "You never collect their emails" (true: HR never collects them; ChatGPT's fix "emails are not shared with the employer" would be false, HR sees names and emails); survey question rewording, "psychological margin", and the "Itsy" line (pre-existing, outside this sprint; rewording a survey mid-stream breaks comparisons); device-specific calendar tips (they help).
