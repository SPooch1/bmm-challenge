// Main app controller
(async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.warn('SW registration failed:', err)
    );
  }

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

    // Load savings
    await PeaceOfMind.load(userData.id);

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
    }
  });
})();
