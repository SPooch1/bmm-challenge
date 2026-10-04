// Main app controller

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 3000);
}

(async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.warn('SW registration failed:', err)
    );
  }

  // Dark mode
  const darkToggle = document.getElementById('dark-toggle');
  const darkThumb = document.getElementById('dark-thumb');
  const darkTrack = document.getElementById('dark-track');
  function applyDark(on) {
    document.body.classList.toggle('dark', on);
    darkToggle.checked = on;
    darkThumb.style.left = on ? '24px' : '2px';
    darkTrack.style.background = on ? 'var(--green)' : 'var(--border)';
  }
  if (localStorage.getItem('darkMode') === '1') applyDark(true);
  darkToggle.addEventListener('change', () => {
    const on = darkToggle.checked;
    localStorage.setItem('darkMode', on ? '1' : '0');
    applyDark(on);
  });

  // iOS PWA install prompt
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isIOS && !isStandalone && !localStorage.getItem('iosInstallDismissed')) {
    setTimeout(() => { document.getElementById('ios-install').style.display = 'block'; }, 3000);
  }

  // Offline detection
  const offlineBanner = document.getElementById('offline-banner');
  window.addEventListener('online', () => { offlineBanner.style.display = 'none'; });
  window.addEventListener('offline', () => { offlineBanner.style.display = 'block'; });
  if (!navigator.onLine) offlineBanner.style.display = 'block';

  // Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  function switchView(viewName) {
    views.forEach(v => v.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');
    const navBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');
    window.scrollTo({ top: 0 });
    // Keep Your Margin home shows savings/breathing totals: refresh on return
    if (viewName === 'today' && typeof Margin !== 'undefined') Margin.refreshHome();
  }

  // A PWA left open across midnight: re-render (or reload) so nothing writes to yesterday
  let currentStartDate = null;
  let currentElapsed = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (currentStartDate && Challenge.calculateElapsedDay(currentStartDate) !== currentElapsed) { window.location.reload(); return; }
    if (typeof Margin !== 'undefined') Margin.refreshHome();
  });

  navItems.forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  // Load challenge content
  await Challenge.loadDays();

  // Exercise expand/collapse
  document.getElementById('exercise-toggle').addEventListener('click', () => {
    const detail = document.getElementById('exercise-detail');
    const arrow = document.getElementById('exercise-arrow');
    const show = detail.style.display === 'none';
    detail.style.display = show ? 'block' : 'none';
    arrow.style.transform = show ? 'rotate(180deg)' : '';
  });

  // Quick check-in: optional detail fields collapsed by default (protects the "2 minutes a day" promise)
  const moreToggle = document.getElementById('checkin-more-toggle');
  if (moreToggle) {
    moreToggle.addEventListener('click', () => {
      const details = document.getElementById('checkin-details');
      const show = details.style.display === 'none';
      details.style.display = show ? 'block' : 'none';
      moreToggle.textContent = show ? '− Hide sleep, steps & notes' : '+ Add sleep, steps & notes (optional)';
    });
  }

  // Set per sign-in; read by the Progress tab handler below
  let currentProgressOpts = null;
  let currentChallengeDay = 0;

  // Initialize check-in form
  Checkin.init(
    () => Auth.getUid(),
    () => Challenge.getCurrentDay()
  );

  // Auth state listener
  Auth.onAuthStateChanged(async userData => {
    if (!userData) return;

    // Calculate current day. `day` is the challenge day (0-21) and keys every
    // challenge-side record; `elapsed` is uncapped and drives Keep Your Margin.
    const elapsed = Challenge.calculateElapsedDay(userData.challengeStartDate);
    const day = Math.min(elapsed, 21);
    const marginMode = elapsed > 21;
    const startDate = userData.challengeStartDate;

    // Owner-only settings (Peace of Mind number, health action, resets) + Day 22+ logs
    const marginSettings = await Margin.load(userData.id);
    // Employee Roadmap (Months 2-12): on only when the invite code has roadmap: true
    if (marginMode) await Roadmap.load(userData);

    // Check if pre-assessment needed. Never day-gate the baseline: cohort members
    // inherit the cohort's start date, so a late joiner can land on day 2+ and must
    // still get a baseline — otherwise they're silently excluded from every
    // before/after comparison. Only skip once the post-survey already exists.
    const surveyView = document.getElementById('view-survey');
    const surveyContainer = document.getElementById('survey-container');
    const preSurvey = await Survey.getSurvey(userData.id, 'pre');
    const postSurvey = await Survey.getSurvey(userData.id, 'post');

    if (!preSurvey && !postSurvey) {
      // Show pre-assessment survey
      surveyView.style.display = 'block';
      document.getElementById('view-today').classList.remove('active');
      surveyView.classList.add('active');
      await Survey.showSurvey(userData.id, 'pre', surveyContainer, () => {
        // If the user arrived on a milestone deep link (?survey=m3/m6/m12), the
        // milestone flow below already evaluated with no baseline and skipped —
        // reload (query string preserved) so it runs now that the baseline exists.
        const pendingMs = (new URLSearchParams(window.location.search).get('survey') || '').toLowerCase();
        if (Survey.MILESTONES.includes(pendingMs)) {
          showToast('Baseline saved — one more quick check-in!');
          setTimeout(() => window.location.reload(), 800);
          return;
        }
        surveyView.style.display = 'none';
        surveyView.classList.remove('active');
        surveyContainer.innerHTML = '';
        document.getElementById('view-today').classList.add('active');
        window.scrollTo({ top: 0 });
        showToast('Baseline saved — let\'s start your challenge!');
      });
    }

    // Show post-assessment on Day 21+ if pre exists but post doesn't
    if (preSurvey && day >= 21 && !postSurvey) {
      surveyView.style.display = 'block';
      document.getElementById('view-today').classList.remove('active');
      surveyView.classList.add('active');
      await Survey.showSurvey(userData.id, 'post', surveyContainer, async responses => {
        // Keep the survey view on screen so the before/after comparison —
        // the payoff of the whole challenge — is actually seen
        const postData = { responses };
        Survey.renderComparison(preSurvey, postData, surveyContainer, 'post');
        const doneBtn = document.createElement('button');
        doneBtn.className = 'btn btn-primary btn-full';
        doneBtn.textContent = 'Continue to Today';
        doneBtn.onclick = () => {
          surveyView.style.display = 'none';
          surveyView.classList.remove('active');
          surveyContainer.innerHTML = '';
          document.getElementById('view-today').classList.add('active');
          window.scrollTo({ top: 0 });
        };
        surveyContainer.appendChild(doneBtn);
        window.scrollTo({ top: 0 });
      });
    }

    // Roadmap milestone re-measure (m3/m6/m12). Reached two ways: ?survey=m3 deep
    // links in the monthly Roadmap emails, and the in-app card on the Keep Your
    // Margin home once 90/180/365 days have passed. Pillars-only; baseline = pre-survey.
    async function runMilestone(ms) {
      if (!preSurvey || !Survey.MILESTONES.includes(ms)) return;
      const existingMs = await Survey.getSurvey(userData.id, ms);
      if (existingMs) {
        showToast('You already completed this check-in. Thank you!');
        return;
      }
      surveyView.style.display = 'block';
      document.getElementById('view-today').classList.remove('active');
      surveyView.classList.add('active');
      window.scrollTo({ top: 0 });
      await Survey.showSurvey(userData.id, ms, surveyContainer, responses => {
        Survey.renderComparison(preSurvey, { responses }, surveyContainer, ms);
        const doneBtn = document.createElement('button');
        doneBtn.className = 'btn btn-primary btn-full';
        doneBtn.textContent = 'Continue to Today';
        doneBtn.onclick = () => {
          surveyView.style.display = 'none';
          surveyView.classList.remove('active');
          surveyContainer.innerHTML = '';
          document.getElementById('view-today').classList.add('active');
          window.scrollTo({ top: 0 });
          const card = document.querySelector('.milestone-card');
          if (card) card.style.display = 'none';
        };
        surveyContainer.appendChild(doneBtn);
        window.scrollTo({ top: 0 });
      });
    }
    const milestone = (new URLSearchParams(window.location.search).get('survey') || '').toLowerCase();
    if (preSurvey && Survey.MILESTONES.includes(milestone)) await runMilestone(milestone);

    // Which milestone is due in-app (latest one reached, not yet completed)?
    let dueMilestone = null;
    if (preSurvey && marginMode) {
      const ladder = [{ id: 'm12', at: 365, label: '12-Month' }, { id: 'm6', at: 180, label: '6-Month' }, { id: 'm3', at: 90, label: '3-Month' }];
      for (const m of ladder) {
        if (elapsed >= m.at) {
          const done = await Survey.getSurvey(userData.id, m.id);
          if (!done) dueMilestone = m;
          break;
        }
      }
    }

    // Render today's content (plus the Day 2 / Day 17+ capture inputs)
    let viewingDay = day;
    function renderDay(d) {
      Challenge.renderToday(d);
      Margin.renderCapture(d, { marginMode });
    }
    renderDay(day);
    Checkin.setHealthAction(marginSettings.healthAction && day >= 17 ? marginSettings.healthAction : '');

    // Day navigation
    const prevBtn = document.getElementById('day-prev');
    const nextBtn = document.getElementById('day-next');
    const backLink = document.getElementById('day-back-to-today');

    function updateDayNav() {
      prevBtn.disabled = viewingDay <= 0;
      nextBtn.disabled = viewingDay >= day;
      backLink.style.display = viewingDay !== day ? 'inline' : 'none';
      // Hide check-in form when viewing past/future days. In Keep Your Margin
      // mode the daily check-in lives on the margin home, so the challenge
      // check-in stays hidden (Day 21 has already been logged or passed).
      document.getElementById('checkin-card').style.display = (viewingDay === day && !marginMode) ? 'block' : 'none';
    }

    // onclick assignments (not addEventListener) so a sign-out/sign-in
    // without a reload doesn't stack duplicate handlers
    prevBtn.onclick = () => {
      if (viewingDay > 0) {
        viewingDay--;
        renderDay(viewingDay);
        updateDayNav();
      }
    };

    nextBtn.onclick = () => {
      if (viewingDay < day) {
        viewingDay++;
        renderDay(viewingDay);
        updateDayNav();
      }
    };

    backLink.onclick = e => {
      e.preventDefault();
      viewingDay = day;
      renderDay(day);
      updateDayNav();
    };

    updateDayNav();

    // Daily quote
    const quotes = [
      'The goal isn\'t perfection. It\'s progress.',
      'Small daily improvements are the key to staggering long-term results.',
      'You don\'t have to be extreme. Just consistent.',
      'Margin isn\'t found. It\'s built.',
      'The best time to start was yesterday. The second best time is now.',
      'Systems beat willpower. Every time.',
      'What you track, you improve.',
      'Peace of mind is a financial strategy.',
      'Stress isn\'t the enemy. Unmanaged stress is.',
      'Your baseline is your launchpad.',
      'Progress is progress, no matter how small.',
      'The compound effect works for habits too.',
      'Breathe. Reset. Continue.',
      'Clarity changes everything.',
      'Don\'t count the days. Make the days count.',
      'One percent better every day.',
      'Your future self will thank you.',
      'Consistency compounds.',
      'Build the system. Trust the process.',
      'You\'re closer than you think.',
      'Finish what you started. You\'re almost there.',
      'Twenty-one days to a new foundation.'
    ];
    const quoteEl = document.getElementById('daily-quote');
    quoteEl.textContent = '"' + (quotes[day] || quotes[day % quotes.length]) + '"';

    // Onboarding (first visit only)
    if (!localStorage.getItem('onboardingSeen') && day <= 1) {
      const overlay = document.getElementById('onboarding');
      overlay.style.display = 'block';
      document.getElementById('onboarding-start').onclick = () => {
        overlay.style.display = 'none';
        localStorage.setItem('onboardingSeen', '1');
      };
    }

    // Tomorrow preview
    if (day < 21) {
      const tomorrow = Challenge.getDayData(day + 1);
      if (tomorrow) {
        const card = document.getElementById('tomorrow-card');
        card.style.display = 'block';
        document.getElementById('tomorrow-day-num').textContent = day + 1;
        document.getElementById('tomorrow-title').textContent = tomorrow.title;
        const pillar = document.getElementById('tomorrow-pillar');
        if (tomorrow.pillar) {
          pillar.style.display = 'inline-block';
          pillar.textContent = tomorrow.pillar;
          pillar.className = 'pillar-badge pillar-' + tomorrow.pillar;
        }
      }
    }

    // Load check-in data for today
    await Checkin.loadCheckin(userData.id, day);

    // Savings first (badges and the margin home read the balance), then breathing
    // history (dated sessions, before/after) so badges can count it
    await PeaceOfMind.load(userData.id, day, { marginMode, elapsed, target: marginSettings.pomTarget || 0 });
    const breathSessions = await BreathingTimer.loadStats(userData.id);

    // Progress. In Keep Your Margin mode the trends/history/badges switch to the
    // date-keyed series (challenge days mapped to dates + Day 22+ logs).
    const progressOpts = () => ({
      marginMode,
      elapsed,
      seriesFor: logs => Margin.buildSeries(logs, startDate),
      actionStreakFor: series => Margin.actionStreak(series),
      breathTotal: Math.max(breathSessions.length, userData.breathingSessions || 0),
      pomFunded: !!(Margin.getSettings().pomTarget && PeaceOfMind.getTotal() >= Margin.getSettings().pomTarget),
      resets: (Margin.getSettings().resets || []).length
    });
    const progressData = await Progress.loadProgress(userData.id, day, progressOpts());

    // Cohort accounts: retry any aggregate update that failed earlier and re-check
    // the counted totals once a day (aggregates.js). Fresh reads, fire-and-forget.
    if (userData.companyId) {
      let freshLogs = null;
      Aggregates.reconcileOnLoad(userData, {
        daily: async () => (freshLogs = freshLogs || await Privacy.loadDailyLogs(userData.id)),
        survey: type => Survey.getSurvey(userData.id, type),
        savingsTotal: () => PeaceOfMind.getTotal()
      }).catch(err => console.warn('aggregate check skipped', err));
    }
    currentProgressOpts = progressOpts;
    currentChallengeDay = day;
    currentStartDate = startDate;
    currentElapsed = elapsed;
    Margin.init({ switchView, runMilestone, getUid: () => Auth.getUid() });

    // Show completion banner only when all 21 days are actually checked in, and
    // only while the challenge surface is the home screen (the margin hero takes over after).
    if (progressData && progressData.completedDays >= 21 && !marginMode) {
      document.getElementById('completion-banner').style.display = 'block';
    }

    const streakBar = document.getElementById('streak-bar');
    const streakMsg = document.getElementById('streak-msg');
    const shareBtn = document.getElementById('share-btn');

    if (progressData && progressData.streak > 0) {
      streakBar.style.display = 'flex';
      const s = progressData.streak;
      if (s >= 21) streakMsg.textContent = '21-day streak! You crushed it.';
      else if (s >= 14) streakMsg.textContent = s + '-day streak — final stretch!';
      else if (s >= 7) streakMsg.textContent = s + '-day streak — unstoppable!';
      else if (s >= 3) streakMsg.textContent = s + '-day streak — building momentum';
      else streakMsg.textContent = s + '-day streak — keep going!';
      if (progressData.graceUsed) streakMsg.textContent += ' 🛡️';
    }

    // Bitsy — a warm daily line with personality
    const bitsyText = document.getElementById('bitsy-text');
    const bitsyLine = document.getElementById('bitsy-line');
    if (bitsyText && bitsyLine) {
      const st = progressData ? progressData.streak : 0;
      let line;
      if (st >= 14) line = "Final stretch — you're proof this works. Don't be an Itsy now.";
      else if (st >= 7) line = "A week strong. This is what momentum feels like.";
      else if (st >= 3) line = "Three days in a row. The habit is taking hold.";
      else {
        const lines = [
          "Welcome aboard. I'm Bitsy — let's build some margin together.",
          "Small moves today beat big plans someday. Let's go.",
          "Your Peace of Mind number starts with one deposit. Even $5 counts.",
          "Movement is margin. A little more than yesterday is a win.",
          "Stress isn't the enemy — unmanaged stress is. Breathe with me.",
          "Three pillars, one you. Keep stacking the small stuff.",
          "Progress over perfection. Just show up today.",
          "Don't be an Itsy. Two minutes is all today asks.",
          "You're building something quietly powerful. Keep at it.",
          "Check in, breathe, save a little. That's the whole game.",
          "The compound effect is real — and it's working for you.",
          "Almost there. Finish what you started; future-you is watching."
        ];
        line = lines[day % lines.length];
      }
      bitsyText.textContent = line;
      bitsyLine.style.display = 'flex';
    }

    // Share button (Web Share API)
    if (navigator.share) {
      shareBtn.style.display = 'inline-flex';
      shareBtn.onclick = () => {
        const pct = day > 0 ? Math.round((progressData.completedDays / day) * 100) : 0;
        navigator.share({
          title: 'Build More Margin Challenge',
          text: marginMode
            ? `Day ${elapsed} of building margin. The 21-Day Build More Margin Challenge is done and the habits are still going.`
            : `I'm on Day ${day} of the 21-Day Build More Margin Challenge! ${progressData.streak}-day streak, ${pct}% completion.`,
          url: 'https://challenge.buildmoremargin.com'
        }).catch(() => {});
      };
    }

    // Sync breathing sessions from Firebase (server count wins over this device)
    BreathingTimer.setCount(Math.max(userData.breathingSessions || 0, breathSessions.length));
    BreathingTimer.renderStats();

    // Keep Your Margin home (Day 22+). The challenge surface collapses behind
    // "Revisit the 21 days"; streak chip, Bitsy line and quote move into the hero.
    const marginHome = document.getElementById('margin-home');
    const challengeHome = document.getElementById('challenge-home');
    if (marginMode) {
      Margin.renderHome({ elapsed, dailyLogs: progressData ? progressData.logs : {}, startDate, dueMilestone, userData });
      marginHome.style.display = 'block';
      challengeHome.style.display = 'none';
      streakBar.style.display = 'none';
      bitsyLine.style.display = 'none';
      quoteEl.style.display = 'none';
      document.getElementById('tomorrow-card').style.display = 'none';
    } else {
      marginHome.style.display = 'none';
      challengeHome.style.display = 'block';
      quoteEl.style.display = '';
    }

    // Personalized greeting + day counter
    const greetingEl = document.getElementById('app-greeting');
    const firstName = (userData.name || '').split(' ')[0];
    if (firstName) {
      const hour = new Date().getHours();
      const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      greetingEl.textContent = `${timeGreeting}, ${firstName}`;
    }
    const subtitleEl = document.querySelector('.app-header .subtitle');
    if (subtitleEl && marginMode) {
      subtitleEl.textContent = elapsed <= 90 ? `Keep Your Margin · Day ${elapsed} of your 90-Day Plan` : `Keep Your Margin · Week ${Math.ceil(elapsed / 7)}`;
    } else if (subtitleEl && day >= 1) {
      subtitleEl.textContent = `21-Day Challenge · Day ${day} of 21`;
    }

    // Step presets
    document.querySelectorAll('.step-preset').forEach(btn => {
      btn.onclick = () => {
        document.getElementById('checkin-steps').value = btn.dataset.val;
        document.querySelectorAll('.step-preset').forEach(b => {
          b.style.background = 'var(--bg)';
          b.style.color = '';
          b.style.borderColor = 'var(--border)';
        });
        btn.style.background = 'var(--green)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'var(--green)';
      };
    });

    // Profile
    document.getElementById('profile-name').textContent = userData.name || '';
    document.getElementById('profile-email').textContent = userData.email || '';
    document.getElementById('profile-type').textContent = userData.companyId ? 'Company Challenge' : 'Individual Challenge';

    const startDateInput = document.getElementById('profile-start-date');
    const saveDateBtn = document.getElementById('profile-save');
    const origDate = userData.challengeStartDate || '';
    startDateInput.value = origDate;
    saveDateBtn.disabled = true;

    startDateInput.onchange = () => {
      saveDateBtn.disabled = startDateInput.value === origDate || !startDateInput.value;
    };

    saveDateBtn.onclick = async () => {
      const newDate = startDateInput.value;
      if (!newDate || newDate === origDate) return;
      saveDateBtn.disabled = true;
      saveDateBtn.textContent = 'Saved!';
      await db.collection('users').doc(userData.id).update({ challengeStartDate: newDate });
      userData.challengeStartDate = newDate;
      // Start date changes the mode (challenge vs Keep Your Margin), so reload.
      setTimeout(() => window.location.reload(), 600);
    };

    // Re-run the 21 days (individual accounts; cohort accounts get a note)
    Margin.renderRestartCard(userData, progressData ? progressData.logs : {}, progressData, postSurvey);

    // Home-screen shortcuts (manifest.json) and links can open a specific tab
    const wantedView = (new URLSearchParams(window.location.search).get('view') || '').toLowerCase();
    if (['today', 'progress', 'breathing', 'savings', 'profile'].includes(wantedView) && !document.getElementById('view-survey').classList.contains('active')) {
      switchView(wantedView);
      if (wantedView === 'progress') await Progress.loadProgress(userData.id, day, progressOpts());
    }
  });

  // Load progress when switching to progress tab
  document.querySelector('.nav-item[data-view="progress"]').addEventListener('click', async () => {
    const uid = Auth.getUid();
    if (uid) {
      await Progress.loadProgress(uid, currentChallengeDay, currentProgressOpts ? currentProgressOpts() : undefined);
      // Team leaderboard removed: it queried other users' docs from a participant
      // session, which Firestore rules (correctly) deny, so it never rendered.
      // Future fix: an aggregate participation doc written by an admin/server
      // process that participants are allowed to read — not a rules change.
    }
  });
})();
