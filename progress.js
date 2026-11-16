/* Účet: přezdívka, postup, XP, kamarádi, žebříčky a komentáře k lekcím. */
(function () {
  'use strict';
  if (window.__studovnaProgress) return;
  window.__studovnaProgress = 1;
  var M = window.StudovnaMerge;
  if (!M) return;

  var PAGE = {
    'svaly-hlavy-krku.html': 'svaly-hlavy-krku',
    'svaly-hlavy-krku-lekce.html': 'svaly-hlavy-krku',
    'axialni-system.html': 'axialni-system',
    'latina-lekce-01.html': 'latina-lekce-01',
    'latina-lekce-02.html': 'latina-lekce-02',
    'latina-lekce-03.html': 'latina-lekce-03',
    'latina-lekce-04.html': 'latina-lekce-04',
    'latina-lekce-05.html': 'latina-lekce-05',
    'latina-lekce-06.html': 'latina-lekce-06',
    'simulace-latina.html': 'simulace-latina',
    'biologie-p01.html': 'biologie-p01',
    'biologie-p01-lekce.html': 'biologie-p01'
  };
  var ERR = {
    invalid_code: 'Ten kód nevypadá správně. Zadej ho ve tvaru STUD-XXXX.',
    not_found: 'Takový kód jsem nenašel.',
    self: 'To je tvůj vlastní kód.',
    already_friends: 'Už jste kamarádi.',
    pending: 'Žádost už čeká na potvrzení.',
    they_asked_you: 'Ten člověk už ti žádost poslal. Přijmi ji níž na stránce.',
    too_many: 'Máš moc nevyřízených žádostí. Počkej, až je někdo vyřídí.',
    display_name_taken: 'Tuhle přezdívku už někdo má.',
    invalid_display_name: 'Přezdívka má mít 2–24 znaků a nesmí to být e-mail.',
    forbidden: 'Na tohle nemáš oprávnění.',
    invalid_body: 'Text je prázdný, nebo je moc dlouhý.'
  };
  var state = { dash: null, friendsBoard: [], siteBoard: [], scope: 'friends', period: 'week', staff: false };
  var ready = false, hydrating = false, timer = null, booted = false;
  var queued = {};

  function base() {
    var s = document.querySelector('script[data-base]');
    return (s && s.getAttribute('data-base')) || '';
  }
  function file() {
    var p = (location.pathname || '').split('/').pop();
    return p || 'index.html';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Number(n || 0).toLocaleString('cs-CZ'); }
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString('cs-CZ'); } catch (e) { return ''; }
  }
  function sb() { return window.sbClient; }
  function rpc(name, args) {
    var c = sb();
    if (!c) return Promise.resolve({ data: null, error: { message: 'offline' } });
    return c.rpc(name, args || {});
  }
  function errText(error) {
    var m = ((error && (error.message || error.details || error.hint)) || '') + '';
    var keys = Object.keys(ERR);
    for (var i = 0; i < keys.length; i++) if (m.indexOf(keys[i]) >= 0) return ERR[keys[i]];
    return 'Tohle se nepovedlo. Zkus to znovu.';
  }
  function clearedMap() {
    var o = {};
    M.KEYS.forEach(function (k) {
      try { if (sessionStorage.getItem('sh_cleared_' + k) === '1') o[k] = 1; } catch (e) {}
    });
    return o;
  }
  function markCleared(k) {
    try { sessionStorage.setItem('sh_cleared_' + k, '1'); } catch (e) {}
  }
  function unmarkCleared(k) {
    try { sessionStorage.removeItem('sh_cleared_' + k); } catch (e) {}
  }

  function ensureCss() {
    if (document.querySelector('link[data-progress-css]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = base() + 'progress.css';
    l.setAttribute('data-progress-css', '1');
    document.head.appendChild(l);
  }

  var origSet = localStorage.setItem.bind(localStorage);
  var origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    origSet(k, v);
    if (hydrating || !M.isKey(k)) return;
    if (!ready) { queued[k] = 1; return; }
    schedule(k);
  };
  localStorage.removeItem = function (k) {
    origRemove(k);
    if (!M.isKey(k)) return;
    markCleared(k);
    if (ready) rpc('clear_snapshot', { p_key: k });
  };

  function schedule(k) {
    queued[k] = 1;
    clearTimeout(timer);
    timer = setTimeout(flush, 700);
  }
  function flush() {
    var keys = Object.keys(queued);
    queued = {};
    if (!ready || !sb()) return;
    keys.forEach(function (k) {
      if (!M.isKey(k)) return;
      var raw = localStorage.getItem(k);
      var parsed = M.parse(raw);
      if (parsed == null) return;
      rpc('sync_snapshot', { p_key: k, p_state: parsed }).then(function () { unmarkCleared(k); });
    });
  }

  function writeLocal(k, value) {
    hydrating = true;
    try { origSet(k, JSON.stringify(value)); } catch (e) {}
    hydrating = false;
  }

  function shouldReload() {
    var f = file();
    return f === 'index.html' || f === 'lekce.html' || !!PAGE[f];
  }

  function boot() {
    if (booted) return;
    booted = true;
    ensureCss();
    var c = sb();
    if (!c) { ready = true; render(); return; }
    var authP = window.sbReady || Promise.resolve();
    authP.then(function () {
      var staffP = (window.sbIsStaff && window.sbIsStaff.then) ? window.sbIsStaff : Promise.resolve(false);
      return staffP.then(function (ok) { state.staff = !!ok; return rpc('my_dashboard'); });
    }).then(function (res) {
      if (!res || res.error || !res.data) throw (res && res.error) || new Error('dashboard');
      return reconcile(res.data);
    }).then(function (data) {
      state.dash = data;
      if (window.sbSetNick && data.profile) window.sbSetNick(data.profile.display_name);
      ready = true;
      flush();
      if (state._reload && shouldReload()) {
        try {
          if (sessionStorage.getItem('sh_pr') === '1') sessionStorage.removeItem('sh_pr');
          else { sessionStorage.setItem('sh_pr', '1'); location.reload(); return; }
        } catch (e) {}
      } else {
        try { sessionStorage.removeItem('sh_pr'); } catch (e) {}
      }
      render();
      try { window.dispatchEvent(new Event('studovna-progress')); } catch (e) {}
    }).catch(function () {
      ready = true;
      state.failed = true;
      render();
    });
  }

  function reconcile(data) {
    var snaps = data.snapshots || {};
    var cleared = clearedMap();
    var payload = {};
    var pushes = [];
    var wrote = false;
    M.KEYS.forEach(function (k) {
      var rec = M.reconcile(k, localStorage.getItem(k), snaps[k] == null ? null : snaps[k], !!cleared[k]);
      if (rec.writeLocal && rec.state != null) { writeLocal(k, rec.state); wrote = true; }
      if (!data.profile.imported) {
        if (rec.state != null) payload[k] = rec.state;
      } else if (rec.push && rec.state != null) pushes.push({ k: k, state: rec.state });
    });
    state._reload = wrote;
    if (!data.profile.imported) {
      return rpc('import_browser_progress', { p_snapshots: payload }).then(function () {
        M.KEYS.forEach(unmarkCleared);
        return rpc('my_dashboard').then(function (r) { return (r && r.data) || data; });
      });
    }
    return Promise.all(pushes.map(function (p) {
      return rpc('sync_snapshot', { p_key: p.k, p_state: p.state }).then(function () { unmarkCleared(p.k); });
    })).then(function () { return data; });
  }

  function profile() { return (state.dash && state.dash.profile) || null; }

  function render() {
    renderHome();
    renderProfile();
    renderLesson();
  }

  function renderHome() {
    var p = profile();
    var host = document.getElementById('stats');
    if (!host || !p) return;
    var id = 'sp-home-strip';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('a');
      el.id = id;
      el.className = 'panel sp-strip';
      el.href = base() + 'profil.html';
      host.parentNode.insertBefore(el, host.previousElementSibling && host.previousElementSibling.tagName === 'H2' ? host.previousElementSibling : host);
    }
    el.innerHTML = '<span><b>Úroveň ' + p.level + '</b> · ' + fmt(p.all_time_xp) + ' XP · série ' + p.streak + ' ' + days(p.streak) + '</span><span class="btn sm pri">Profil →</span>';
  }

  function days(n) {
    n = Number(n) || 0;
    if (n === 1) return 'den';
    if (n >= 2 && n <= 4) return 'dny';
    return 'dní';
  }

  function accountHtml() {
    var staff = state.staff
      ? '<a class="btn" href="' + base() + 'spravce.html">Správa</a><a class="btn" href="' + base() + 'moderatori/index.html">Pro moderátory</a>'
      : '';
    return '<h2>Účet</h2><div class="panel"><div class="btns left">' +
      '<a class="btn" href="' + base() + 'prihlaseni.html?zmena=1&next=' + encodeURIComponent(base() + 'profil.html') + '">Změnit heslo</a>' +
      '<button class="btn" type="button" id="sp-out">Odhlásit</button>' + staff +
      '</div><p class="sub" style="margin:10px 0 0">Odhlášení a změna hesla jsou tady, v profilu. E-mail se neukazuje.</p></div>';
  }
  function bindAccount() {
    var b = document.getElementById('sp-out');
    if (!b) return;
    b.onclick = function () {
      try { localStorage.removeItem('sh_pin_ok'); } catch (e) {}
      var c = sb();
      var done = function () { location.href = base() + 'prihlaseni.html?out=1'; };
      if (c && c.auth && c.auth.signOut) c.auth.signOut().then(done, done);
      else done();
    };
  }

  function renderProfile() {
    var root = document.getElementById('profil-app');
    if (!root) return;
    if (state.failed && !profile()) {
      root.innerHTML = '<p class="panel">Postup se teď nepodařilo načíst z účtu. V lekcích zůstává uložený v prohlížeči.</p>' + accountHtml();
      bindAccount();
      return;
    }
    var p = profile();
    if (!p) { root.innerHTML = '<p class="sub">Načítám profil…</p>'; return; }
    var span = Math.max(1, p.next_floor - p.level_floor);
    var into = Math.max(0, p.all_time_xp - p.level_floor);
    var lvlPct = Math.max(0, Math.min(100, Math.round(100 * into / span)));
    var exPct = p.exercises_total ? Math.round(100 * p.exercises_done / p.exercises_total) : 0;
    var initials = String(p.display_name || '').slice(0, 2).toUpperCase();
    var subjects = subjectCards();
    root.innerHTML =
      '<section class="hero"><div class="profile"><div class="avatar" aria-hidden="true">' + esc(initials) + '</div><div class="grow">' +
      '<h1>Ahoj, ' + esc(p.display_name) + '</h1>' +
      '<p style="margin:0;opacity:.93">Úroveň ' + p.level + ' · ' + fmt(p.all_time_xp) + ' XP celkem · tento týden ' + fmt(p.weekly_xp) + ' XP</p>' +
      '<div class="pills"><span class="pill">🔥 Série ' + p.streak + ' ' + days(p.streak) + '</span>' +
      '<span class="pill">📚 ' + p.lessons_completed + ' z ' + p.lessons_total + ' lekcí hotovo</span>' +
      '<span class="pill">✏️ ' + fmt(p.exercises_done) + ' z ' + fmt(p.exercises_total) + ' cvičení</span></div></div></div>' +
      '<div class="bar bar-lg" style="margin-top:16px"><i style="width:' + exPct + '%"></i></div>' +
      '<p style="margin:8px 0 0;opacity:.93;font-size:.9rem">Celkový postup ' + exPct + ' % · do ' + (p.level + 1) + '. úrovně zbývá ' + fmt(p.xp_to_next) + ' XP</p></section>' +
      '<h2>Tvůj postup</h2><div class="grid3">' + subjects +
      '<div class="panel stat"><small>Nejdelší série</small><b>' + p.longest_streak + ' ' + days(p.longest_streak) + '</b><div class="bar"><i style="width:' + lvlPct + '%"></i></div><span class="sub">aktuálně ' + p.streak + ' ' + days(p.streak) + '</span></div></div>' +
      '<h2>Žebříček <small id="sp-cap">tento týden</small></h2><div class="panel" id="sp-board"></div>' +
      '<h2>Přezdívka a soukromí</h2><div class="panel sp-form" id="sp-settings"></div>' + accountHtml();
    renderBoard();
    renderSettings();
    bindAccount();
    ensureDialog();
    var kod = new URLSearchParams(location.search).get('kod');
    if (kod) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      openDialog(kod);
    }
    if (!state._boards) { state._boards = 1; loadBoards(); }
  }

  function subjectCards() {
    var lessons = (state.dash && state.dash.lessons) || [];
    var by = {};
    lessons.forEach(function (l) {
      var b = by[l.subject] || (by[l.subject] = { done: 0, total: 0, n: 0, fin: 0 });
      b.done += Number(l.items_done) || 0;
      b.total += Number(l.items_total) || 0;
      b.n++;
      if (l.status === 'completed') b.fin++;
    });
    return Object.keys(by).map(function (name) {
      var b = by[name];
      var pct = b.total ? Math.round(100 * b.done / b.total) : 0;
      return '<a class="panel stat" href="' + base() + 'lekce.html?s=' + encodeURIComponent(name) + '"><small>' + esc(name) + '</small><b>' + pct + ' %</b><div class="bar"><i style="width:' + pct + '%"></i></div><span class="sub">' + b.fin + ' z ' + b.n + ' lekcí hotovo</span></a>';
    }).join('');
  }

  function loadBoards() {
    var c = sb();
    if (!c) return;
    Promise.all([
      c.from('friend_leaderboard').select('display_name,level,all_time_xp,weekly_xp'),
      c.from('site_leaderboard').select('display_name,level,all_time_xp,weekly_xp')
    ]).then(function (res) {
      state.friendsBoard = (res[0] && res[0].data) || [];
      state.siteBoard = (res[1] && res[1].data) || [];
      renderBoard();
    });
  }

  function rowsFor() {
    var src = state.scope === 'site' ? state.siteBoard : state.friendsBoard;
    var period = state.period;
    return src.slice().sort(function (a, b) {
      var d = period === 'week' ? (b.weekly_xp - a.weekly_xp) : (b.all_time_xp - a.all_time_xp);
      if (d) return d;
      return String(a.display_name).localeCompare(String(b.display_name), 'cs');
    });
  }

  function renderBoard() {
    var box = document.getElementById('sp-board');
    if (!box || !profile()) return;
    var cap = document.getElementById('sp-cap');
    if (cap) cap.textContent = state.period === 'week' ? 'tento týden' : 'celkem';
    var me = profile().display_name;
    var rows = rowsFor();
    var html = '<div class="row" style="margin-bottom:8px;flex-wrap:wrap;gap:8px">' +
      '<div class="chips" role="tablist" aria-label="Žebříček">' +
      chip('scope', 'friends', 'Kamarádi') + chip('scope', 'site', 'Celá studovna') +
      '</div><div class="chips" role="tablist" aria-label="Období">' +
      chip('period', 'week', 'Tento týden') + chip('period', 'all', 'Celkem') +
      '</div><button class="btn pri sm" type="button" id="sp-add">＋ Přidat kamaráda</button></div>';
    if (!rows.length) {
      html += '<p class="sub">Na tomhle žebříčku zatím nikdo není.</p>';
    } else {
      html += '<ul class="lb" id="sp-lb">' + rows.map(function (f, i) {
        var xp = state.period === 'week' ? f.weekly_xp : f.all_time_xp;
        var mine = f.display_name === me;
        var medal = i === 0 ? ' gold' : i === 1 ? ' silver' : i === 2 ? ' bronze' : '';
        var click = state.scope === 'friends' ? '' : ' static';
        return '<li class="' + (mine ? 'me' : '') + click + '" data-name="' + esc(f.display_name) + '">' +
          '<span class="rank' + medal + '">' + (i + 1) + '</span>' +
          '<span class="who"><b>' + esc(f.display_name) + (mine ? ' · to jsi ty' : '') + '</b><small>úroveň ' + f.level + '</small></span>' +
          '<span class="pts"><b>' + fmt(xp) + ' XP</b><small>' + (state.period === 'week' ? 'tento týden' : 'celkem') + '</small></span>' +
          '<div class="lessons-mini"></div></li>';
      }).join('') + '</ul>';
    }
    if (state.scope === 'friends' && rows.length <= 1) {
      html += '<p class="sub">Zatím tu jsi jen ty. Pošli spolužákovi svůj kód.</p>';
    }
    html += renderRequests() + renderFriendList();
    html += '<p class="sub" style="margin:12px 0 0">' + (state.scope === 'friends'
      ? 'U kamarádů klikni na řádek a uvidíš fajfky u lekcí. Na žebříčku je jen přezdívka, úroveň a XP.'
      : 'Žebříček celé studovny vidí jen přihlášení. Je na něm přezdívka, úroveň a XP, nikdy e-mail.') + '</p>';
    box.innerHTML = html;
    box.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () {
        state[b.getAttribute('data-tab')] = b.getAttribute('data-val');
        renderBoard();
      };
    });
    var add = document.getElementById('sp-add');
    if (add) add.onclick = function () { openDialog(''); };
    box.querySelectorAll('[data-accept]').forEach(function (b) {
      b.onclick = function () { respond(b.getAttribute('data-accept'), true); };
    });
    box.querySelectorAll('[data-decline]').forEach(function (b) {
      b.onclick = function () { respond(b.getAttribute('data-decline'), false); };
    });
    box.querySelectorAll('[data-remove]').forEach(function (b) {
      b.onclick = function () { removeFriend(b.getAttribute('data-remove')); };
    });
    var lb = document.getElementById('sp-lb');
    if (lb && state.scope === 'friends') lb.onclick = function (e) {
      var li = e.target.closest('li');
      if (!li) return;
      var open = li.classList.contains('open');
      lb.querySelectorAll('li').forEach(function (x) { x.classList.remove('open'); });
      if (open) return;
      li.classList.add('open');
      var slot = li.querySelector('.lessons-mini');
      slot.innerHTML = '<p class="sub">Načítám fajfky…</p>';
      rpc('friend_lessons', { p_name: li.getAttribute('data-name') }).then(function (r) {
        var list = (r && r.data) || [];
        if (!list.length) { slot.innerHTML = '<p class="sub">Fajfky u lekcí jsou skryté.</p>'; return; }
        slot.innerHTML = '<div class="pips">' + list.map(function (l) {
          var cls = l.status === 'completed' ? 'done' : (l.status === 'in_progress' ? 'mid' : '');
          var extra = l.status === 'completed' ? ' ✓' : (l.status === 'in_progress' ? ' · ' + l.pct + ' %' : '');
          return '<span class="pip ' + cls + '">' + esc(l.title) + extra + '</span>';
        }).join('') + '</div>';
      });
    };
  }

  function chip(tab, val, label) {
    var on = state[tab] === val ? ' on' : '';
    return '<button class="chip' + on + '" type="button" data-tab="' + tab + '" data-val="' + val + '">' + label + '</button>';
  }

  function renderRequests() {
    var list = ((state.dash && state.dash.friends) || []).filter(function (f) { return f.status === 'pending' && f.direction === 'in'; });
    return list.map(function (f) {
      return '<div class="pending"><span class="grow"><b>Žádost</b> · ' + esc(f.display_name) + ' tě chce přidat.</span>' +
        '<button class="btn sm pri" type="button" data-accept="' + esc(f.id) + '">Přijmout</button>' +
        '<button class="btn sm" type="button" data-decline="' + esc(f.id) + '">Odmítnout</button></div>';
    }).join('');
  }

  function renderFriendList() {
    var list = ((state.dash && state.dash.friends) || []).filter(function (f) { return f.status === 'accepted'; });
    if (!list.length) return '';
    return '<h3 style="margin:16px 0 4px">Kamarádi</h3><ul class="sp-friends">' + list.map(function (f) {
      return '<li><span class="grow"><b>' + esc(f.display_name) + '</b></span><button class="btn sm" type="button" data-remove="' + esc(f.id) + '">Odebrat</button></li>';
    }).join('') + '</ul>';
  }

  function refreshDash() {
    return rpc('my_dashboard').then(function (r) {
      if (r && r.data) {
        state.dash = r.data;
        if (window.sbSetNick) window.sbSetNick(r.data.profile.display_name);
      }
      loadBoards();
      renderProfile();
    });
  }
  function respond(id, accept) {
    rpc('respond_friend', { p_id: Number(id), p_accept: accept }).then(refreshDash);
  }
  function removeFriend(id) {
    if (!confirm('Odebrat kamaráda? Fajfky u lekcí si pak neuvidíte.')) return;
    rpc('remove_friend', { p_id: Number(id) }).then(refreshDash);
  }

  function renderSettings() {
    var box = document.getElementById('sp-settings');
    var p = profile();
    if (!box || !p) return;
    box.innerHTML =
      '<label for="sp-name">Přezdívka</label>' +
      '<input id="sp-name" maxlength="24" value="' + esc(p.display_name) + '" autocomplete="nickname">' +
      '<button class="btn pri sm" type="button" id="sp-save-name">Uložit přezdívku</button>' +
      '<p class="sp-msg sub" id="sp-name-msg"></p>' +
      '<label class="chk"><input type="checkbox" id="sp-site"' + (p.show_on_site ? ' checked' : '') + '> Chci být na žebříčku celé studovny</label>' +
      '<label class="chk"><input type="checkbox" id="sp-friends"' + (p.show_on_friends ? ' checked' : '') + '> Chci být na žebříčku kamarádů a ukázat jim fajfky u lekcí</label>' +
      '<p class="sub">E-mail se nikde neukazuje. Když žebříček vypneš, zůstaneš v seznamu kamarádů, ale zmizíš z pořadí.</p>';
    document.getElementById('sp-save-name').onclick = function () {
      var name = document.getElementById('sp-name').value.trim();
      rpc('set_display_name', { p_name: name }).then(function (r) {
        var msg = document.getElementById('sp-name-msg');
        if (r.error) { if (msg) msg.textContent = errText(r.error); return; }
        refreshDash();
      });
    };
    function priv() {
      rpc('set_privacy', {
        p_site: document.getElementById('sp-site').checked,
        p_friends: document.getElementById('sp-friends').checked
      }).then(function (r) { if (!r.error) refreshDash(); });
    }
    document.getElementById('sp-site').onchange = priv;
    document.getElementById('sp-friends').onchange = priv;
  }

  function ensureDialog() {
    if (document.getElementById('sp-overlay')) return;
    var ov = document.createElement('div');
    ov.className = 'sp-overlay';
    ov.id = 'sp-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'sp-dlg-title');
    ov.innerHTML = '<div class="sp-dialog"><h2 id="sp-dlg-title">Přidat kamaráda</h2>' +
      '<p class="sub" style="margin:0">Pošli spolužákovi svůj kód nebo odkaz. Až ho zadá, přijde ti žádost k potvrzení.</p>' +
      '<div class="sp-codebox"><span class="sub">Tvůj kód</span><b id="sp-my-code"></b><button class="btn sm" type="button" id="sp-copy">Kopírovat</button></div>' +
      '<p class="sub" id="sp-link" style="margin:0;word-break:break-all"></p>' +
      '<label for="sp-friend-code" class="sub">Kód od kamaráda</label>' +
      '<input id="sp-friend-code" type="text" placeholder="STUD-····" autocomplete="off" spellcheck="false" maxlength="12">' +
      '<p class="sp-msg" id="sp-friend-msg" role="status"></p>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn" type="button" id="sp-close">Zavřít</button>' +
      '<button class="btn pri" type="button" id="sp-send">Poslat žádost</button></div></div>';
    document.body.appendChild(ov);
    document.getElementById('sp-close').onclick = closeDialog;
    ov.addEventListener('click', function (e) { if (e.target === ov) closeDialog(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDialog(); });
    document.getElementById('sp-copy').onclick = copyCode;
    document.getElementById('sp-send').onclick = sendRequest;
    document.getElementById('sp-friend-code').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendRequest();
    });
  }
  function friendLink(code) {
    var path = location.pathname.replace(/[^/]*$/, '');
    return location.origin + path + 'profil.html?kod=' + encodeURIComponent(code);
  }
  function openDialog(prefill) {
    ensureDialog();
    var p = profile();
    var code = p ? p.friend_code : '';
    document.getElementById('sp-my-code').textContent = code;
    document.getElementById('sp-link').textContent = 'Odkaz: ' + friendLink(code);
    document.getElementById('sp-friend-msg').textContent = '';
    document.getElementById('sp-friend-code').value = prefill || '';
    document.getElementById('sp-overlay').classList.add('show');
    document.getElementById('sp-friend-code').focus();
  }
  function closeDialog() {
    var ov = document.getElementById('sp-overlay');
    if (ov) ov.classList.remove('show');
  }
  function copyCode() {
    var t = (profile() && profile().friend_code) || '';
    var btn = document.getElementById('sp-copy');
    var done = function () { if (btn) btn.textContent = 'Zkopírováno'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(done);
    else done();
  }
  function sendRequest() {
    var code = document.getElementById('sp-friend-code').value;
    var msg = document.getElementById('sp-friend-msg');
    rpc('send_friend_request', { p_code: code }).then(function (r) {
      if (r.error) { msg.textContent = errText(r.error); return; }
      var d = r.data || {};
      if (!d.ok) { msg.textContent = ERR[d.error] || 'Žádost se neposlala.'; return; }
      msg.textContent = 'Žádost pro ' + (d.display_name || 'kamaráda') + ' je odeslaná. Až ji přijme, uvidíte se na žebříčku.';
      refreshDash();
    });
  }

  function renderLesson() {
    var slug = PAGE[file()];
    if (!slug) return;
    ensureCss();
    var main = document.querySelector('main') || document.body;
    var box = document.getElementById('sp-lesson');
    if (!box) {
      box = document.createElement('section');
      box.id = 'sp-lesson';
      box.className = 'sp-lesson';
      var h1 = main.querySelector('h1');
      if (h1) h1.insertAdjacentElement('afterend', box);
      else main.insertBefore(box, main.firstChild);
    }
    var lessons = (state.dash && state.dash.lessons) || [];
    var lesson = null;
    for (var i = 0; i < lessons.length; i++) if (lessons[i].slug === slug) lesson = lessons[i];
    var head = '';
    if (lesson) {
      var done = lesson.status === 'completed';
      var label = done ? 'Hotovo' : (lesson.status === 'in_progress' ? 'Rozpracováno' : 'Ještě ne');
      head = '<div class="panel"><div class="lesson-head"><div><div class="tag">' + esc(lesson.subject) + '</div>' +
        '<h3 style="margin:4px 0">' + esc(lesson.title) + '</h3>' +
        '<p class="sub" style="margin:0">' + lesson.items_done + ' z ' + lesson.items_total + ' cvičení · ' + lesson.pct + ' %</p></div>' +
        '<div class="sp-check' + (done ? ' done' : '') + '" title="' + esc(label) + '"><span class="mark">✓</span><span>' + label + '</span></div></div>' +
        '<div class="bar bar-lg"><i style="width:' + lesson.pct + '%"></i></div></div>';
    }
    box.innerHTML = head + '<div id="sp-comments"></div>';
    loadComments(slug);
  }

  function loadComments(slug) {
    var c = sb();
    var host = document.getElementById('sp-comments');
    if (!c || !host) return;
    c.from('lesson_comments_feed').select('id,lesson_slug,body,pinned,created_at,updated_at,author_label').eq('lesson_slug', slug)
      .then(function (r) {
        var list = ((r && r.data) || []).slice().sort(function (a, b) {
          if (!!b.pinned - !!a.pinned) return !!b.pinned - !!a.pinned;
          return String(a.created_at).localeCompare(String(b.created_at));
        });
        paintComments(slug, list);
      });
  }

  function paintComments(slug, list) {
    var host = document.getElementById('sp-comments');
    if (!host) return;
    var html = list.map(function (c) {
      var cls = c.pinned ? 'panel sp-tip' : 'panel sp-comment';
      var badge = c.pinned ? '<span class="sp-badge">Připnutý tip</span>' : '<span class="sp-badge note">Komentář</span>';
      return '<article class="' + cls + '"><div class="sp-who">' + badge + '<b>' + esc(c.author_label || 'Moderátor') + '</b><span class="sub">· ' + esc(fmtDate(c.created_at)) + (c.pinned ? '' : '') + '</span></div>' +
        '<p style="margin:0;white-space:pre-wrap">' + esc(c.body) + '</p>' +
        (state.staff ? '<p class="sub" style="margin:8px 0 0"><button class="btn sm" type="button" data-edit="' + c.id + '">Upravit</button> <button class="btn sm" type="button" data-del="' + c.id + '">Smazat</button></p>' : '') +
        '</article>';
    }).join('');
    html += '<p class="sub">Psát takové poznámky můžou jen moderátoři a správce. Ostatní je vidí po přihlášení.</p>';
    if (state.staff) {
      html += '<form class="panel sp-form" id="sp-cform"><h3 id="sp-cform-title">Nová poznámka</h3>' +
        '<textarea id="sp-cbody" maxlength="4000" required></textarea>' +
        '<label class="chk"><input type="checkbox" id="sp-cpin"> Připnout nahoru</label>' +
        '<input type="hidden" id="sp-cid" value="">' +
        '<button class="btn pri" type="submit">Uložit poznámku</button> <button class="btn" type="button" id="sp-creset">Nová</button>' +
        '<p class="sp-msg sub" id="sp-cmsg"></p></form>';
    }
    host.innerHTML = html;
    host.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('Smazat poznámku?')) return;
        rpc('delete_lesson_comment', { p_id: Number(b.getAttribute('data-del')) }).then(function () { loadComments(slug); });
      };
    });
    host.querySelectorAll('[data-edit]').forEach(function (b) {
      b.onclick = function () {
        var id = Number(b.getAttribute('data-edit'));
        var c = null;
        for (var i = 0; i < list.length; i++) if (Number(list[i].id) === id) c = list[i];
        if (!c) return;
        document.getElementById('sp-cid').value = String(c.id);
        document.getElementById('sp-cbody').value = c.body;
        document.getElementById('sp-cpin').checked = !!c.pinned;
        document.getElementById('sp-cform-title').textContent = 'Upravit poznámku';
      };
    });
    var form = document.getElementById('sp-cform');
    if (form) form.onsubmit = function (e) {
      e.preventDefault();
      var idRaw = document.getElementById('sp-cid').value;
      rpc('save_lesson_comment', {
        p_id: idRaw ? Number(idRaw) : null,
        p_lesson: slug,
        p_body: document.getElementById('sp-cbody').value,
        p_pinned: document.getElementById('sp-cpin').checked
      }).then(function (r) {
        var msg = document.getElementById('sp-cmsg');
        if (r.error) { if (msg) msg.textContent = errText(r.error); return; }
        loadComments(slug);
      });
    };
    var reset = document.getElementById('sp-creset');
    if (reset) reset.onclick = function () { loadComments(slug); };
  }

  window.StudovnaProgress = {
    item: function (storageKey, itemKey, score, max) {
      if (!M.isKey(storageKey)) return;
      rpc('record_study_item', {
        p_storage_key: storageKey,
        p_item_key: itemKey,
        p_score: score == null ? null : Number(score),
        p_max: max == null ? null : Number(max)
      });
    },
    quiz: function (kind, lesson, variant, score, max) {
      rpc('record_quiz', {
        p_kind: kind,
        p_lesson: lesson,
        p_variant: variant || null,
        p_score: Number(score),
        p_max: Number(max)
      });
    },
    cleared: function (key) { markCleared(key); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
