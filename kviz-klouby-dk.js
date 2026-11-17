/* Kvíz: klouby a vazy dolní končetiny. Body = rychlost, postup v localStorage. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) boot(root, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var LIMIT = 20000;
  function points(leftMs) {
    var left = Math.max(0, Math.min(LIMIT, Number(leftMs) || 0));
    return Math.round(1000 * (left / LIMIT));
  }
  return { LIMIT: LIMIT, points: points };
});

function boot(window, api) {
  'use strict';
  var LIMIT = api.LIMIT;
  var points = api.points;
  var KEY = 'anat_klouby_dk_v1';
  var SLUG = 'kviz-klouby-dk';
  var DB = 'studovna-kviz-klouby-dk';
  var STORE = 'images';
  var SECTIONS = [
    ['art', 'Artrokinematika (obecně)'],
    ['si', 'Art. sacroiliaca'],
    ['sym', 'Symphysis pubica'],
    ['cox', 'Art. coxae'],
    ['gen', 'Art. genus'],
    ['tf', 'Artt. tibiofibulares'],
    ['tc', 'Art. talocruralis'],
    ['st', 'Art. subtalaris'],
    ['cho', 'Art. tarsi transversa (Chopart)'],
    ['lis', 'Artt. tarsometatarsales (Lisfranc)'],
    ['mtp', 'Artt. metatarsophalangeae'],
    ['ip', 'Artt. interphalangeae']
  ];
  var SECNAME = {};
  SECTIONS.forEach(function (s) { SECNAME[s[0]] = s[1]; });
  var SHAPES = [
    '<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,6 58,54 6,54" fill="#fff"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,4 60,32 32,60 4,32" fill="#fff"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="#fff"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="8" width="48" height="48" rx="6" fill="#fff"/></svg>'
  ];

  var $ = function (id) { return document.getElementById(id); };
  var bank = [];
  var S = blank();
  var picked = {};
  var phase = 'setup';
  var run = null;
  var timer = null;
  var deadline = 0;
  var locked = false;
  var dbp = null;

  SECTIONS.forEach(function (s) { picked[s[0]] = true; });

  function blank() {
    return { ex: {}, anki: {}, inp: {}, t: 0, updated: 0, runs: 0, bestRun: null, lastRun: null };
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Math.round(num(n)).toLocaleString('cs-CZ'); }
  function qid(i) { return 'q' + String(i).padStart(3, '0'); }
  function pctOf(r) { return r && r.max ? Math.round(100 * num(r.pts) / num(r.max)) : 0; }

  function loadState() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!v || typeof v !== 'object') return blank();
      v.ex = v.ex && typeof v.ex === 'object' ? v.ex : {};
      v.anki = v.anki || {};
      v.inp = v.inp || {};
      v.t = num(v.t);
      v.runs = num(v.runs);
      v.updated = num(v.updated);
      return v;
    } catch (e) { return blank(); }
  }
  function saveState() {
    S.updated = Date.now();
    S.anki = S.anki || {};
    S.inp = S.inp || {};
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }
  function wrongIds() {
    var out = {};
    Object.keys(S.ex || {}).forEach(function (k) {
      var rec = S.ex[k];
      if (rec && num(rec.ok) === 0) out[k] = 1;
    });
    return out;
  }

  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('idb')); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb')); };
    });
    return dbp;
  }
  function imgGet(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () { resolve(req.result || ''); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function imgPut(id, data) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(data, id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function imgDel(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function imgKeys() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAllKeys();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function imgAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        var keysReq = tx.objectStore(STORE).getAllKeys();
        tx.oncomplete = function () {
          var out = {};
          var keys = keysReq.result || [];
          var vals = req.result || [];
          keys.forEach(function (k, i) { if (vals[i]) out[k] = vals[i]; });
          resolve(out);
        };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(r.error || new Error('read')); };
      r.readAsDataURL(file);
    });
  }
  function compress(dataUrl) {
    return new Promise(function (resolve) {
      if (dataUrl.length < 500000) { resolve(dataUrl); return; }
      var img = new Image();
      img.onload = function () {
        var max = 1600;
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var scale = Math.min(1, max / Math.max(w, h, 1));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var out = canvas.toDataURL('image/jpeg', 0.85);
        if (out.length > 1500000) out = canvas.toDataURL('image/jpeg', 0.7);
        resolve(out && out.indexOf('data:image/') === 0 ? out : dataUrl);
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }
  function fileToImage(file) {
    if (!file) return Promise.reject(new Error('type'));
    if (file.type && !/^image\//.test(file.type)) return Promise.reject(new Error('type'));
    return readFile(file).then(function (url) {
      if (url.indexOf('data:image/') !== 0) throw new Error('type');
      return compress(url);
    });
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function selection() {
    var hy = $('hy').checked;
    var onlyWrong = $('wrongs').checked;
    var bad = wrongIds();
    return bank.filter(function (item) {
      if (!picked[item.sec]) return false;
      if (hy && !item.hy) return false;
      if (onlyWrong && !bad[item.id]) return false;
      return true;
    });
  }

  function paintFilters() {
    var counts = {};
    bank.forEach(function (item) { counts[item.sec] = (counts[item.sec] || 0) + 1; });
    $('secs').innerHTML = SECTIONS.map(function (s) {
      var on = picked[s[0]] ? ' on' : '';
      var pressed = picked[s[0]] ? 'true' : 'false';
      return '<button type="button" class="chip' + on + '" data-sec="' + s[0] + '" aria-pressed="' + pressed + '">' +
        esc(s[1]) + ' <small>' + (counts[s[0]] || 0) + '</small></button>';
    }).join('');
    var wrongN = Object.keys(wrongIds()).length;
    $('wrong-note').textContent = wrongN
      ? ('naposledy špatně: ' + wrongN + (wrongN === 1 ? ' otázka' : (wrongN < 5 ? ' otázky' : ' otázek')))
      : 'zatím tu žádná chyba není';
    $('wrongs').disabled = wrongN === 0;
    if (wrongN === 0) $('wrongs').checked = false;
    var hyN = bank.filter(function (item) { return item.hy; }).length;
    $('hy-note').textContent = hyN + ' otázek označených jako důležité';
    var items = selection();
    var secOn = SECTIONS.some(function (s) { return picked[s[0]]; });
    var label;
    if (!secOn) label = 'Vyber aspoň jednu sekci.';
    else if (!items.length) label = $('wrongs').checked ? 'V tomhle výběru není žádná chyba.' : 'Tomuhle filtru neodpovídá žádná otázka.';
    else {
      var mins = Math.max(1, Math.round(items.length * 20 / 60));
      label = 'Do kola jde ' + items.length + ' ' + (items.length === 1 ? 'otázka' : (items.length < 5 ? 'otázky' : 'otázek')) +
        ' · nejvýš asi ' + mins + ' min';
    }
    $('picked').textContent = label;
    $('start').disabled = !items.length;
  }

  function paintStats() {
    var answered = Object.keys(S.ex || {}).length;
    var wrongN = Object.keys(wrongIds()).length;
    var best = S.bestRun;
    var last = S.lastRun;
    function cell(title, value, note) {
      return '<div><span>' + esc(title) + '</span><b>' + esc(value) + '</b><span>' + esc(note) + '</span></div>';
    }
    $('stats').innerHTML =
      cell('Zodpovězeno', answered + ' / ' + bank.length, 'aspoň jednou') +
      cell('Naposledy špatně', String(wrongN), 'k opakování') +
      cell('Nejlepší kolo', best ? (pctOf(best) + ' %') : '—', best && best.n >= 10 ? (fmt(best.pts) + ' b · ' + best.ok + '/' + best.n) : 'z kola s aspoň 10 otázkami') +
      cell('Dokončená kola', String(num(S.runs)), last ? ('naposledy ' + last.ok + '/' + last.n + ' · ' + fmt(last.pts) + ' b') : 'ještě žádné');
  }

  function refreshImgCount() {
    imgKeys().then(function (keys) {
      $('imgcount').textContent = 'Uložené obrázky: ' + keys.length;
    }).catch(function () {
      $('imgcount').textContent = 'Obrázky v tomto prohlížeči nejdou uložit.';
    });
  }
  function imgStatus(text) {
    var el = $('imgmsg');
    if (el) el.textContent = text || '';
  }

  function show(which) {
    phase = which;
    $('setup').hidden = which !== 'setup';
    $('play').hidden = which !== 'play' && which !== 'feedback';
    $('result').hidden = which !== 'result';
    if (which === 'setup') {
      paintFilters();
      paintStats();
      refreshImgCount();
    }
    window.scrollTo(0, 0);
  }

  function currentItem() { return run && run.items[run.i]; }

  function showFigure(id) {
    var fig = $('fig');
    var del = $('imgdel');
    fig.hidden = true;
    del.hidden = true;
    $('figimg').removeAttribute('src');
    imgGet(id).then(function (url) {
      if (!run || !currentItem() || currentItem().id !== id) return;
      if (url && String(url).indexOf('data:image/') === 0) {
        $('figimg').src = url;
        fig.hidden = false;
        del.hidden = false;
      }
    }).catch(function () {});
  }

  function renderQuestion() {
    var item = currentItem();
    if (!item) { finish(); return; }
    locked = false;
    phase = 'play';
    $('play').hidden = false;
    $('why').hidden = true;
    $('why').innerHTML = '';
    $('grid').classList.remove('lock');
    $('qpos').textContent = (run.i + 1) + ' / ' + run.items.length;
    $('qsec').textContent = SECNAME[item.sec] || item.sec;
    $('qhy').hidden = !item.hy;
    $('qtext').textContent = item.q;
    var order = shuffle(item.a.map(function (ans, idx) { return { t: ans.t, ok: ans.ok, i: idx }; }));
    run.order = order;
    $('grid').innerHTML = order.map(function (ans, i) {
      return '<button type="button" class="kh-tile c' + i + '" data-i="' + i + '">' +
        SHAPES[i] + '<span class="kn">' + (i + 1) + '</span>' + esc(ans.t) + '</button>';
    }).join('');
    showFigure(item.id);
    deadline = Date.now() + LIMIT;
    clearInterval(timer);
    tick();
    timer = setInterval(tick, 100);
  }

  function tick() {
    var left = deadline - Date.now();
    if (left <= 0) {
      paintClock(0);
      grade(null);
      return;
    }
    paintClock(left);
  }
  function paintClock(left) {
    var sec = Math.max(0, left) / 1000;
    $('clock').textContent = sec.toFixed(1);
    $('clock').classList.toggle('warn', left < 5000);
    $('kbar').style.width = Math.max(0, Math.min(100, 100 * left / LIMIT)) + '%';
    $('kbar').parentNode.classList.toggle('warn', left < 5000);
    $('livepts').textContent = fmt(points(left)) + ' b';
  }

  function grade(index) {
    if (locked || phase !== 'play') return;
    locked = true;
    phase = 'feedback';
    clearInterval(timer);
    var left = Math.max(0, deadline - Date.now());
    var item = currentItem();
    var order = run.order || [];
    var choice = index == null ? null : order[index];
    var correct = !!(choice && choice.ok);
    var gained = correct ? points(left) : 0;
    var correctText = '';
    item.a.forEach(function (ans) { if (ans.ok) correctText = ans.t; });
    $('grid').classList.add('lock');
    Array.prototype.forEach.call($('grid').children, function (btn) {
      var i = Number(btn.getAttribute('data-i'));
      var ans = order[i];
      btn.classList.remove('good', 'bad', 'dim');
      if (ans && ans.ok) btn.classList.add('good');
      else if (choice && i === index) btn.classList.add('bad');
      else btn.classList.add('dim');
      btn.disabled = true;
    });
    var verdict;
    var klass = correct ? 'good' : 'bad';
    if (correct) verdict = 'Správně · +' + fmt(gained) + ' bodů';
    else if (!choice) verdict = 'Čas vypršel · 0 bodů. Správně je: ' + correctText;
    else verdict = 'Špatně · 0 bodů. Správně je: ' + correctText;
    var last = run.i + 1 >= run.items.length;
    $('why').hidden = false;
    $('why').innerHTML = '<p class="kh-verdict ' + klass + '">' + esc(verdict) + '</p>' +
      '<p>' + esc(item.why) + '</p>' +
      '<button type="button" class="btn pri" id="next">' + (last ? 'Výsledky' : 'Další') + '</button>';
    $('next').onclick = function () { nextQ(); };
    $('next').focus();
    var now = Date.now();
    S.ex[item.id] = { ok: correct ? 1 : 0, n: 1, t: now, pts: gained };
    S.t = num(S.t) + (LIMIT - left) / 1000;
    S.updated = now;
    saveState();
    run.pts += gained;
    if (correct) run.ok += 1;
    else run.misses.push({ id: item.id, q: item.q, why: item.why, yours: choice ? choice.t : '', correct: correctText, timeout: !choice });
    try { $('why').scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  function nextQ() {
    if (phase !== 'feedback') return;
    phase = 'advance';
    run.i += 1;
    if (run.i >= run.items.length) finish();
    else renderQuestion();
  }

  function finish() {
    clearInterval(timer);
    var n = run.items.length;
    var max = n * 1000;
    var rec = { pts: run.pts, max: max, ok: run.ok, n: n, at: Date.now() };
    S.lastRun = rec;
    S.runs = num(S.runs) + 1;
    if (n >= 10) {
      var best = S.bestRun;
      var better = !best || pctOf(rec) > pctOf(best) || (pctOf(rec) === pctOf(best) && rec.pts > num(best.pts));
      if (better) S.bestRun = { pts: rec.pts, max: rec.max, ok: rec.ok, n: rec.n, at: rec.at };
    }
    S.updated = Date.now();
    saveState();
    if (n >= 10 && !run.mistakesOnly) {
      try {
        if (window.StudovnaProgress) window.StudovnaProgress.quiz('simulace', SLUG, 'run', run.ok, n);
      } catch (e) {}
    }
    var p = n ? Math.round(100 * run.ok / n) : 0;
    var misses = run.misses.map(function (m) {
      var yours = m.timeout ? 'bez odpovědi, čas vypršel' : m.yours;
      return '<div class="kh-miss"><b>' + esc(m.q) + '</b><span class="sub">Tvoje: ' + esc(yours) + '</span>' +
        '<span class="sub">Správně: ' + esc(m.correct) + '</span><span>' + esc(m.why) + '</span></div>';
    }).join('');
    $('result-body').innerHTML =
      '<p class="kh-score">' + fmt(run.pts) + ' bodů</p>' +
      '<p>Správně ' + run.ok + ' / ' + n + ' · ' + p + ' % · maximum ' + fmt(max) + ' bodů</p>' +
      (S.bestRun ? '<p class="sub">Nejlepší kolo (aspoň 10 otázek): ' + pctOf(S.bestRun) + ' % · ' + fmt(S.bestRun.pts) + ' bodů</p>' : '') +
      (misses ? '<h2>Chyby v tomhle kole</h2>' + misses : '<p>Bez chyby.</p>') +
      '<div class="btns left">' +
      '<button type="button" class="btn pri" id="again">Znovu stejný výběr</button>' +
      (run.misses.length ? '<button type="button" class="btn" id="again-bad">Zopakovat chyby z tohoto kola</button>' : '') +
      '<button type="button" class="btn" id="back">Zpět na výběr</button></div>';
    $('again').onclick = function () { begin(run.source, run.mistakesOnly); };
    if ($('again-bad')) $('again-bad').onclick = function () {
      var want = {};
      run.misses.forEach(function (m) { want[m.id] = 1; });
      begin(run.source.filter(function (item) { return want[item.id]; }), true);
    };
    $('back').onclick = function () { show('setup'); };
    show('result');
  }

  function begin(items, mistakesOnly) {
    var source = items.slice();
    var list = $('shuffle').checked ? shuffle(source) : source.slice();
    run = {
      items: list,
      source: source,
      i: 0,
      pts: 0,
      ok: 0,
      misses: [],
      mistakesOnly: !!mistakesOnly
    };
    show('play');
    renderQuestion();
  }

  function startFromFilters() {
    var items = selection();
    if (!items.length) return;
    begin(items, $('wrongs').checked);
  }

  function attachImage(dataUrl) {
    var item = currentItem();
    if (!item || String(dataUrl).indexOf('data:image/') !== 0) return;
    imgPut(item.id, dataUrl).then(function () {
      if (currentItem() && currentItem().id === item.id) showFigure(item.id);
      refreshImgCount();
    }).catch(function () {
      imgStatus('Obrázek se nepodařilo uložit.');
    });
  }

  function onPaste(e) {
    if (phase !== 'play' && phase !== 'feedback') return;
    var target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        var file = items[i].getAsFile();
        if (!file) return;
        e.preventDefault();
        fileToImage(file).then(attachImage).catch(function () { imgStatus('Ten obrázek nejde vložit.'); });
        return;
      }
    }
  }

  function exportImages() {
    imgStatus('Připravuji export…');
    imgAll().then(function (images) {
      var n = Object.keys(images).length;
      if (!n) { imgStatus('Zatím tu žádný obrázek není.'); return; }
      var payload = JSON.stringify({ quiz: SLUG, v: 1, images: images });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      a.download = 'klouby-dk-obrazky.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      imgStatus('Exportováno ' + n + ' obrázků. Soubor zůstává u tebe.');
    }).catch(function () { imgStatus('Export se nepodařil.'); });
  }

  function importImages(file) {
    if (!file) return;
    if (file.size > 30000000) { imgStatus('Soubor je moc velký.'); return; }
    file.text().then(function (text) {
      var data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.images || typeof data.images !== 'object') throw new Error('shape');
      if (data.quiz && data.quiz !== SLUG) throw new Error('quiz');
      var jobs = [];
      Object.keys(data.images).forEach(function (id) {
        if (!/^q\d{3}$/.test(id)) return;
        var n = Number(id.slice(1));
        if (n < 0 || n >= bank.length) return;
        var url = data.images[id];
        if (typeof url !== 'string' || url.indexOf('data:image/') !== 0) return;
        if (url.length > 2000000) return;
        jobs.push(imgPut(id, url));
      });
      if (!jobs.length) { imgStatus('V souboru není žádný použitelný obrázek.'); return; }
      return Promise.all(jobs).then(function () {
        imgStatus('Načteno ' + jobs.length + ' obrázků. Nikam se neodeslaly.');
        refreshImgCount();
        if (currentItem()) showFigure(currentItem().id);
      });
    }).catch(function () { imgStatus('Soubor se nepodařilo načíst. Čekám JSON z exportu tohoto kvízu.'); });
  }

  function onKey(e) {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    var target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (phase === 'play') {
      var map = { '1': 0, '2': 1, '3': 2, '4': 3 };
      if (map[e.key] != null) {
        e.preventDefault();
        var btn = $('grid') && $('grid').querySelector('[data-i="' + map[e.key] + '"]');
        if (btn) grade(map[e.key]);
      }
    } else if (phase === 'feedback' && (e.key === 'Enter' || e.key === 'ArrowRight')) {
      e.preventDefault();
      nextQ();
    }
  }

  try { localStorage.setItem('sh_last', JSON.stringify(SLUG)); } catch (e) {}
  S = loadState();

  $('secs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sec]');
    if (!b) return;
    var code = b.getAttribute('data-sec');
    picked[code] = !picked[code];
    paintFilters();
  });
  $('sec-all').onclick = function () { SECTIONS.forEach(function (s) { picked[s[0]] = true; }); paintFilters(); };
  $('sec-none').onclick = function () { SECTIONS.forEach(function (s) { picked[s[0]] = false; }); paintFilters(); };
  $('hy').onchange = paintFilters;
  $('wrongs').onchange = paintFilters;
  $('start').onclick = startFromFilters;
  $('grid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]');
    if (!b || locked) return;
    grade(Number(b.getAttribute('data-i')));
  });
  $('imgadd').onclick = function () { $('imgfile').click(); };
  $('imgfile').onchange = function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    fileToImage(file).then(attachImage).catch(function () { imgStatus('Vyber soubor s obrázkem.'); });
  };
  $('imgdel').onclick = function () {
    var item = currentItem();
    if (!item) return;
    imgDel(item.id).then(function () { showFigure(item.id); refreshImgCount(); }).catch(function () {});
  };
  $('img-exp').onclick = exportImages;
  $('img-imp').onclick = function () { $('img-imp-file').click(); };
  $('img-imp-file').onchange = function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (file) importImages(file);
  };
  document.addEventListener('paste', onPaste);
  document.addEventListener('keydown', onKey);
  window.addEventListener('studovna-progress', function () {
    if (phase === 'setup') {
      S = loadState();
      paintFilters();
      paintStats();
    }
  });

  fetch('data/kviz-klouby-dk.json').then(function (r) {
    if (!r.ok) throw new Error('http');
    return r.json();
  }).then(function (data) {
    if (!Array.isArray(data)) throw new Error('shape');
    bank = data.map(function (row, i) {
      var answers = Array.isArray(row[3]) ? row[3] : [];
      return {
        id: qid(i),
        sec: String(row[0] || ''),
        hy: row[1] === 1 || row[1] === true,
        q: String(row[2] || ''),
        a: answers.map(function (text, idx) { return { t: String(text), ok: idx === 0 }; }),
        why: String(row[4] || '')
      };
    }).filter(function (item) { return item.q && item.a.length >= 2 && SECNAME[item.sec]; });
    show('setup');
  }).catch(function () {
    $('loaderr').hidden = false;
    $('filters').hidden = true;
  });
}
