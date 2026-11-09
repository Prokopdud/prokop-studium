/*! Studovna – anonymní analytika. Stejný publishable klíč jako auth.js, nikdy service_role. */
(function () {
  'use strict';
  if (window.__studovnaTrack) return;
  window.__studovnaTrack = 1;

  var s = document.currentScript;
  var auth = document.querySelector('script[data-url][data-key]');
  var SB_URL = (s && s.getAttribute('data-url')) || (auth && auth.getAttribute('data-url')) || 'https://keguwppdetlgfzozngvk.supabase.co';
  var KEY = (s && s.getAttribute('data-key')) || (auth && auth.getAttribute('data-key')) || 'sb_publishable_vde1q6kr64k81rFKdOVTTw_qFQ07n6V';
  var END = String(SB_URL || '').replace(/\/$/, '') + '/rest/v1/analytics_events';
  var CONSENT_K = 'sh_consent_ga';
  var SID_K = 'sh_sid';
  var VID_K = 'sh_vid';
  var BATCH_MS = 4000;
  var MAX = 20;
  var queue = [];
  var timer = null;
  var activeMs = 0;
  var lastTick = Date.now();
  var maxScroll = 0;
  var sentDepth = {};
  var sawPage = false;
  var lastSearch = '';
  var finishAt = 0;

  function dnt() {
    try {
      var v = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
      if (v === '1' || v === 'yes') return true;
    } catch (e) {}
    return false;
  }
  function consentYes() {
    try { return localStorage.getItem(CONSENT_K) === 'yes'; } catch (e) { return false; }
  }
  function blocked() {
    if (dnt() || !consentYes()) return true;
    if (!SB_URL || !KEY || KEY === 'SUPABASE_ANON_KEY') return true;
    return false;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = [];
    for (var i = 0; i < 16; i++) h.push(('0' + b[i].toString(16)).slice(-2));
    return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' + h.slice(10, 16).join('');
  }
  function getId(k, persist) {
    try {
      var v = sessionStorage.getItem(k) || (persist ? localStorage.getItem(k) : null);
      if (v) return v;
      v = uuid();
      sessionStorage.setItem(k, v);
      if (persist) localStorage.setItem(k, v);
      return v;
    } catch (e) { return uuid(); }
  }
  function device() {
    var ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return 'tablet';
    if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
    return 'desktop';
  }
  function pagePath() {
    var p = (location.pathname || '/').replace(/\/index\.html$/, '/') || '/';
    var q = '';
    try {
      var u = new URLSearchParams(location.search || '');
      ['access_token', 'refresh_token', 'token', 'code', 'email', 'provider_token'].forEach(function (k) { u.delete(k); });
      var s2 = u.toString();
      if (s2) q = '?' + s2;
    } catch (e) {}
    return (p + q).slice(0, 512);
  }
  function refHost() {
    try {
      if (!document.referrer) return '';
      var u = new URL(document.referrer);
      if (u.hostname === location.hostname) return '';
      return u.hostname.slice(0, 200);
    } catch (e) { return ''; }
  }
  function navType() {
    try {
      var n = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (n && n.type) return String(n.type).slice(0, 32);
    } catch (e) {}
    return 'navigate';
  }
  function clip(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
  function safePath(h) {
    if (!h || /^(blob:|data:|javascript:)/i.test(h)) return '';
    try {
      var u = new URL(h, location.href);
      return (u.pathname + u.search).slice(0, 200);
    } catch (e) { return clip(h, 200); }
  }
  function propsOk(props) {
    try { if (JSON.stringify(props).length > 1800) return { truncated: 1 }; } catch (e) { return {}; }
    return props;
  }
  function send(body) {
    var headers = {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      Prefer: 'return=minimal'
    };
    // sendBeacon neumí hlavičku Prefer. Bez return=minimal PostgREST vrací řádek
    // a anon INSERT skončí 42501. fetch keepalive hlavičky umí a přežije pagehide.
    return fetch(END, {
      method: 'POST',
      headers: headers,
      body: body,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit'
    });
  }
  function flush() {
    if (!queue.length) return;
    if (blocked()) { queue = []; return; }
    var rows = queue.splice(0, queue.length);
    var body;
    try { body = JSON.stringify(rows); } catch (e) { return; }
    try {
      send(body).then(function (res) {
        if (res && res.status >= 500) {
          queue = rows.concat(queue).slice(0, 100);
          schedule();
        }
      }).catch(function () {
        queue = rows.concat(queue).slice(0, 100);
        schedule();
      });
    } catch (e) {}
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; flush(); }, BATCH_MS);
  }
  function track(name, props) {
    if (blocked()) return false;
    if (typeof name !== 'string' || !name || name.length > 64) return false;
    var row = {
      session_id: getId(SID_K, false),
      visitor_id: getId(VID_K, true),
      event_name: name,
      page_path: pagePath() || '/',
      page_title: clip(document.title, 200),
      referrer_host: refHost(),
      device_type: device(),
      props: propsOk(props && typeof props === 'object' ? props : {}),
      occurred_at: new Date().toISOString()
    };
    queue.push(row);
    if (queue.length >= MAX) flush();
    else schedule();
    return true;
  }
  window.studovnaTrack = track;

  function tickActive() {
    var now = Date.now();
    if (!blocked() && !document.hidden) activeMs += Math.min(now - lastTick, 30000);
    lastTick = now;
  }
  function scrollDepth() {
    var h = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    var pct = Math.min(100, Math.round((window.scrollY / h) * 100));
    if (pct > maxScroll) maxScroll = pct;
    [25, 50, 75, 100].forEach(function (t) {
      if (maxScroll >= t && !sentDepth[t] && track('scroll_depth', { depth_pct: t })) sentDepth[t] = 1;
    });
  }
  function engaged() {
    tickActive();
    var sec = Math.round(activeMs / 1000);
    activeMs = 0;
    if (sec < 1) return;
    if (sec > 14400) sec = 14400;
    track('engaged_time', { active_sec: sec, scroll_max: maxScroll });
  }
  function ensurePage() {
    if (sawPage || blocked()) return;
    sawPage = true;
    activeMs = 0;
    lastTick = Date.now();
    track('page_view', { nav: navType() });
    scrollDepth();
  }
  function noteSimFinish(btn) {
    var now = Date.now();
    if (now - finishAt < 800) return;
    var res = document.getElementById('res');
    if (!res || res.hidden) return;
    finishAt = now;
    var text = res.textContent || '';
    var props = { feature: 'simulace_latina', btn: btn || '' };
    var m = /Výsledek:\s*(\d+)\s*\/\s*(\d+)\s*\((\d+)\s*%\)/.exec(text);
    if (m) {
      props.correct = +m[1];
      props.total = +m[2];
      props.score_pct = +m[3];
    }
    props.timeout = /Čas vypršel/.test(text) ? 1 : 0;
    track('sim_test_finish', props);
  }
  function variant() {
    var sel = document.getElementById('var');
    return sel ? clip(sel.value, 16) : '';
  }
  function onClick(e) {
    ensurePage();
    var t = e.target;
    if (!t || !t.closest) return;
    var el;
    if ((el = t.closest('a[href*=".apkg"]'))) {
      track('anki_download', { href: safePath(el.getAttribute('href')), feature: 'anki' });
      return;
    }
    if ((el = t.closest('#pgo, #preset'))) {
      var action = el.id === 'preset' ? 'reset' : (/⏸|Pauza/.test(el.textContent || '') ? 'pause' : 'start');
      track('pomodoro', { action: action, feature: 'pomodoro' });
      return;
    }
    if ((el = t.closest('#pmodes [data-m]'))) {
      track('pomodoro', { action: 'mode', mode: clip(el.getAttribute('data-m'), 8), feature: 'pomodoro' });
      return;
    }
    if ((el = t.closest('a.vopt'))) {
      track('lesson_mode', { label: clip(el.textContent, 80), href: safePath(el.getAttribute('href')), feature: 'rezim' });
      return;
    }
    if ((el = t.closest('#done, #done2'))) {
      var btn = el.id;
      setTimeout(function () { noteSimFinish(btn); }, 0);
      return;
    }
    if ((el = t.closest('#start, #retry, #again'))) {
      track('sim_test_start', { btn: el.id, variant: variant(), feature: 'simulace_latina' });
      return;
    }
    if ((el = t.closest('details.sec > summary'))) {
      var det = el.parentElement;
      track('tahak_section', {
        feature: 'tahak',
        section: det && det.id ? clip(det.id, 80) : '',
        open: det && det.open ? 0 : 1
      });
      return;
    }
    if ((el = t.closest('#exp, #imp'))) {
      track('backup', { action: el.id === 'exp' ? 'export' : 'import', feature: 'backup' });
      return;
    }
    if ((el = t.closest('button.opt'))) {
      var opt = el;
      setTimeout(function () {
        var props = { feature: 'mcq', kind: 'mcq' };
        if (opt.classList.contains('ok')) props.ok = 1;
        else if (opt.classList.contains('no')) props.ok = 0;
        track('exercise_answer', props);
      }, 0);
      return;
    }
    if ((el = t.closest('.q.cl button'))) {
      var box = el.parentNode;
      setTimeout(function () {
        var fb = box && box.querySelector && box.querySelector('.fb');
        var props = { feature: 'cloze', kind: 'cloze' };
        if (fb && fb.classList.contains('ok')) props.ok = 1;
        else if (fb && fb.classList.contains('no')) props.ok = 0;
        track('exercise_answer', props);
      }, 0);
      return;
    }
    if ((el = t.closest('button.okb, button.nob'))) {
      track('exercise_answer', { feature: 'karty', kind: 'flash', ok: el.classList.contains('okb') ? 1 : 0 });
      return;
    }
    if ((el = t.closest('button.go'))) {
      track('feature_use', { feature: 'precteno' });
      return;
    }
    if ((el = t.closest('#tplay'))) {
      track('feature_use', { feature: 'casomira', action: /⏸|Pauza/.test(el.textContent || '') ? 'pause' : 'start' });
      return;
    }
    if (t.closest('#nextb')) {
      track('feature_use', { feature: 'dalsi_sekce' });
      return;
    }
    if ((el = t.closest('#vbar #prev, #vbar #next'))) {
      track('feature_use', { feature: 'viewer_nav', dir: el.id === 'next' ? 'next' : 'prev' });
      return;
    }
    if (t.closest('[data-done]')) {
      track('feature_use', { feature: 'oznaceni_hotovo' });
      return;
    }
    if ((el = t.closest('#chips [data-s]'))) {
      track('feature_use', { feature: 'filtr_predmetu', subject: clip(el.getAttribute('data-s'), 40) });
    }
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('click', function () { setTimeout(ensurePage, 0); });
  document.addEventListener('change', function (e) {
    ensurePage();
    var t = e.target;
    if (!t) return;
    if (t.getAttribute && t.getAttribute('data-anki') != null) {
      track('feature_use', { feature: 'anki_hotovo', on: t.checked ? 1 : 0 });
    }
    if (t.id === 'impf') track('backup', { action: 'import_file', feature: 'backup' });
  }, true);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { engaged(); flush(); }
    else lastTick = Date.now();
  });
  window.addEventListener('pagehide', function () { engaged(); flush(); });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { sawPage = false; sentDepth = {}; ensurePage(); }
  });
  window.addEventListener('scroll', function () { scrollDepth(); }, { passive: true });
  setInterval(tickActive, 5000);
  window.addEventListener('storage', function (e) {
    if (!e || e.key === CONSENT_K) ensurePage();
  });

  var q = document.getElementById('q');
  if (q && q.type !== 'password') {
    var tq = null;
    q.addEventListener('input', function () {
      clearTimeout(tq);
      var v = q.value;
      tq = setTimeout(function () {
        var text = clip(v, 80);
        if (text.length < 2 || text === lastSearch) return;
        lastSearch = text;
        track('search', { q: text, feature: 'hledani' });
      }, 600);
    });
  }
  var resEl = document.getElementById('res');
  if (resEl && window.MutationObserver) {
    new MutationObserver(function () { noteSimFinish('auto'); }).observe(resEl, { attributes: true, childList: true, subtree: true });
  }
  ensurePage();
})();
