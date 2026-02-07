// Challenge day management
const Challenge = (() => {
  let daysData = [];
  let currentDay = 0;

  async function loadDays() {
    const resp = await fetch('/content/days.json');
    daysData = await resp.json();
    return daysData;
  }

  function calculateCurrentDay(startDate) {
    if (!startDate) return 0;
    const start = new Date(startDate + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    return Math.max(0, Math.min(diff, 21));
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

    // Pillar badge
    const badge = document.getElementById('today-pillar-badge');
    if (data.pillar) {
      badge.style.display = 'inline-block';
      badge.textContent = data.pillar;
      badge.className = 'pillar-badge pillar-' + data.pillar;
    } else {
      badge.style.display = 'none';
    }

    // Video
    const videoCard = document.getElementById('today-video-card');
    const videoEl = document.getElementById('today-video');
    const placeholder = document.getElementById('today-video-placeholder');
    if (data.videoUrl) {
      videoCard.style.display = 'block';
      videoEl.style.display = 'block';
      videoEl.src = data.videoUrl;
      placeholder.style.display = 'none';
    } else {
      videoCard.style.display = 'block';
      videoEl.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  }

  function getCurrentDay() { return currentDay; }
  function getAllDays() { return daysData; }

  return { loadDays, calculateCurrentDay, getDayData, renderToday, getCurrentDay, getAllDays };
})();
