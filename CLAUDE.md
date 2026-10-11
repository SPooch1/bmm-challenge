# BMM Challenge — project rules

21-day Build More Margin cohort app. Daily videos, exercises, journaling, progress. Premium corporate enrollment product.

## Stack & deploy
- Vanilla JS + Firebase (Auth, Firestore, Hosting). PWA, **no framework, no build step**. Hosting serves `public/`.
- Firebase project: `bmm-challenge-fd4fd`. Deploy: `cd ~/bmm-challenge && firebase deploy --only hosting,firestore:rules`.
- Live: participant `challenge.buildmoremargin.com` · admin `dashboard.buildmoremargin.com` (`/dashboard.html`, needs `role: admin` in Firestore user doc).
- **Bump the cache-version constant in `public/sw.js` whenever you change assets** — stale service-worker cache is the #1 "my change didn't show up" cause.

## Hard rules (add a line here each time the agent does something it shouldn't again)
- **Read `Basecamp/docs/bmm/BMM_COHORT_ENROLLMENT_SPEC.md` before touching anything enrollment-related.**
- **Privacy-by-design is non-negotiable:** individual wellness data (stress, savings, journal notes, assessment scores) is aggregate-only. Never surface a named participant's wellness data to HR/admin. Per-name *engagement* (check-ins/streaks) is fine; the underlying numbers are not.
- Corporate model: Scott mints a company invite code → employees self-enroll via `?code=XXX`. **No PII handoff** between HR and the app.
- Per-client setup = a `companies/{id}` doc + Scott's user gets `role:admin` + `companyId` (Firestore console).
- Challenge is **21 days** (Day 0 welcome + Days 1–21; week 3 = "Your Next Move", Turbocharge moved to Book 2). Keep all copy 21-day.
- **`content/days.json` mirrors the book** `Basecamp/Speaking/book-21-day/0*.md` (titles, the book's **Today:** line as `exercise`, its **Hard day version:** as `hardDay`). The book promises the same exercise in the app: change one, change the other. Synced 2026-09-30.
- **Attribution:** borrowed ideas get credit in the copy (Day 8 alien test = James Clear; Day 18 anchoring = "many writers on habits"). No uncredited borrowed phrasing.

## Keep Your Margin (Day 22+) — built + ✅ DEPLOYED 2026-09-08 (hosting + rules, sw v11)
- Day counter is no longer capped: `Challenge.calculateElapsedDay` is uncapped, `calculateCurrentDay` = min(elapsed, 21). `elapsed > 21` = Keep Your Margin mode (`margin.js`).
- **New owner-only Firestore paths (rules have NO admin branch on purpose):** `users/{uid}/private/margin` (pomTarget, healthAction, healthActionSetAt, resetAt, resets[], pastRuns[]), `users/{uid}/marginLogs/{YYYY-MM-DD}` (action, stress, notes), `users/{uid}/breathSessions/{id}` (date, before, after). Rules + hosting must deploy TOGETHER (`firebase deploy --only hosting,firestore:rules`) or every Day 22+ read fails permission-denied.
- `dailyLogs/{day}` gained a boolean `action` (health action done) from Day 17 on. `savingsEntries` entries gained `iso` (YYYY-MM-DD) and may be NEGATIVE ("Used" withdrawals); admin.js sums amounts, which is the correct net.
- Peace of Mind number = one month of essentials, captured on Day 2 in the exercise card (editable on Savings). Milestones: $500 starter, then 1/2/3 months. `$500 by Day 21` pace line only during the challenge.
- Milestone surveys m3/m6/m12 now also prompt in-app at 90/180/365 days (card on the margin home), same `runMilestone()` path as the email deep links.
- "Run the 21 days again" (Profile) = individual accounts only; archives a summary to `private/margin.pastRuns`, batch-deletes dailyLogs + assessments/post, sets challengeStartDate = today. Cohort accounts get a note instead. Pre-survey is kept as the lifetime baseline.
- Breathing counter: server value wins over localStorage (`BreathingTimer.setCount`); the old code let a fresh device overwrite the server count.
- **Engagement summary (admin-readable, dates only):** `users/{uid}/engagement/weekly` = `{ weeks: { <Monday YYYY-MM-DD>: { days, actionDays, breathDays } } }`, written fire-and-forget on every margin check-in and saved breathing session (`Margin.recordActivity`). Dashboard "After Day 21" card + HR report line = share of graduates active 3+ days/week over their last 4 COMPLETE post-Day-21 weeks, plus a week-1..12 retention curve. Never put stress, notes, or dollars in this doc.
- ✅ **DEPLOYED 2026-09-30** (hosting + rules, sw v12; live days.json/margin.js/challenge.js/index.html/sw.js curl-md5 = source). Firebase CLI login had expired; re-auth works non-interactively via `script -q <file> firebase login --reauth` (prints the Google URL; open it in Chrome, Scott clicks Allow).
- **Weekly check (2026-09-30, sw v12):** card on the margin home under "This week" (the book's Part Three five-minute check). Stored owner-only in `private/margin.weeklyChecks.{Monday YYYY-MM-DD}` = {protect, adjust, savedOn}; merge-write of the one week only. Shows last week's "protect" item; quotes the Day 20 one page from `dailyLogs['20'].notes` when present. No rules change. Day 19 is now "reset plan" in all copy (was Reset Protocol).
- Local test harness (in-memory Firestore + seeded scenarios `?seed=day2|day17|day21|margin30|margin30noaction|margin95|company`) lives in the session scratchpad, not the repo. Emulator needs Java, which is not installed.

## Naming canon (must match across app, site, ebook)
- **"Peace of Mind Account"** (not "emergency fund" / other variants).
- **"4x4x4x4 Breathing Technique"** — guided timer = 4 cycles.

## Brand
- Master-brand repaint: navy `#0F172A`, sky `#0EA5E9`, amber `#F59E0B`. Bitsy mascot in-app.

## QA
- Scott does his own incognito + button-click QA. Don't suggest verification steps after a deploy.

- ✅ **DEPLOYED 2026-08-22** (hosting + rules): sw v10 live; inviteCodes = get-only (list 403, verified live). This release: late-joiner baseline fix, streak/stress/completion%/timezone math aligned, leaderboard removed (future fix = aggregate participation doc), HR report gained the pre→post cohort-averages table. Privacy field-split still OPEN — design: `Basecamp/docs/bmm/BMM_PRIVACY_FIELD_SPLIT_DESIGN_2026-08-21.md`; no HR logins until built.
