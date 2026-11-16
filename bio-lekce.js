/* Lekce Biologie P01: čtení, cvičení, slide a Anki pauza. */
(function () {
  'use strict';
  var KEY = 'bio_p01_lekce_v1';
  var STUDY = 'bio_p01_study_v1';
  var S = {};
  var D = null;
  var M = document.getElementById('sg');

  function loadLekce() {
    try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
  }
  function saveLekce() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }
  function loadStudy() {
    var s = { ex: {}, anki: {}, t: 0, inp: {} };
    try {
      var p = JSON.parse(localStorage.getItem(STUDY) || 'null');
      if (p && typeof p === 'object') {
        s.ex = p.ex || {};
        s.anki = p.anki || {};
        s.t = p.t || 0;
        s.inp = p.inp || {};
        if (p.last != null) s.last = p.last;
      }
    } catch (e) {}
    return s;
  }
  function saveStudy(s) {
    try { localStorage.setItem(STUDY, JSON.stringify(s)); } catch (e) {}
  }
  function el(t, c, h) {
    var e = document.createElement(t);
    if (c) e.className = c;
    if (h != null) e.innerHTML = h;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function md(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[„“”"'«»]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function fold(s) {
    return norm(s)
      .replace(/glukoza/g, 'glukosa')
      .replace(/fruktoza/g, 'fruktosa')
      .replace(/galaktoza/g, 'galaktosa')
      .replace(/celuloza/g, 'celulosa')
      .replace(/ribozom/g, 'ribosom')
      .replace(/synthesa/g, 'synteza');
  }
  function words(s) {
    return fold(s).split(' ').filter(function (w) { return w.length >= 4; });
  }
  function fillOk(ans, official) {
    var a = fold(ans);
    if (!a) return false;
    var main = fold(String(official).replace(/\(.*?\)/g, ' '));
    var paren = (String(official).match(/\(([^)]*)\)/) || [])[1];
    if (a === fold(official) || a === main) return true;
    if (paren && a === fold(paren)) return true;
    return false;
  }
  function openOk(ans, official) {
    var a = fold(ans), b = fold(official);
    if (!a) return false;
    if (a === b) return true;
    if (b.length <= 48 && a.indexOf(b) >= 0) return true;
    if (a.length >= 4 && a.length <= 48 && b.indexOf(a) >= 0) return true;
    var bw = words(official);
    if (bw.length < 4) return false;
    var hit = bw.filter(function (w) { return (' ' + a + ' ').indexOf(' ' + w + ' ') >= 0 || a.indexOf(w) >= 0; }).length;
    return hit / bw.length >= 0.65 && a.length >= b.length * 0.4;
  }
  function recordQ(id, ok) {
    S[id] = 1;
    saveLekce();
    var st = loadStudy();
    var prev = st.ex[id];
    var rec = { ok: ok ? 1 : 0, n: 1 };
    if (prev && Number(prev.ok) > rec.ok) rec = { ok: Number(prev.ok), n: Number(prev.n) || 1 };
    st.ex[id] = rec;
    saveStudy(st);
    try { if (window.StudovnaProgress) window.StudovnaProgress.item(STUDY, id, rec.ok, rec.n); } catch (e) {}
  }
  function wasOk(id) {
    var st = loadStudy();
    return !!(st.ex[id] && Number(st.ex[id].ok) >= 1);
  }

  function ankiBox(pause) {
    var a = D.anki;
    var b = el('div', 'anki' + (pause ? '' : ' mini'));
    b.innerHTML = '<div class="ah"><span aria-hidden="true">⭐</span><a href="' + esc(a.file) + '" download>' +
      esc(pause ? 'Anki pauza – ' + D.title : 'Balíček k přednášce') + '</a></div><div class="ab">' +
      (pause ? '<div>Až projdeš kapitoly, zopakuj si balíček v Anki:</div>' : '') +
      '<div class="deck">' + esc(a.deck) + '</div><div><span class="cnt">' + a.cards + ' karet</span> · ' + a.mb + ' MB</div>' +
      '<a class="abtn" href="' + esc(a.file) + '" download>Stáhnout balíček .apkg</a>' +
      (pause ? '<label><input type="checkbox" data-anki="a01"' + (S.a01 ? ' checked' : '') + '> Hotovo – prošel/a jsem balíček v Anki</label>' : '') +
      '</div>';
    return b;
  }

  function question(q) {
    var d = el('div', 'q');
    d.id = q.id;
    d.appendChild(el('p', '', '<b>' + q.n + '.</b> ' + md(q.prompt)));
    var fb = el('div', 'fb');
    var done = !!S[q.id];

    function finish(ok, extra) {
      recordQ(q.id, ok);
      fb.className = 'fb ' + (ok ? 'ok' : 'no');
      fb.innerHTML = (ok ? 'Správně. ' : 'Tahle odpověď nesedí. ') + 'Odpověď: ' + md(q.answer) + (extra || '');
      d.querySelectorAll('button,input,textarea').forEach(function (n) {
        if (n.getAttribute('data-uznat')) return;
        n.disabled = true;
      });
      if (!ok && q.kind === 'open' && !d.querySelector('[data-uznat]')) {
        var u = el('button', 'btn', 'Mám to dobře');
        u.type = 'button';
        u.setAttribute('data-uznat', '1');
        u.onclick = function () {
          recordQ(q.id, true);
          fb.className = 'fb ok';
          fb.innerHTML = 'Uznáno. Odpověď: ' + md(q.answer);
          u.remove();
          step();
        };
        d.appendChild(u);
      }
      d.appendChild(fb);
      step();
    }

    if (done) {
      var ok0 = wasOk(q.id);
      fb.className = 'fb ' + (ok0 ? 'ok' : 'no');
      fb.innerHTML = (ok0 ? 'Hotovo, správně. ' : 'Hotovo. ') + 'Odpověď: ' + md(q.answer);
      d.appendChild(fb);
      if (!ok0 && q.kind === 'open') {
        var u0 = el('button', 'btn', 'Mám to dobře');
        u0.type = 'button';
        u0.setAttribute('data-uznat', '1');
        u0.onclick = function () {
          recordQ(q.id, true);
          fb.className = 'fb ok';
          fb.innerHTML = 'Uznáno. Odpověď: ' + md(q.answer);
          u0.remove();
          step();
        };
        d.appendChild(u0);
      }
      return d;
    }

    if (q.kind === 'mcq') {
      q.options.forEach(function (t, i) {
        var b = el('button', 'btn opt', esc('abcd'[i] + ') ' + t));
        b.type = 'button';
        b.onclick = function () {
          var ok = i === q.choice;
          d.querySelectorAll('.opt').forEach(function (z, k) {
            z.disabled = true;
            if (k === q.choice) z.classList.add('ok');
          });
          b.classList.add(ok ? 'ok' : 'no');
          finish(ok, '');
        };
        d.appendChild(b);
      });
      return d;
    }

    var field = q.kind === 'open' ? el('textarea') : el('input');
    if (q.kind === 'open') field.rows = 3;
    field.setAttribute('aria-label', 'Odpověď');
    field.autocomplete = 'off';
    var b = el('button', 'btn', 'Zkontrolovat');
    b.type = 'button';
    function chk() {
      var ok = q.kind === 'open' ? openOk(field.value, q.answer) : fillOk(field.value, q.answer);
      finish(ok, '');
    }
    b.onclick = chk;
    field.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && q.kind !== 'open') { e.preventDefault(); chk(); }
    });
    d.appendChild(field);
    d.appendChild(b);
    return d;
  }

  var units = [];
  function build() {
    M.appendChild(el('div', 'read', D.intro));
    var toc = el('nav', 'toc');
    toc.setAttribute('aria-label', 'Kapitoly');
    D.chapters.forEach(function (c) {
      toc.appendChild(el('a', '', c.code.replace(/^0/, '') + ' ' + esc(c.name))).href = '#k' + c.code;
    });
    M.appendChild(toc);
    M.appendChild(ankiBox(false));

    D.chapters.forEach(function (c) {
      var h = el('h2', '', 'Kapitola ' + String(Number(c.code)) + ' · ' + esc(c.name) + '<small>' + esc(c.src) + '</small>');
      h.id = 'k' + c.code;
      M.appendChild(h);
      var g = el('div');
      g.dataset.ch = c.code;
      M.appendChild(g);
      var r = el('section', 'read');
      r.innerHTML = c.read;
      var rb = el('button', 'btn go', 'Přečteno – k procvičení ↓');
      rb.type = 'button';
      r.appendChild(rb);
      var pr = el('div', 'prac');
      pr.appendChild(el('h3', '', 'Cvičení'));
      c.questions.forEach(function (q) { pr.appendChild(question(q)); });
      var ids = c.questions.map(function (q) { return q.id; });
      rb.onclick = function () {
        S['r' + c.code] = 1;
        saveLekce();
        step();
        pr.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      units.push({ r: r, rb: rb, pr: pr, g: g, readKey: 'r' + c.code, qs: ids });
    });

    var end = el('div');
    end.appendChild(ankiBox(true));
    if (D.notes) end.appendChild(el('div', 'tips', '<b>Poznámky k přednášce</b>' + D.notes));
    end.appendChild(el('div', 'done', '<b>Kapitoly jsou přečtené.</b> Závěrečný test je ve <a href="biologie-p01.html">study session</a>.'));
    units.push({ end: end });
    M.addEventListener('change', function (e) {
      if (e.target && e.target.getAttribute('data-anki') === 'a01') {
        S.a01 = e.target.checked ? 1 : 0;
        saveLekce();
        step();
      }
    });
  }

  function step() {
    var open = true, n = 0, dn = 0;
    units.forEach(function (u) {
      if (u.end) {
        if (open && !u.end.parentNode) M.appendChild(u.end);
        if (!open && u.end.parentNode) u.end.remove();
        if (S.a01) { n++; dn++; } else n++;
        return;
      }
      n += 1 + u.qs.length;
      if (!open) {
        if (u.r.parentNode) u.r.remove();
        if (u.pr.parentNode) u.pr.remove();
        return;
      }
      if (!u.r.parentNode) u.g.appendChild(u.r);
      var read = !!S[u.readKey];
      u.rb.hidden = read;
      if (read) dn++;
      else { open = false; return; }
      if (!u.pr.parentNode) u.g.appendChild(u.pr);
      var all = u.qs.every(function (id) { return S[id]; });
      if (all) dn += u.qs.length;
      else { dn += u.qs.filter(function (id) { return S[id]; }).length; open = false; }
    });
    var lk = document.getElementById('lock');
    if (lk) lk.remove();
    if (!open) {
      lk = el('p', 'lock', '🔒 Další kapitola se odemkne, až dokončíš tuhle.');
      lk.id = 'lock';
      var last = [].slice.call(M.querySelectorAll('section.read,.prac,.anki:not(.mini)')).pop();
      if (last) last.after(lk);
    }
    var bar = document.querySelector('.bar i');
    if (bar) bar.style.width = Math.round(100 * dn / Math.max(n, 1)) + '%';
  }

  document.getElementById('reset').onclick = function () {
    if (!confirm('Začít tuhle lekci znovu? Závěrečný test ve study session zůstane.')) return;
    try { if (window.StudovnaProgress) window.StudovnaProgress.cleared(KEY); } catch (e) {}
    localStorage.removeItem(KEY);
    var st = loadStudy();
    Object.keys(st.ex).forEach(function (k) { if (/^q\d+$/.test(k)) delete st.ex[k]; });
    saveStudy(st);
    location.hash = '';
    location.reload();
  };

  fetch('bio-lekce-data.json').then(function (r) { return r.json(); }).then(function (d) {
    D = d;
    loadLekce();
    build();
    step();
    if (location.hash) {
      var t = document.getElementById(location.hash.slice(1));
      if (t) t.scrollIntoView({ block: 'start' });
    }
  }).catch(function () {
    M.textContent = 'Lekci se nepodařilo načíst.';
  });
})();
