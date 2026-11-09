(function () {
  'use strict';
  var ACC = '#1f6f5c', ACC2 = '#c45c26', GRID = '#e4ebe8';
  var DEV_LABEL = { mobile: 'Mobil', desktop: 'Desktop', tablet: 'Tablet', unknown: 'Neznámé' };
  var DEV_ORDER = ['mobile', 'desktop', 'tablet', 'unknown'];
  var FEAT = {
    search: 'Hledání', anki_download: 'Stahování Anki', sim_test_start: 'Spuštění simulace',
    sim_test_finish: 'Dokončení simulace', pomodoro: 'Pomodoro', lesson_mode: 'Volba režimu lekce',
    tahak_section: 'Tahák (sekce)', exercise_answer: 'Cvičení', backup: 'Záloha postupu',
    feature_use: 'Další funkce', mcq: 'Cvičení MCQ', cloze: 'Cvičení cloze', karty: 'Kartičky',
    casomira: 'Časomíra lekce', dalsi_sekce: 'Další sekce', viewer_nav: 'Prohlížeč lekcí',
    oznaceni_hotovo: 'Označení hotovo', filtr_predmetu: 'Filtr předmětu', precteno: 'Přečteno',
    anki_hotovo: 'Anki pauza hotovo', hledani: 'Hledání', simulace_latina: 'Simulace latiny',
    tahak: 'Tahák', rezim: 'Volba režimu lekce', anki: 'Stahování Anki'
  };
  var state = { events: null, views: null, days: 14 };
  var charts = {};
  var model = null;

  function $(id) { return document.getElementById(id); }
  function num(n) { return (n || 0).toLocaleString('cs-CZ'); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function dayKey(iso) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
    } catch (e) { return String(iso).slice(0, 10); }
  }
  function dayLabel(key) {
    var p = String(key).split('-');
    if (p.length < 3) return key;
    return (+p[2]) + '. ' + (+p[1]) + '.';
  }
  function add(map, k, n) { map[k] = (map[k] || 0) + n; }
  function top(map, limit) {
    return Object.keys(map).map(function (k) { return { k: k, n: map[k] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, limit);
  }
  function featLabel(ev) {
    var f = ev.props && ev.props.feature;
    if (f && FEAT[f]) return FEAT[f];
    if (ev.event_name && FEAT[ev.event_name]) return FEAT[ev.event_name];
    return ev.event_name || 'Jiné';
  }

  function setSub(t) { $('sub').textContent = t; }
  function showGate(kind, detail) {
    $('dash').hidden = true;
    $('gate').hidden = false;
    var msg = $('gateMsg'), link = $('gateLink');
    if (kind === 'out') {
      $('gateTitle').textContent = 'Pro analytiku se přihlas';
      msg.textContent = 'Tahle stránka je jen pro správce. Není v menu webu — otevřeš ji přímým odkazem a přihlášením účtem s rolí admin.';
      link.hidden = false;
      link.href = 'prihlaseni.html?next=' + encodeURIComponent('analytika.html');
      link.textContent = 'Přihlásit se';
    } else if (kind === 'role') {
      $('gateTitle').textContent = 'Analytika je jen pro správce';
      msg.textContent = 'Jsi přihlášený, ale tenhle účet nemá roli admin. Souhrny vidí jen správce.';
      link.hidden = false;
      link.href = 'index.html';
      link.textContent = 'Zpět do studovny';
    } else {
      $('gateTitle').textContent = 'Analytiku se nepodařilo načíst';
      msg.textContent = detail || 'Zkus to za chvíli znovu. Když tabulka ještě není nasazená, počkej na migraci.';
      link.hidden = false;
      link.href = 'analytika.html';
      link.textContent = 'Zkusit znovu';
    }
    setSub('Studovna FBMI · anonymní měření');
  }
  function enableRange(on) {
    document.querySelectorAll('.range button').forEach(function (b) { b.disabled = !on; });
  }

  function chart(id, cfg) {
    if (!window.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), cfg);
  }
  function scaleY() { return { beginAtZero: true, grid: { color: GRID }, ticks: { precision: 0 } }; }
  function scaleX() { return { grid: { display: false } }; }

  function windowOf(days) {
    var end = Date.now();
    var start = end - days * 86400000;
    var prev = start - days * 86400000;
    return { start: start, end: end, prev: prev };
  }
  function inRange(iso, a, b) {
    var t = new Date(iso).getTime();
    return t >= a && t < b;
  }

  function aggregate(rows, days) {
    var w = windowOf(days);
    var cur = [], prev = [];
    rows.forEach(function (r) {
      if (inRange(r.occurred_at, w.start, w.end)) cur.push(r);
      else if (inRange(r.occurred_at, w.prev, w.start)) prev.push(r);
    });
    function tally(list) {
      var sessions = {}, views = 0, active = 0, sim = 0, simScore = 0, simN = 0;
      var byDay = {}, devices = {}, refs = {}, pages = {}, feats = {}, searches = {};
      var scrollMax = {};
      list.forEach(function (r) {
        var name = r.event_name;
        var props = r.props || {};
        var day = dayKey(r.occurred_at);
        if (!byDay[day]) byDay[day] = { sessions: {}, views: 0 };
        if (name === 'page_view') {
          views++;
          sessions[r.session_id] = 1;
          byDay[day].views++;
          byDay[day].sessions[r.session_id] = 1;
          var dev = r.device_type || 'unknown';
          devices[dev] = devices[dev] || {};
          devices[dev][r.session_id] = 1;
          var host = r.referrer_host || '(přímý / interní)';
          refs[host] = refs[host] || { views: 0, sessions: {} };
          refs[host].views++;
          refs[host].sessions[r.session_id] = 1;
          var p = pages[r.page_path] || (pages[r.page_path] = {
            path: r.page_path, title: r.page_title || r.page_path, views: 0,
            sessions: {}, active: 0, scrollSum: 0, scrollN: 0, days: {}, actions: {}, devices: {}
          });
          p.views++;
          p.sessions[r.session_id] = 1;
          if (r.page_title) p.title = r.page_title;
          p.days[day] = (p.days[day] || 0) + 1;
          p.devices[r.device_type || 'unknown'] = p.devices[r.device_type || 'unknown'] || {};
          p.devices[r.device_type || 'unknown'][r.session_id] = 1;
        }
        if (name === 'engaged_time') {
          var sec = +props.active_sec;
          if (sec > 0) {
            active += sec;
            if (pages[r.page_path]) pages[r.page_path].active += sec;
          }
        }
        if (name === 'scroll_depth') {
          var d = +props.depth_pct;
          if (d > 0) {
            var sk = r.session_id + '|' + r.page_path;
            if (!scrollMax[sk] || d > scrollMax[sk]) scrollMax[sk] = d;
          }
        }
        if (name === 'sim_test_finish') {
          sim++;
          if (props.score_pct != null && props.score_pct !== '' && !isNaN(+props.score_pct)) {
            simScore += +props.score_pct;
            simN++;
          }
        }
        if (name !== 'page_view' && name !== 'engaged_time' && name !== 'scroll_depth') {
          add(feats, featLabel(r), 1);
          if (pages[r.page_path]) add(pages[r.page_path].actions, featLabel(r), 1);
        }
        if (name === 'search' && props.q && String(props.q).trim().length >= 2) {
          add(searches, String(props.q).trim().toLowerCase(), 1);
        }
      });
      Object.keys(pages).forEach(function (path) {
        var p = pages[path];
        var sum = 0, n = 0;
        Object.keys(scrollMax).forEach(function (sk) {
          if (sk.slice(sk.indexOf('|') + 1) === path) { sum += scrollMax[sk]; n++; }
        });
        p.scroll = n ? Math.round(sum / n) : 0;
        p.activeAvg = p.views ? p.active / p.views : 0;
        p.sessionN = Object.keys(p.sessions).length;
      });
      var buckets = { 'do 25 %': 0, '50 %': 0, '75 %': 0, '100 %': 0 };
      var bN = 0;
      Object.keys(scrollMax).forEach(function (sk) {
        var d = scrollMax[sk];
        bN++;
        if (d <= 25) buckets['do 25 %']++;
        else if (d <= 50) buckets['50 %']++;
        else if (d <= 75) buckets['75 %']++;
        else buckets['100 %']++;
      });
      return {
        sessions: Object.keys(sessions).length,
        views: views,
        activeAvg: views ? active / views : 0,
        sim: sim,
        simScore: simN ? Math.round(simScore / simN) : null,
        byDay: byDay,
        devices: devices,
        refs: refs,
        pages: pages,
        feats: feats,
        searches: searches,
        buckets: buckets,
        bucketN: bN
      };
    }
    var A = tally(cur), B = tally(prev);
    var keys = [];
    for (var i = days - 1; i >= 0; i--) {
      var dt = new Date(Date.now() - i * 86400000);
      keys.push(dayKey(dt.toISOString()));
    }
    var seen = {};
    keys = keys.filter(function (k) { if (seen[k]) return false; seen[k] = 1; return true; });
    return {
      sessions: A.sessions,
      prevSessions: B.sessions,
      views: A.views,
      prevViews: B.views,
      activeAvg: A.activeAvg,
      sim: A.sim,
      simScore: A.simScore,
      days: keys.map(function (k) {
        var d = A.byDay[k] || { sessions: {}, views: 0 };
        return { label: dayLabel(k), sessions: Object.keys(d.sessions).length, views: d.views };
      }),
      devices: DEV_ORDER.filter(function (k) { return A.devices[k]; }).map(function (k) {
        return { label: DEV_LABEL[k] || k, sessions: Object.keys(A.devices[k]).length };
      }),
      refs: Object.keys(A.refs).map(function (k) { return { label: k, views: A.refs[k].views }; })
        .sort(function (a, b) { return b.views - a.views; }).slice(0, 8),
      pages: Object.keys(A.pages).map(function (k) { return A.pages[k]; })
        .sort(function (a, b) { return b.views - a.views; }).slice(0, 12),
      feats: top(A.feats, 8).map(function (x) { return { label: x.k, events: x.n }; }),
      searches: top(A.searches, 12).map(function (x) { return { query: x.k, n: x.n }; }),
      scroll: ['do 25 %', '50 %', '75 %', '100 %'].map(function (k) {
        return { label: k, pct: A.bucketN ? Math.round(100 * A.buckets[k] / A.bucketN) : 0 };
      }),
      hasScroll: A.bucketN > 0,
      source: 'events'
    };
  }

  function modelFromViews(v, days) {
    var daily = (v.daily || []).slice().sort(function (a, b) { return String(a.day).localeCompare(String(b.day)); });
    var cut = dayKey(new Date(Date.now() - days * 86400000).toISOString());
    var prevCut = dayKey(new Date(Date.now() - days * 2 * 86400000).toISOString());
    var cur = daily.filter(function (r) { return String(r.day) >= cut; });
    var prev = daily.filter(function (r) { return String(r.day) >= prevCut && String(r.day) < cut; });
    function sum(list, k) { return list.reduce(function (a, r) { return a + (+r[k] || 0); }, 0); }
    var pages = (v.pages || []).slice().sort(function (a, b) { return (+b.views || 0) - (+a.views || 0); }).slice(0, 12);
    var activeWeighted = 0, w = 0;
    pages.forEach(function (p) {
      if (p.avg_active_sec != null && +p.views) { activeWeighted += (+p.avg_active_sec) * (+p.views); w += +p.views; }
    });
    var sim = 0;
    (v.feats || []).forEach(function (f) { if (f.event_name === 'sim_test_finish') sim += +f.events || 0; });
    var keys = [];
    for (var i = days - 1; i >= 0; i--) keys.push(dayKey(new Date(Date.now() - i * 86400000).toISOString()));
    var seen = {};
    keys = keys.filter(function (k) { if (seen[k]) return false; seen[k] = 1; return true; });
    var byDay = {};
    cur.forEach(function (r) { byDay[String(r.day)] = r; });
    return {
      sessions: sum(cur, 'sessions'),
      prevSessions: sum(prev, 'sessions'),
      views: sum(cur, 'page_views'),
      prevViews: sum(prev, 'page_views'),
      activeAvg: w ? activeWeighted / w : 0,
      sim: sim,
      simScore: null,
      days: keys.map(function (k) {
        var d = byDay[k];
        return { label: dayLabel(k), sessions: d ? +d.sessions || 0 : 0, views: d ? +d.page_views || 0 : 0 };
      }),
      devices: (v.devices || []).map(function (d) {
        return { label: DEV_LABEL[d.device_type] || d.device_type, sessions: +d.sessions || 0 };
      }),
      refs: (v.refs || []).slice(0, 8).map(function (r) { return { label: r.referrer_host, views: +r.views || 0 }; }),
      pages: pages.map(function (p) {
        return {
          path: p.page_path, title: p.page_title || p.page_path, views: +p.views || 0,
          activeAvg: +p.avg_active_sec || 0, scroll: Math.round(+p.avg_scroll_pct || 0),
          sessionN: +p.sessions || 0, days: {}, actions: {}, devices: {}
        };
      }),
      feats: (v.feats || []).slice(0, 8).map(function (f) {
        var label = (f.feature && FEAT[f.feature]) || FEAT[f.event_name] || f.feature || f.event_name || 'Jiné';
        return { label: label, events: +f.events || 0 };
      }),
      searches: (v.searches || []).slice(0, 12).map(function (s) { return { query: s.query, n: +s.searches || 0 }; }),
      scroll: [],
      hasScroll: false,
      source: 'views'
    };
  }

  function delta(cur, prev) {
    if (!prev && !cur) return { text: 'stejně jako předchozí období', down: false };
    if (!prev) return { text: 'bez dat v předchozím období', down: false };
    var pct = Math.round((cur - prev) / prev * 100);
    if (!pct) return { text: 'stejně jako předchozí období', down: false };
    return { text: (pct > 0 ? '↑ ' : '↓ ') + Math.abs(pct) + ' % vs. předchozí období', down: pct < 0 };
  }
  function putDelta(id, d) {
    var el = $(id);
    el.textContent = d.text;
    el.classList.toggle('down', !!d.down);
  }
  function showEmpty(id, on) {
    var el = $(id);
    if (el) el.hidden = !on;
  }
  function showCanvas(id, on) {
    var canvas = $(id);
    if (!canvas) return;
    canvas.parentNode.hidden = !on;
    if (!on && charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function render(days) {
    state.days = days;
    document.querySelectorAll('.range button').forEach(function (b) {
      b.classList.toggle('on', +b.getAttribute('data-days') === days);
    });
    setSub('Studovna FBMI · anonymní měření · posledních ' + days + ' dní');
    model = (state.events ? aggregate(state.events, days) : modelFromViews(state.views, days));
    $('dash').hidden = false;
    $('gate').hidden = true;
    $('kSess').textContent = num(model.sessions);
    $('kViews').textContent = num(model.views);
    $('kTime').textContent = fmtTime(model.activeAvg);
    $('kSim').textContent = num(model.sim);
    putDelta('kSessD', delta(model.sessions, model.prevSessions));
    putDelta('kViewsD', delta(model.views, model.prevViews));
    $('kSimD').textContent = model.simScore == null ? 'bez údaje o skóre' : ('úspěšnost Ø ' + model.simScore + ' %');
    $('kSimD').classList.remove('down');

    var labels = model.days.map(function (d) { return d.label; });
    if (!labels.length) labels = [''];
    chart('cVisits', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Relace', data: model.days.map(function (d) { return d.sessions; }), borderColor: ACC, backgroundColor: 'rgba(31,111,92,.15)', fill: true, tension: 0.35, pointRadius: 3 },
          { label: 'Zobrazení', data: model.days.map(function (d) { return d.views; }), borderColor: ACC2, backgroundColor: 'transparent', tension: 0.35, pointRadius: 2, borderDash: [4, 4] }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: scaleY(), x: scaleX() } }
    });

    showEmpty('eDevices', !model.devices.length);
    showCanvas('cDevices', !!model.devices.length);
    if (model.devices.length) chart('cDevices', {
      type: 'doughnut',
      data: {
        labels: model.devices.length ? model.devices.map(function (d) { return d.label; }) : ['Žádná data'],
        datasets: [{ data: model.devices.length ? model.devices.map(function (d) { return d.sessions; }) : [1], backgroundColor: [ACC, '#3d9b82', ACC2, '#8aa39a'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    var tb = $('tblPages').querySelector('tbody');
    tb.textContent = '';
    if (!model.pages.length) {
      var empty = document.createElement('tr');
      empty.innerHTML = '<td colspan="4">Zatím žádná zobrazení v tomhle období.</td>';
      tb.appendChild(empty);
    }
    model.pages.forEach(function (p, i) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td');
      var b = document.createElement('b');
      b.textContent = p.title || p.path;
      var sp = document.createElement('div');
      sp.className = 'path';
      sp.textContent = p.path;
      td1.appendChild(b);
      td1.appendChild(sp);
      var td2 = document.createElement('td');
      td2.textContent = num(p.views);
      var td3 = document.createElement('td');
      td3.textContent = fmtTime(p.activeAvg);
      var td4 = document.createElement('td');
      var bar = document.createElement('div');
      bar.className = 'bar';
      bar.title = (p.scroll || 0) + ' %';
      var iel = document.createElement('i');
      iel.style.width = Math.max(0, Math.min(100, p.scroll || 0)) + '%';
      bar.appendChild(iel);
      td4.appendChild(bar);
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
      tr.addEventListener('click', function () { showDrill(p, tr); });
      tb.appendChild(tr);
      if (i === 0) showDrill(p, tr);
    });

    showEmpty('eRef', !model.refs.length);
    showCanvas('cRef', !!model.refs.length);
    if (model.refs.length) chart('cRef', {
      type: 'bar',
      data: {
        labels: model.refs.length ? model.refs.map(function (r) { return r.label; }) : ['—'],
        datasets: [{ label: 'Zobrazení', data: model.refs.length ? model.refs.map(function (r) { return r.views; }) : [0], backgroundColor: ACC, borderRadius: 6 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: scaleY(), y: { grid: { display: false } } } }
    });

    showEmpty('eFeat', !model.feats.length);
    showCanvas('cFeat', !!model.feats.length);
    if (model.feats.length) chart('cFeat', {
      type: 'bar',
      data: {
        labels: model.feats.length ? model.feats.map(function (f) { return f.label; }) : ['—'],
        datasets: [{ data: model.feats.length ? model.feats.map(function (f) { return f.events; }) : [0], backgroundColor: model.feats.map(function (_, i) { return i % 2 ? ACC2 : ACC; }), borderRadius: 6 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: scaleY(), y: { grid: { display: false } } } }
    });

    var sb = $('tblSearch').querySelector('tbody');
    sb.textContent = '';
    if (!model.searches.length) {
      var er = document.createElement('tr');
      er.innerHTML = '<td colspan="2">Zatím žádné hledání.</td>';
      sb.appendChild(er);
    }
    model.searches.forEach(function (s) {
      var tr = document.createElement('tr');
      var a = document.createElement('td');
      var c = document.createElement('code');
      c.textContent = s.query;
      a.appendChild(c);
      var btd = document.createElement('td');
      btd.textContent = num(s.n);
      tr.appendChild(a); tr.appendChild(btd);
      sb.appendChild(tr);
    });

    showEmpty('eScroll', !model.hasScroll);
    showCanvas('cScroll', !!model.hasScroll);
    if (model.hasScroll) chart('cScroll', {
      type: 'bar',
      data: {
        labels: model.scroll.map(function (s) { return s.label; }),
        datasets: [{ label: 'Podíl %', data: model.scroll.map(function (s) { return s.pct; }), backgroundColor: ['#a8cfc4', ACC, '#3d9b82', ACC2], borderRadius: 6 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, grid: { color: GRID } }, x: scaleX() } }
    });

    $('srcNote').textContent = model.source === 'events'
      ? 'Čísla jsou za zvolené období.'
      : 'Souhrny jsou za celou dobu měření. Graf návštěv je za zvolené období.';
    if (!model.pages.length) $('drill').classList.remove('show');
  }

  function showDrill(p, tr) {
    document.querySelectorAll('#tblPages tbody tr').forEach(function (r) { r.classList.remove('on'); });
    if (tr) tr.classList.add('on');
    $('drill').classList.add('show');
    $('drillTitle').textContent = p.title || p.path;
    $('drillPath').textContent = p.path;
    var labels = [], data = [];
    if (p.days && Object.keys(p.days).length) {
      model.days.forEach(function (d) {
        labels.push(d.label);
      });
      var keys = [];
      for (var i = state.days - 1; i >= 0; i--) keys.push(dayKey(new Date(Date.now() - i * 86400000).toISOString()));
      var seen = {};
      keys = keys.filter(function (k) { if (seen[k]) return false; seen[k] = 1; return true; });
      labels = keys.map(dayLabel);
      data = keys.map(function (k) { return p.days[k] || 0; });
    } else {
      labels = ['období'];
      data = [p.views || 0];
    }
    chart('cDrill', {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Zobrazení', data: data, borderColor: ACC, backgroundColor: 'rgba(31,111,92,.12)', fill: true, tension: 0.35 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: scaleY(), x: scaleX() } }
    });
    var actions = top(p.actions || {}, 1);
    var devBits = [];
    var devTotal = 0;
    Object.keys(p.devices || {}).forEach(function (k) { devTotal += Object.keys(p.devices[k]).length; });
    Object.keys(p.devices || {}).forEach(function (k) {
      var n = Object.keys(p.devices[k]).length;
      if (!devTotal) return;
      devBits.push((DEV_LABEL[k] || k) + ' ' + Math.round(100 * n / devTotal) + ' %');
    });
    var body = $('drillStats');
    body.textContent = '';
    function row(k, v) {
      var tr = document.createElement('tr');
      var th = document.createElement('td');
      th.textContent = k;
      var td = document.createElement('td');
      var b = document.createElement('b');
      b.textContent = v;
      td.appendChild(b);
      tr.appendChild(th); tr.appendChild(td);
      body.appendChild(tr);
    }
    row('Zobrazení', num(p.views));
    row('Relace', num(p.sessionN || 0));
    row('Prům. aktivní čas', fmtTime(p.activeAvg));
    row('Prům. hloubka scrollu', (p.scroll || 0) + ' %');
    row('Nejčastější akce', actions.length ? actions[0].k : '—');
    row('Zařízení', devBits.length ? devBits.join(' · ') : '—');
  }

  function q(table) {
    return window.sbClient.from(table);
  }
  function fetchEvents(sinceIso) {
    var page = 1000, all = [], i = 0;
    function step() {
      return q('analytics_events')
        .select('occurred_at,event_name,page_path,page_title,session_id,visitor_id,device_type,referrer_host,props')
        .gte('occurred_at', sinceIso)
        .order('occurred_at', { ascending: true })
        .range(i * page, i * page + page - 1)
        .then(function (res) {
          if (res.error) throw res.error;
          var rows = res.data || [];
          all = all.concat(rows);
          i++;
          if (rows.length < page || i >= 20) return all;
          return step();
        });
    }
    return step();
  }
  function loadViews() {
    return Promise.all([
      q('analytics_daily').select('*').order('day', { ascending: true }),
      q('analytics_top_pages').select('*').limit(40),
      q('analytics_feature_usage').select('*').limit(40),
      q('analytics_devices').select('*'),
      q('analytics_referrers').select('*').limit(12),
      q('analytics_searches').select('*').limit(20)
    ]).then(function (all) {
      for (var i = 0; i < all.length; i++) if (all[i].error) throw all[i].error;
      return {
        daily: all[0].data || [],
        pages: all[1].data || [],
        feats: all[2].data || [],
        devices: all[3].data || [],
        refs: all[4].data || [],
        searches: all[5].data || []
      };
    });
  }

  document.querySelectorAll('.range button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.disabled) return;
      render(+b.getAttribute('data-days'));
    });
  });

  function boot() {
    var sb = window.sbClient;
    if (!sb) { showGate('err', 'Klient Supabase se nenačetl.'); return; }
    if (window.Chart) {
      Chart.defaults.font.family = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
      Chart.defaults.color = '#5c6b66';
      if (Chart.defaults.plugins && Chart.defaults.plugins.legend) Chart.defaults.plugins.legend.labels.boxWidth = 12;
    }
    sb.auth.getSession().then(function (r) {
      var ses = r && r.data && r.data.session;
      if (!ses) { showGate('out'); return; }
      return sb.rpc('my_role').then(function (role) {
        var name = role && !role.error ? role.data : '';
        if (name !== 'admin') { showGate('role'); return; }
        enableRange(true);
        setSub('Načítám…');
        var since = new Date(Date.now() - 60 * 86400000).toISOString();
        return Promise.all([
          loadViews().catch(function (e) { return { error: e }; }),
          fetchEvents(since).catch(function (e) { return { error: e }; })
        ]).then(function (pair) {
          var views = pair[0], events = pair[1];
          if (views && views.error && events && events.error) {
            showGate('err', 'Pohledy ani události nešly načíst. Účet musí mít roli admin.');
            return;
          }
          state.views = views && !views.error ? views : { daily: [], pages: [], feats: [], devices: [], refs: [], searches: [] };
          state.events = events && !events.error ? events : null;
          render(14);
        });
      });
    }).catch(function () { showGate('err'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
