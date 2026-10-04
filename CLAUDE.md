# BMM Challenge — project rules

21-day Build More Margin cohort app. Daily videos, exercises, journaling, progress. Premium corporate enrollment product.

## Stack & deploy
- Vanilla JS + Firebase (Auth, Firestore, Hosting). PWA, **no framework, no build step**. Hosting serves `public/`.
- Firebase project: `bmm-challenge-fd4fd`. Deploy: `cd ~/bmm-challenge && firebase deploy --only hosting,firestore:rules`.
- Live: participant `challenge.buildmoremargin.com` · admin `dashboard.buildmoremargin.com` (`/dashboard.html`, needs `role: admin` in Firestore user doc).
- **Bump the cache-version constant in `public/sw.js` whenever you change assets** — stale service-worker cache is the #1 "my change didn't show up" cause.

## Hard rules (add a line here each time the agent does something it shouldn't again)
- **Read `Basecamp/assets/bmm/app-specs/BMM_COHORT_ENROLLMENT_SPEC.md` before touching anything enrollment-related.**
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
- Local test harness: now in the repo, see "Testing" below. Emulator needs Java, which is not installed.

## Privacy field split + aggregates + seat cap: BUILT 2026-10-04 (branch `privacy-split`), NOT DEPLOYED
**No HR/employer dashboard login until deploy step 5 below is done.** Build notes: `Basecamp/assets/bmm/app-specs/BMM_PRIVACY_SPLIT_BUILD_NOTES_2026-10-04.md`.
- **Admin-readable (engagement only):** user doc (name, email, start date, breathingSessions, inviteCode), `dailyLogs/{day}` SHELL = completed, action, breathing, meal, savedAt; `engagement/weekly`; `companies/{id}/aggregates/{bucket}` ONLY when every count in that doc is 0 or at least 3 (rules `readable()`; a doc under the threshold is refused, so raw counters never show one or two people's values).
- **Owner-only (no admin branch, on purpose):** `dailyLogs/{day}/private/data` (stress, sleep, steps, notes), `assessments/{type}/private/data` (responses; the shell keeps completedAt only, admins cannot read survey shells at all), `private/savings` (Peace of Mind entries, moved off the user doc), `aggLedger/{bucket}`, plus the Day 22+ paths above. All reads/writes go through `public/js/privacy.js`, which merges shell + private so pre-split data still shows.
- **Final rules let an admin `get` a daily shell only when it holds engagement fields alone, and never `list` it** (admin.js does 22 gets per person; billed the same as a query). Never add a wellness field to a shell, the user doc or `engagement/weekly`.
- **Aggregates (`public/js/aggregates.js`):** buckets d0..d21 (one per challenge day, stress); pre, post (13 questions), m3/m6/m12 (5 pillars); savings (cents, net). Fields `sum_<key>`, `n_<key>`. Participant writes ledger + aggregate in ONE transaction; rules require the aggregate to move by exactly the ledger change with ledger values in range (1-10, cents 0..$1M), participants only, own company only, no deletes. Reconcile is idempotent (desired from private data minus ledger); failures mark the bucket pending in localStorage and retry on next load; every bucket is re-checked once a day. Bucket key lists live in THREE places (aggregates.js, firestore.rules `isDay`/`bucketKeys`/`aggKeys`/`fullSurveyOk`/`readable`, tests/rules-model.js); `node --test tests/rules-model.test.js` fails if they drift.
- **Dashboard + HR report read only aggregates** for stress, survey averages and savings. Averages hidden under 3 people (`Aggregates.MIN_GROUP`, the same 3 as the rules). Residual, documented: an admin who re-reads a counter right before and after one named person checks in can still difference out that one value; only a server-side batch (Cloud Functions) closes that. Avg stress is now the pooled average of all ratings (was average of per-person averages).
- **Seat cap:** sign-up writes the user doc (with `inviteCode`) and `inviteCodes/{code}.seatsUsed + 1` in one batch; rules refuse past `maxSeats`, refuse a company user doc without that seat claim, and only allow +1 by a brand-new user. Full = "This cohort is full. Please contact your HR contact about joining." (no login is left behind). Only a `cohortManager: true` admin (Scott; field set in the console, users cannot set it) may create/update/delete invite codes, so HR cannot raise seats or reset `seatsUsed`; HR admins can LIST their own company's codes (the Invite tab query had been denied since 2026-08-22). The migration backfills `seatsUsed` on a pre-seat-count code with the company headcount. New codes start `seatsUsed: 0`; old codes without it have no cap and start counting.
- **Rules are two files:** `firestore.rules` = TRANSITIONAL (dual-write shapes + migrator branch, marked blocks); `firestore.rules.final` is GENERATED by `node tools/make-final-rules.js`. Edit only `firestore.rules`, then regenerate.

### Privacy split deploy order (needs the Firebase CLI; do not skip or reorder)
0. Firestore console: on Scott's own `users/{uid}` doc add `migrator: true` and `cohortManager: true` (booleans). `node --test tests/rules-model.test.js` passes.
1. `firebase deploy --only firestore:rules` (transitional; HR admins already get the engagement-only shell read here, old-format shells and survey shells are migrator-only, but the user doc can still carry savingsEntries, so still NO HR logins), THEN `firebase deploy --only hosting` (app with `LEGACY_DUAL_WRITE = true`, sw v13). Rules first: the new app writes paths the old rules deny. Dual-write window starts: old shapes still written, so a hosting rollback keeps working.
2. Copy + replay: from the repo root `python3 -m http.server 8000`, open `http://localhost:8000/tools/migrate.html`, sign in as Scott, Dry run, Download backup, "Copy + replay aggregates", Verify (aggMismatches empty). If a cohort is mid-flight, the window can stay open a few days here.
3. Set `LEGACY_DUAL_WRITE = false` in `public/js/privacy.js`, bump `sw.js` to v14, `firebase deploy --only hosting`. Wait at least 24 hours so open tabs/PWAs pick up v14 (a v13 tab would keep re-adding private fields to shells).
4. migrate.html again: Download backup, "Copy + replay + STRIP", Verify: legacy lists and aggMismatches all empty. Go straight to step 5.
5. `node tools/make-final-rules.js --check`, then `cp firestore.rules.final firestore.rules` and `firebase deploy --only firestore:rules`. Remove `migrator` from Scott's user doc. Delete the backup JSON (it holds private data). Only now may an HR admin get a login (`users/{uid}`: role admin + companyId, console).

## Testing (no emulator: no Java)
- `node --test tests/rules-model.test.js`: rules key lists vs app, final rules current, who-can-read/write matrix on a JS model of the rules (`tests/rules-model.js`, transcribed allow-by-allow; update it with every rules change), app write/read paths, aggregates, seat cap, migration end to end on `tests/fake-firebase.js`.
- Browser harness: `bash tests/harness/build.sh`, `(cd tests/harness/www && python3 -m http.server 8765)`, `node tests/harness/run.js [scenario]`. Scenarios (`?seed=` + `&rules=final|transitional`): legacy, company, day21, margin30, margin95, signup, dash, dashsmall. The fake enforces the rules model, so a denied read/write fails the scenario.
- The JS model is a transcription: real-rules syntax and limits are only checked by Firebase when the rules deploy (a compile error fails the deploy and leaves the live rules unchanged).

## Naming canon (must match across app, site, ebook)
- **"Peace of Mind Account"** (not "emergency fund" / other variants).
- **"4x4x4x4 Breathing Technique"** — guided timer = 4 cycles.

## Brand
- Master-brand repaint: navy `#0F172A`, sky `#0EA5E9`, amber `#F59E0B`. Bitsy mascot in-app.

## QA
- Scott does his own incognito + button-click QA. Don't suggest verification steps after a deploy.

- ✅ **DEPLOYED 2026-08-22** (hosting + rules): sw v10 live; inviteCodes = get-only (list 403, verified live). This release: late-joiner baseline fix, streak/stress/completion%/timezone math aligned, leaderboard removed (future fix = aggregate participation doc), HR report gained the pre→post cohort-averages table. Privacy field-split: BUILT 2026-10-04, not deployed (see the section above); no HR logins until deploy step 5.
