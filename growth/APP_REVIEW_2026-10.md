# App review, October 2026

Branch `byb-growth-2026-10`. Nothing here is deployed. Every change below ships with the privacy-split deploy (CLAUDE.md deploy order, service worker v14).

## How I reviewed it

I read every file in `public/`, ran the rules tests (`node --test tests/rules-model.test.js`, 22 pass) and the browser harness on the in-memory Firestore (every scenario, 121 checks pass after this work), and walked the app as a new individual, a returning person who missed days, a Day 21 and Day 30 user, and as an HR admin and the program owner on the dashboard.

## What I found, by stage

**Sign-up**
- The screen is clean and fast. Nothing told a book reader what to do (the book says "leave the invite code blank," the screen did not). Fixed: `?src=book` opens Create Account with a one-line note.
- The tagline had an em dash and the meta description was generic. Fixed.

**Day 0**
- A brand-new person hit two gates stacked on top of each other: the welcome overlay opened on top of the 13-question baseline survey. The survey had to be answered through the overlay. Fixed: the overlay waits until the baseline is saved.
- The overlay promised "a short video" every day. Most days have no video of their own. Fixed the wording.
- The baseline survey itself (13 questions) is the first thing anyone does. It is the before/after payoff, so I left it, but it is the biggest ask in the app. See "not built."

**Days 1 to 21**
- On a phone the day's exercise sat below the video player, under the fold. Fixed: exercise first, video after.
- Three motivational elements stacked above the action (streak chip, Bitsy line, quote). Left as is; see "not built."
- Bitsy said "Three days in a row" at a 5-day streak. Fixed to the real number.
- "You crushed it", "you're proof this works", "the compound effect is working for you": hype and outcome claims. Removed.

