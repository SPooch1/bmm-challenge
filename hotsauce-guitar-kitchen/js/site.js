/* Hot Sauce Guitar Kitchen — site behaviour. Vanilla, no build step. */
(function () {
  'use strict';

  /* ---------- mobile menu ---------- */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');

  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = menu.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        menu.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------- sticky nav shadow ---------- */
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-stuck', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- gallery filters ---------- */
  var chips = document.querySelectorAll('.chip');
  var cards = document.querySelectorAll('#grid .card');
  var empty = document.getElementById('gridEmpty');

  function applyFilter(filter) {
    var shown = 0;
    cards.forEach(function (card) {
      var match =
        filter === 'all' ||
        (filter === 'available' && card.dataset.status === 'available') ||
        card.dataset.strings === filter;
      card.classList.toggle('is-hidden', !match);
      if (match) shown++;
    });
    if (empty) empty.hidden = shown > 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-on'); });
      chip.classList.add('is-on');
      applyFilter(chip.dataset.filter);
    });
  });

  /* ---------- scroll reveal ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.08 }
    );
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- commission form ----------
     No backend is wired up yet. The form validates locally and then opens the
     visitor's mail client with the details pre-filled. To take submissions
     server-side instead, point the form at a form service (Formspree, Basin,
     Netlify Forms) and delete the mailto fallback below.
     EDIT: set SHOP_EMAIL to the real address before launch.               */
  var SHOP_EMAIL = 'hello@example.com';

  var form = document.getElementById('orderForm');
  var note = document.getElementById('formNote');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var data = new FormData(form);
      var name = (data.get('name') || '').trim();
      var email = (data.get('email') || '').trim();
      var valid = true;

      [['name', name], ['email', email]].forEach(function (pair) {
        var field = form.elements[pair[0]];
        var ok = pair[0] === 'email' ? /^\S+@\S+\.\S+$/.test(pair[1]) : pair[1].length > 0;
        field.classList.toggle('invalid', !ok);
        if (!ok) valid = false;
      });

      if (!valid) {
        note.textContent = 'Add your name and a valid email so we can send a quote back.';
        note.classList.add('err');
        return;
      }

      var body = [
        'Name: ' + name,
        'Email: ' + email,
        'Strings: ' + data.get('strings'),
        'Own box: ' + data.get('box'),
        '',
        'Notes:',
        (data.get('notes') || '').trim() || '(none)'
      ].join('\n');

      note.classList.remove('err');
      note.textContent = 'Opening your email app with the details filled in…';
      window.location.href =
        'mailto:' + SHOP_EMAIL +
        '?subject=' + encodeURIComponent('Cigar box guitar commission — ' + name) +
        '&body=' + encodeURIComponent(body);
    });
  }

  /* ---------- footer year ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
