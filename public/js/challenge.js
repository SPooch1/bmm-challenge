// Challenge day management
const Challenge = (() => {
  let daysData = [];
  let currentDay = 0;

  // Pillar anchor videos (owned S3 assets). Days that share a pillar but have no
  // video of their own surface the pillar's core video — so every teaching day has
  // relevant video without inventing content. Reflection/recap days stay video-free.
  const PILLAR_VIDEOS = {
    financial:     { url: 'https://bmm-deliverables-a.s3.amazonaws.com/BMM%20Financial%20Margin-VEED.mp4', label: 'The Financial Pillar' },
    physical:      { url: 'https://bmm-deliverables-a.s3.amazonaws.com/videos/BMM%20Physical%20Margin-VEED.mp4', label: 'The Physical Pillar' },
    psychological: { url: 'https://bmm-deliverables-a.s3.amazonaws.com/BMM%20Psychological%20Margin-VEED.mp4', label: 'The Psychological Pillar' },
    integration:   { url: 'https://bmm-deliverables-a.s3.amazonaws.com/BMM%20Bonus%20video-VEED.mp4', label: 'Putting It Together' },
    mindset:       { url: 'https://bmm-deliverables-a.s3.amazonaws.com/videos/BMM%20Welcome%21-VEED.mp4', label: 'Welcome & Foundations' }
  };

  async function loadDays() {
    return fetch('/content/days.json')
      .then(resp => {
        if (!resp.ok) {
          throw new Error('HTTP ' + resp.status);
        }
        return resp.json();
      })
      .then(data => {
        daysData = data;
        return daysData;
      })
      .catch(err => {
        console.error('loadDays failed:', err);
        const titleEl = document.getElementById('today-title');
        if (titleEl) {
          titleEl.textContent = 'Unable to load challenge content. Please check your connection and refresh.';
        }
        return [];
      });
  }

  // Days elapsed since the start date, uncapped. Day 22+ = Keep Your Margin mode.
  function calculateElapsedDay(startDate) {
    if (!startDate) return 0;
    // Calendar days, not elapsed hours: build UTC ordinals from the LOCAL
    // y/m/d so a DST change (23- or 25-hour day) never shifts the count.
    const p = String(startDate).split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return 0;
    const startOrd = Date.UTC(p[0], p[1] - 1, p[2]);
    const now = new Date();
    const nowOrd = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((nowOrd - startOrd) / 86400000);
    return Math.max(0, diff);
  }

  // Challenge day (0-21). Everything keyed by challenge day (dailyLogs, content,
  // completion %) uses this; the uncapped value drives Keep Your Margin.
  function calculateCurrentDay(startDate) {
    return Math.min(calculateElapsedDay(startDate), 21);
  }

  function isMarginMode(startDate) {
    return calculateElapsedDay(startDate) > 21;
  }

  function getDayData(dayNum) {
    return daysData.find(d => d.day === dayNum) || null;
  }

  function renderToday(dayNum) {
    currentDay = dayNum;
    const data = getDayData(dayNum);
    if (!data) return;

    document.getElementById('today-day-num').textContent = dayNum;
    document.getElementById('today-title').textContent = data.title;
    document.getElementById('today-phase').textContent = data.phase;
    document.getElementById('today-exercise').textContent = data.exercise;
    document.getElementById('today-description').textContent = data.description;
    const hard = document.getElementById('today-hardday');
    if (hard) {
      hard.innerHTML = data.hardDay ? '<strong>Hard day version:</strong> ' : '';
      if (data.hardDay) hard.appendChild(document.createTextNode(data.hardDay));
      hard.style.display = data.hardDay ? 'block' : 'none';
    }

    // Pillar badge
    const badge = document.getElementById('today-pillar-badge');
    if (data.pillar) {
      badge.style.display = 'inline-block';
      badge.textContent = data.pillar;
      badge.className = 'pillar-badge pillar-' + data.pillar;
    } else {
      badge.style.display = 'none';
    }

    // Video — own video plays inline; shared-pillar days offer a one-tap "revisit"
    // so the daily action stays the hero; reflection/recap days show no video card.
    const videoCard = document.getElementById('today-video-card');
    const videoEl = document.getElementById('today-video');
    const videoHeading = document.getElementById('today-video-heading');
    const videoContainer = document.getElementById('today-video-container');
    const revisitBtn = document.getElementById('video-revisit-btn');
    const ownVideo = (data.videoUrl || '').trim();
    const fallback = !ownVideo && data.pillar ? PILLAR_VIDEOS[data.pillar] : null;

    // reset
    revisitBtn.style.display = 'none';
    revisitBtn.onclick = null;
    videoContainer.style.display = 'none';
    videoEl.style.display = 'none';
    videoEl.removeAttribute('src');

    if (ownVideo) {
      videoCard.style.display = 'block';
      videoHeading.style.display = 'block';
      videoHeading.textContent = "Today's Video";
      videoContainer.style.display = 'block';
      videoEl.src = ownVideo;
      videoEl.style.display = 'block';
    } else if (fallback) {
      // Repeat pillar video — collapsed behind a tap, action stays primary
      videoCard.style.display = 'block';
      videoHeading.style.display = 'none';
      revisitBtn.style.display = 'flex';
      revisitBtn.innerHTML = '▶︎  Revisit: ' + fallback.label + ' <span style="opacity:.65;font-weight:500;">· optional</span>';
      revisitBtn.onclick = () => {
        revisitBtn.style.display = 'none';
        videoContainer.style.display = 'block';
        videoEl.src = fallback.url;
        videoEl.style.display = 'block';
        if (videoEl.play) videoEl.play().catch(() => {});
      };
    } else {
      videoCard.style.display = 'none';
    }
  }

  function getCurrentDay() { return currentDay; }
  function getAllDays() { return daysData; }

  return { loadDays, calculateCurrentDay, calculateElapsedDay, isMarginMode, getDayData, renderToday, getCurrentDay, getAllDays };
})();