**Missed days (the biggest completion lever)**
- Before: if you missed days, the app showed nothing. The streak chip disappeared, and past days could be viewed but not logged. A person who skipped a weekend got silence.
- Now: a "Welcome back" card says how many days went by, that it resets nothing (the book's Day 19 point), and offers "Log Day N" for the day they missed or "Start with today." Earlier days show their own check-in form, so a missed day can be logged late. Streak and card refresh after a save.

**Day 21 to Day 22**
- The post-survey and the before/after comparison are good. But the "Challenge Complete" banner only appeared if all 21 days were checked in, so most people reached Day 22 with no acknowledgment. Fixed: a one-time Day 22 card states their own count and what changes next.

**Keep Your Margin (Day 22+)**
- Solid. The home screen does a lot in one view and reads well. The one-tap health action and the weekly check are the right shape.
- Progress tab: "% complete" counts 22 days (Day 0 to 21) while the ring counts 21. Known, left alone, documented in CLAUDE.md.

**HR admin and owner (dashboard)**
- The privacy split holds: the harness confirms an HR admin cannot read any individual's stress, notes, savings or survey answers, even from the browser console.
- Scott had no way to show the dashboard without real employees. Fixed: demo mode.
- Scott had no way to see where individuals (not cohort members) stop. Fixed: funnel counts and the "Where people stop" card.

## Tech verdict: stay on plain HTML/JS

The app is about 7,500 lines of plain HTML, CSS and JavaScript with no build step, and it is in good shape: clear modules, a rules model with tests, and a browser harness that runs the real app against a fake Firestore. A move to React (or any framework) would cost two to four weeks of rewrite, add a build step Scott would have to run, and put every existing user's cached app at risk during the switch, for benefits the app does not need: it has one screen per tab, no complex shared state, and no team of developers. What a framework would unlock (component reuse, a faster path for a mobile-store app) is not on the roadmap. Recommendation: keep the current stack. Spend engineering time on content and completion, not plumbing.

## What I built (one commit each)

1. **Copy sweep.** No dashes, no hype, no outcome claims in the UI. Bitsy's streak line fixed. Service worker v14.
2. **Comeback flow.** Missed-day card, late check-in on earlier days, per-day drafts, streak refresh.
3. **Daily reminder.** The app sends no notifications. Web push on iPhone needs the app installed to the Home Screen plus a push server (Cloud Functions, a paid Firebase plan, and ongoing maintenance), so I built the lowest-friction option that works on every phone: a repeating calendar event with an alert, as an .ics download ("Add All" on iPhone) or a Google Calendar link. Repeats through Day 21, or 90 days after. Prompt on Days 0 to 3, always on Profile.
4. **Book-to-app bridge + funnel counts.** `?src=book` tags the sign-up; counts only (sign-ups, by source, first check-in per day, Day 21 survey) go to `stats/funnel/counters`, readable by the owner only. Rules, rules model and tests updated. Also fixed the stacked overlay found while testing.
5. **"Where people stop" card** on the dashboard, owner only: Day 0 to 21 bars and the three biggest drops in words.
6. **Demo mode.** `dashboard.html?demo=1`: sample company, made-up data, no sign-in, no Firestore traffic, HR view with a switch to the owner view, Day-21 summary with a SAMPLE REPORT banner. The sample end-survey shows no improvement story on purpose.
7. **Accessibility and load polish.** 48px nav targets, visible keyboard focus, labeled sliders, keyboard-operable exercise header, reduced-motion support, preconnect to font and Firebase hosts.
8. **Exercise above the video.**
9. **Day 22 acknowledgment card.**

## Recommended, not built

- **Shorten the Day 0 baseline.** 13 questions before Day 0 is the heaviest moment in the app. Option: ask the 8 core questions on Day 0 and the 5 pillar questions on Day 1 or 2. Needs a decision because the aggregates and the HR summary count all 13 together.
- **Quieter Today screen.** Drop the daily quote (or fold it into Bitsy's line) so the exercise is the second thing on screen, not the fifth.
- **Web push later, if ever.** Only worth it once there is a cohort asking for it. Would need Firebase Cloud Messaging, a Cloud Function on a schedule, and the paid Firebase plan.
- **Progress % vs ring.** Make both count 21 (or both 22). Small, but touches the dashboard's completion number, so do it with a cohort between runs.
- **Funnel backfill.** Counts start at deploy. If you want today's existing users counted, a one-time script can bump d0..d21 from existing logs (owner-run, like the migration tool).
- **Cohort funnel on the HR view.** The owner's funnel is global on purpose. HR already has the per-day engagement chart for their cohort.
- **Light tamper note.** A signed-in person could, from the browser console, bump a funnel counter more than once. The counts are Scott-only and carry no personal data, so I accepted that over a per-user ledger (which is what the privacy aggregates use). Say so before quoting a funnel number anywhere public.

## Scott must decide

1. **The link in the book.** For the source tag to count readers, the app link on bendyourbaseline.com/book (and the Day 0 QR) must be `https://challenge.buildmoremargin.com/?src=book`. The book text itself does not change.
2. **Reminder wording in the book.** The book says the app sends no reminders and suggests a phone alarm. Still true. If you want, the next book build can add one sentence: "the app can also add a daily alert to your calendar." Not required.
3. **Demo mode is a public URL.** `dashboard.html?demo=1` needs no login. Everything on it is labeled as made-up, nothing real loads. If you would rather it not be public, a one-line change can require an owner login first.
4. **Deploy timing.** All of this rides on the privacy-split deploy (rules first, then hosting). Nothing here can ship on its own to the live `live-2026-10-11` build.

## Reviews still needed before anything ships

- Code review of every app commit (list in `growth/SESSION_SUMMARY_2026-10.md`), especially the rules block for funnel counters and the late check-in path.
- Words review of every sentence added to the UI: comeback card, reminder card, Day 22 card, onboarding overlay, demo banner, sign-up note.
- Run both rules files against the Firestore emulator on the MacBook Pro (CLAUDE.md deploy step 0).
