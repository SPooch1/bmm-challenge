// Main app controller
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
  }

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

  // Initialize check-in form
  Checkin.init(
    () => Auth.getUid(),
    () => Challenge.getCurrentDay()
  );

  // Auth state listener
  Auth.onAuthStateChanged(async userData => {
    if (!userData) return;

    // Calculate current day
    const day = Challenge.calculateCurrentDay(userData.challengeStartDate);

    // Check if pre-assessment needed (Day 0 or first visit)
    const surveyView = document.getElementById('view-survey');
    const surveyContainer = document.getElementById('survey-container');
    const preSurvey = await Survey.getSurvey(userData.id, 'pre');

    if (!preSurvey && day <= 1) {
      // Show pre-assessment survey
      surveyView.style.display = 'block';
      document.getElementById('view-today').classList.remove('active');
      surveyView.classList.add('active');
      await Survey.showSurvey(userData.id, 'pre', surveyContainer, () => {
        surveyView.style.display = 'none';
        surveyView.classList.remove('active');
        document.getElementById('view-today').classList.add('active');
        surveyContainer.innerHTML = '<div class="card" style="text-align:center;"><h3 style="color:var(--green);">Baseline saved!</h3><p>Let\'s start your challenge.</p></div>';
      });
    }

    // Show post-assessment on Day 21+ if pre exists but post doesn't
    if (preSurvey && day >= 21) {
      const postSurvey = await Survey.getSurvey(userData.id, 'post');
      if (!postSurvey) {
        surveyView.style.display = 'block';
        document.getElementById('view-today').classList.remove('active');
        surveyView.classList.add('active');
        await Survey.showSurvey(userData.id, 'post', surveyContainer, async responses => {
          const postData = { responses };
          surveyView.classList.remove('active');
          document.getElementById('view-today').classList.add('active');
          Survey.renderComparison(preSurvey, postData, surveyContainer);
        });
      }
    }

    // Render today's content
    let viewingDay = day;
    Challenge.renderToday(day);

    // Show completion banner on Day 21
    if (day >= 21) {
      document.getElementById('completion-banner').style.display = 'block';
    }

    // Day navigation
    const prevBtn = document.getElementById('day-prev');
    const nextBtn = document.getElementById('day-next');
    const backLink = document.getElementById('day-back-to-today');

    function updateDayNav() {
      prevBtn.disabled = viewingDay <= 0;
      nextBtn.disabled = viewingDay >= day;
      backLink.style.display = viewingDay !== day ? 'inline' : 'none';
      // Hide check-in form when viewing past/future days
      document.getElementById('checkin-card').style.display = viewingDay === day ? 'block' : 'none';
    }

    prevBtn.addEventListener('click', () => {
      if (viewingDay > 0) {
        viewingDay--;
        Challenge.renderToday(viewingDay);
        updateDayNav();
      }
    });

    nextBtn.addEventListener('click', () => {
      if (viewingDay < day) {
        viewingDay++;
        Challenge.renderToday(viewingDay);
        updateDayNav();
      }
    });

    backLink.addEventListener('click', e => {
      e.preventDefault();
      viewingDay = day;
      Challenge.renderToday(day);
      updateDayNav();
    });

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
      document.getElementById('onboarding-start').addEventListener('click', () => {
        overlay.style.display = 'none';
        localStorage.setItem('onboardingSeen', '1');
      });
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

    // Streak motivation
    const progressData = await Progress.loadProgress(userData.id, day);
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
    }

    // Share button (Web Share API)
    if (navigator.share) {
      shareBtn.style.display = 'inline-flex';
      shareBtn.addEventListener('click', () => {
        const pct = day > 0 ? Math.round((progressData.completedDays / day) * 100) : 0;
        navigator.share({
          title: 'Build More Margin Challenge',
          text: `I'm on Day ${day} of the 21-Day Build More Margin Challenge! ${progressData.streak}-day streak, ${pct}% completion.`,
          url: 'https://challenge.buildmoremargin.com'
        }).catch(() => {});
      });
    }

    // Breathing nudge (show after noon if not done today)
    const hour = new Date().getHours();
    if (hour >= 12 && !document.getElementById('checkin-breathing').checked) {
      document.getElementById('breathing-nudge').style.display = 'block';
      document.getElementById('nudge-breathe').addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('breathing-nudge').style.display = 'none';
        switchView('breathing');
      });
    }

    // Load savings
    await PeaceOfMind.load(userData.id);

    // Personalized greeting
    const greetingEl = document.getElementById('app-greeting');
    const hour = new Date().getHours();
    const firstName = (userData.name || '').split(' ')[0];
    if (firstName) {
      const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      greetingEl.textContent = `${timeGreeting}, ${firstName}`;
    }

    // Step presets
    document.querySelectorAll('.step-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('checkin-steps').value = btn.dataset.val;
        btn.style.background = 'var(--green)';
        btn.style.color = 'var(--white)';
        btn.style.borderColor = 'var(--green)';
      });
    });

    // Profile
    document.getElementById('profile-name').textContent = userData.name || '';
    document.getElementById('profile-email').textContent = userData.email || '';
    document.getElementById('profile-type').textContent = userData.companyId ? 'Company Challenge' : 'Individual Challenge';
    document.getElementById('profile-start-date').value = userData.challengeStartDate || '';

    // Profile save
    document.getElementById('profile-save').onclick = async () => {
      const newDate = document.getElementById('profile-start-date').value;
      if (newDate) {
        await db.collection('users').doc(userData.id).update({ challengeStartDate: newDate });
        userData.challengeStartDate = newDate;
        const newDay = Challenge.calculateCurrentDay(newDate);
        Challenge.renderToday(newDay);
        await Checkin.loadCheckin(userData.id, newDay);
      }
    };
  });

  // Load progress when switching to progress tab
  document.querySelector('.nav-item[data-view="progress"]').addEventListener('click', async () => {
    const uid = Auth.getUid();
    if (uid) {
      await Progress.loadProgress(uid, Challenge.getCurrentDay());
      // Load leaderboard for company participants
      const user = Auth.getUser();
      if (user && user.companyId) {
        loadLeaderboard(user.companyId, uid);
      }
    }
  });

  async function loadLeaderboard(companyId, myUid) {
    const card = document.getElementById('leaderboard-card');
    const list = document.getElementById('leaderboard-list');
    try {
      const snapshot = await db.collection('users')
        .where('companyId', '==', companyId)
        .where('role', '==', 'participant')
        .get();

      if (snapshot.empty || snapshot.size < 2) return;

      const entries = [];
      const logPromises = [];

      snapshot.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        entries.push(data);
        logPromises.push(
          db.collection('users').doc(doc.id).collection('dailyLogs').get().then(logs => {
            data.completedDays = 0;
            logs.forEach(l => { if (l.data().completed) data.completedDays++; });
          })
        );
      });

      await Promise.all(logPromises);
      entries.sort((a, b) => b.completedDays - a.completedDays);

      card.style.display = 'block';
      list.innerHTML = entries.slice(0, 10).map((e, i) => {
        const isMe = e.id === myUid;
        const medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : '';
        const firstName = (e.name || 'Anonymous').split(' ')[0];
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);${isMe ? 'font-weight:700;color:var(--green);' : ''}">
          <span style="min-width:28px;text-align:center;font-size:${medal ? '1.2rem' : '0.85rem'};">${medal || (i + 1)}</span>
          <span style="flex:1;">${firstName}${isMe ? ' (You)' : ''}</span>
          <span style="font-size:0.85rem;color:var(--slate);">${e.completedDays} days</span>
        </div>`;
      }).join('');
    } catch (e) {
      // Can't load leaderboard — might not have permissions
    }
  }
})();
