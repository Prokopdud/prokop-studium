/* Study session Biologie P01: zopakování a závěrečný test (20 otázek a–d). */
(function () {
  'use strict';
  var KEY = 'bio_p01_study_v1';
  var S = { ex: {}, anki: {}, t: 0, inp: {} };
  var D = null;
  var cur = 0;
  var nav = document.getElementById('nav');
  var main = document.getElementById('main');

  function load() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (p && typeof p === 'object') {
        S.ex = p.ex || {};
        S.anki = p.anki || {};
        S.t = p.t || 0;
        S.inp = p.inp || {};
        if (p.last != null) S.last = p.last;
      }
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    var s = document.getElementById('saved');
    if (!s) return;
    s.textContent = '✓ uloženo';
    s.className = 'on';
    clearTimeout(save._t);
    save._t = setTimeout(function () { s.className = ''; }, 1200);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sections() {
    return D.sections.concat([{ id: 'exam', title: 'Závěrečný test' }]);
  }
  function examDone() {
    return S.ex.exam_0 && Number(S.ex.exam_0.n) > 0;
  }
  function renderNav() {
    var list = sections();
    nav.innerHTML = list.map(function (s, i) {
      var mark = '';
      if (s.id === 'exam' && examDone()) {
        var p = S.ex.exam_0;
        var pct = Math.round(100 * Number(p.ok) / Number(p.n));
        mark = pct >= 80 ? '✔' : pct + '%';
      } else if (s.id !== 'exam' && S.seen && S.seen[s.id]) mark = '·';
      return '<a href="#' + esc(s.id) + '" data-i="' + i + '"' + (i === cur ? ' class="on"' : '') + '>' +
        esc(s.title) + (mark ? '<span class="st">' + mark + '</span>' : '') + '</a>';
    }).join('');
    var done = Object.keys(S.ex).filter(function (k) { return S.ex[k]; }).length;
    var total = 111;
    var el = document.getElementById('prog');
    if (el) el.textContent = done + '/' + total;
  }
  function show(i) {
    var list = sections();
    cur = Math.max(0, Math.min(list.length - 1, i));
    var s = list[cur];
    S.seen = S.seen || {};
    S.seen[s.id] = 1;
    S.last = cur;
    save();
    renderNav();
    try { history.replaceState(null, '', '#' + s.id); } catch (e) {}
    main.innerHTML = '';
    main.appendChild(Object.assign(document.createElement('h2'), { textContent: s.title }));
    if (s.id !== 'exam') {
      var box = document.createElement('div');
      box.className = 'intro';
      box.innerHTML = s.html;
      main.appendChild(box);
    } else {
      renderExam();
    }
    var pn = document.createElement('div');
    pn.className = 'pn';
    if (cur > 0) {
      var prev = document.createElement('button');
      prev.type = 'button';
      prev.textContent = '‹ Předchozí';
      prev.onclick = function () { show(cur - 1); };
      pn.appendChild(prev);
    }
    if (cur < list.length - 1) {
      var next = document.createElement('button');
      next.type = 'button';
      next.className = 'pri';
      next.textContent = cur === list.length - 2 ? 'Na test ›' : 'Další ›';
      next.onclick = function () { show(cur + 1); };
      pn.appendChild(next);
    }
    main.appendChild(pn);
    main.scrollIntoView({ block: 'start' });
  }
  function renderExam() {
    var intro = document.createElement('div');
    intro.className = 'intro';
    intro.innerHTML = '<p>20 otázek, výběr a–d. Vyber u každé odpověď a dej Zkontrolovat. Pořadí a–d je pořád stejné, aby sedělo s klíčem.</p>';
    main.appendChild(intro);
    var form = document.createElement('form');
    form.id = 'exam';
    form.addEventListener('submit', function (e) { e.preventDefault(); grade(form); });
    D.exam.forEach(function (q) {
      var box = document.createElement('fieldset');
      box.className = 'q';
      var leg = document.createElement('legend');
      leg.innerHTML = '<b>' + q.n + '.</b> ' + esc(q.prompt);
      box.appendChild(leg);
      q.options.forEach(function (t, i) {
        var lab = document.createElement('label');
        lab.className = 'optlab';
        var inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'e' + q.n;
        inp.value = String(i);
        lab.appendChild(inp);
        lab.appendChild(document.createTextNode(' ' + 'abcd'[i] + ') ' + t));
        box.appendChild(lab);
      });
      var fb = document.createElement('div');
      fb.className = 'fb';
      fb.hidden = true;
      box.appendChild(fb);
      form.appendChild(box);
    });
    var bar = document.createElement('div');
    var btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'pri';
    btn.textContent = 'Zkontrolovat test';
    bar.appendChild(btn);
    form.appendChild(bar);
    var score = document.createElement('div');
    score.id = 'score';
    score.className = 'score';
    form.appendChild(score);
    var key = document.createElement('div');
    key.id = 'keybox';
    key.hidden = true;
    form.appendChild(key);
    main.appendChild(form);
    if (examDone()) {
      paintResult(form, Number(S.ex.exam_0.ok), false);
    }
  }
  function grade(form) {
    var ok = 0;
    var missing = false;
    D.exam.forEach(function (q) {
      var picked = form.querySelector('input[name="e' + q.n + '"]:checked');
      if (!picked) missing = true;
      else if (Number(picked.value) === q.choice) ok++;
    });
    if (missing) {
      var s = document.getElementById('score');
      s.textContent = 'Ještě chybí odpověď u některé otázky.';
      s.className = 'score bad';
      return;
    }
    var prev = S.ex.exam_0;
    var rec = { ok: ok, n: D.exam.length };
    if (!(prev && Number(prev.ok) > ok)) S.ex.exam_0 = rec;
    save();
    try { if (window.StudovnaProgress) window.StudovnaProgress.item(KEY, 'exam_0', ok, D.exam.length); } catch (e) {}
    paintResult(form, ok, true);
    renderNav();
  }
  function paintResult(form, ok, fresh) {
    D.exam.forEach(function (q) {
      var box = form.querySelector('input[name="e' + q.n + '"]');
      if (!box) return;
      box = box.closest('.q');
      var picked = form.querySelector('input[name="e' + q.n + '"]:checked');
      var good = !!(picked && Number(picked.value) === q.choice);
      var fb = box.querySelector('.fb');
      fb.hidden = false;
      fb.className = 'fb ' + (picked ? (good ? 'ok' : 'no') : '');
      fb.textContent = (picked ? (good ? 'Správně. ' : 'Správně je: ') : 'Správně: ') + 'abcd'[q.choice] + ') ' + q.options[q.choice];
      box.querySelectorAll('label').forEach(function (lab, i) {
        lab.classList.toggle('ok', i === q.choice);
        lab.classList.toggle('no', !!(picked && Number(picked.value) === i && i !== q.choice));
      });
    });
    var pct = Math.round(100 * ok / D.exam.length);
    var score = document.getElementById('score');
    var best = S.ex.exam_0 ? Number(S.ex.exam_0.ok) : ok;
    score.className = 'score ' + (pct >= 80 ? 'good' : pct >= 50 ? 'mid' : 'bad');
    score.textContent = 'Test: ' + ok + ' / ' + D.exam.length + ' (' + pct + ' %)' +
      (best !== ok ? ' · nejlepší uložené skóre ' + best + '/' + D.exam.length : '');
    var key = document.getElementById('keybox');
    key.hidden = false;
    key.className = 'intro';
    key.innerHTML = '<h3>Klíč</h3>' + D.key;
    if (fresh) score.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  document.getElementById('nav').addEventListener('click', function (e) {
    var a = e.target.closest('a[data-i]');
    if (!a) return;
    e.preventDefault();
    show(Number(a.getAttribute('data-i')));
  });
  document.getElementById('reset').onclick = function () {
    if (!confirm('Smazat výsledek závěrečného testu v téhle study session? Cvičení v lekcích zůstanou.')) return;
    delete S.ex.exam_0;
    S.seen = {};
    S.last = 0;
    S.t = 0;
    save();
    show(0);
  };
  document.getElementById('mbtn').onclick = function () { document.body.classList.toggle('menu'); };

  var tick = 0;
  setInterval(function () {
    S.t = (S.t || 0) + 1;
    tick++;
    var clock = document.getElementById('tclock');
    if (clock) {
      var s = S.t;
      clock.textContent = '⏱ ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }
    if (tick % 30 === 0) save();
  }, 1000);
  window.addEventListener('pagehide', function () { save(); });

  fetch('bio-study-data.json').then(function (r) { return r.json(); }).then(function (d) {
    D = d;
    load();
    document.querySelector('h1').textContent = 'Biologie – ' + D.title;
    var lead = document.getElementById('lead');
    if (lead) lead.innerHTML = D.intro;
    var list = sections();
    var start = 0;
    if (location.hash) {
      var id = location.hash.slice(1);
      var ix = list.map(function (s) { return s.id; }).indexOf(id);
      if (ix >= 0) start = ix;
    } else if (typeof S.last === 'number') start = S.last;
    show(start);
  }).catch(function () {
    main.textContent = 'Study session se nepodařilo načíst.';
  });
})();
