import { createRequire } from 'module';
import { mkdir } from 'fs/promises';
const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/pw/node_modules/puppeteer-core');

const OUT = '/opt/cursor/artifacts';
const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:8765';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

const lessons = [
  { slug: 'svaly-hlavy-krku', title: 'Svaly hlavy a krku', subject: 'Anatomie', status: 'in_progress', pct: 62, items_done: 33, items_total: 53, completed_manually: false, sort: 1 },
  { slug: 'axialni-system', title: 'Axiální systém', subject: 'Anatomie', status: 'not_started', pct: 0, items_done: 0, items_total: 58, completed_manually: false, sort: 2 },
  { slug: 'latina-lekce-01', title: 'Latina 1', subject: 'Latina', status: 'completed', pct: 100, items_done: 37, items_total: 37, completed_manually: false, sort: 3 },
  { slug: 'latina-lekce-02', title: 'Latina 2', subject: 'Latina', status: 'completed', pct: 100, items_done: 48, items_total: 48, completed_manually: false, sort: 4 },
  { slug: 'latina-lekce-03', title: 'Latina 3', subject: 'Latina', status: 'completed', pct: 67, items_done: 36, items_total: 54, completed_manually: true, sort: 5 },
  { slug: 'latina-lekce-04', title: 'Latina 4', subject: 'Latina', status: 'not_started', pct: 0, items_done: 0, items_total: 50, completed_manually: false, sort: 6 },
  { slug: 'latina-lekce-05', title: 'Latina 5', subject: 'Latina', status: 'not_started', pct: 0, items_done: 0, items_total: 54, completed_manually: false, sort: 7 },
  { slug: 'latina-lekce-06', title: 'Latina 6', subject: 'Latina', status: 'not_started', pct: 0, items_done: 0, items_total: 51, completed_manually: false, sort: 8 }
];

const friendPips = lessons.map(function (l) {
  if (l.slug === 'latina-lekce-01' || l.slug === 'latina-lekce-02' || l.slug === 'svaly-hlavy-krku') {
    return Object.assign({}, l, { status: 'completed', pct: 100, items_done: l.items_total, completed_manually: false });
  }
  if (l.slug === 'latina-lekce-03') return Object.assign({}, l, { status: 'in_progress', pct: 40, items_done: 20, completed_manually: false });
  return Object.assign({}, l, { status: 'not_started', pct: 0, items_done: 0, completed_manually: false });
});

function installMock() {
  var profile = {
    display_name: 'Student-4821',
    friend_code: 'STUD-K7M2',
    show_on_site: true,
    show_on_friends: true,
    level: 6,
    all_time_xp: 1840,
    weekly_xp: 310,
    level_floor: 1500,
    next_floor: 2100,
    xp_to_next: 260,
    streak: 7,
    longest_streak: 7,
    imported: true,
    exercises_done: 154,
    exercises_total: 405,
    lessons_completed: 3,
    lessons_total: 8
  };
  var friends = [
    { id: 1, status: 'accepted', direction: 'in', display_name: 'Kamarád A' },
    { id: 2, status: 'accepted', direction: 'out', display_name: 'Kamarád B' },
    { id: 3, status: 'accepted', direction: 'in', display_name: 'Kamarád C' },
    { id: 4, status: 'pending', direction: 'in', display_name: 'Kamarád D' }
  ];
  var comments = [
    { id: 1, lesson_slug: 'svaly-hlavy-krku', pinned: true, author_label: 'Moderátor', created_at: '2026-11-08T10:00:00Z', updated_at: '2026-11-08T10:00:00Z', body: 'U žvýkacích svalů si pohlídej začátek a úpon m. masseter a m. temporalis. Na zkoušce se na to ptají často.' },
    { id: 2, lesson_slug: 'svaly-hlavy-krku', pinned: false, author_label: 'Moderátor', created_at: '2026-11-08T12:00:00Z', updated_at: '2026-11-08T12:00:00Z', body: 'Kapitola 03 je delší, klidně si ji rozděl na dva dny. Až budeš mít hotovo, označ si Anki pauzu.' }
  ];
  function boardFriends() {
    var rows = [
      { display_name: 'Kamarád A', level: 7, all_time_xp: 2210, weekly_xp: 420 },
      { display_name: profile.display_name, level: profile.level, all_time_xp: profile.all_time_xp, weekly_xp: profile.weekly_xp },
      { display_name: 'Kamarád B', level: 4, all_time_xp: 980, weekly_xp: 180 },
      { display_name: 'Kamarád C', level: 6, all_time_xp: 1540, weekly_xp: 95 }
    ];
    if (!profile.show_on_friends) rows = rows.filter(function (r) { return r.display_name === profile.display_name; });
    return rows;
  }
  function boardSite() {
    var rows = boardFriends().concat([
      { display_name: 'Student-7701', level: 8, all_time_xp: 3200, weekly_xp: 500 },
      { display_name: 'Student-1094', level: 2, all_time_xp: 180, weekly_xp: 40 }
    ]);
    if (!profile.show_on_site) rows = rows.filter(function (r) { return r.display_name !== profile.display_name; });
    return rows;
  }
  function dash() {
    return { profile: Object.assign({}, profile), lessons: window.__LESSONS || [], friends: friends.slice(), snapshots: {} };
  }
  window.__sbMock = {
    auth: {
      getSession: function () {
        if (/(?:\?|&)nav=out(?:&|$)/.test(location.search)) return Promise.resolve({ data: { session: null } });
        return Promise.resolve({ data: { session: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.com' } } } });
      },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      signOut: function () { return Promise.resolve(); }
    },
    rpc: function (name, args) {
      args = args || {};
      var data = null;
      if (name === 'my_role') data = /(?:\?|&)nav=out(?:&|$)/.test(location.search) ? 'user' : (/lekce\.html$/.test(location.pathname) || /svaly-hlavy-krku|profil\.html/.test(location.pathname) ? 'moderator' : 'user');
      else if (name === 'my_dashboard') data = dash();
      else if (name === 'send_friend_request') {
        var code = String(args.p_code || '').toUpperCase().replace(/\s/g, '');
        if (code === 'STUD-ZZZZ' || code === 'ZZZZ') data = { ok: false, error: 'not_found' };
        else if (code.indexOf('K7M2') >= 0) data = { ok: false, error: 'self' };
        else data = { ok: true, display_name: 'Kamarád E' };
      } else if (name === 'respond_friend') {
        friends = friends.filter(function (f) { return String(f.id) !== String(args.p_id); });
        if (args.p_accept) friends.push({ id: args.p_id, status: 'accepted', direction: 'in', display_name: 'Kamarád D' });
        data = { ok: true };
      } else if (name === 'remove_friend') {
        friends = friends.filter(function (f) { return String(f.id) !== String(args.p_id); });
        data = { ok: true };
      } else if (name === 'set_display_name') {
        profile.display_name = args.p_name;
        data = Object.assign({}, profile);
      } else if (name === 'set_privacy') {
        profile.show_on_site = !!args.p_site;
        profile.show_on_friends = !!args.p_friends;
        data = Object.assign({}, profile);
      } else if (name === 'friend_lessons') {
        data = args.p_name === 'Kamarád A' ? window.__FRIEND_PIPS : [];
      } else if (name === 'save_lesson_comment') {
        data = { ok: true, id: 9, body: args.p_body, pinned: !!args.p_pinned, author_label: 'Moderátor', created_at: new Date().toISOString() };
      } else if (name === 'delete_lesson_comment') data = { ok: true };
      else if (name === 'import_browser_progress') data = { ok: true, already: true };
      else if (name === 'sync_snapshot' || name === 'clear_snapshot' || name === 'record_study_item' || name === 'record_quiz' || name === 'ensure_profile') data = { ok: true, awarded: 0, mode: 'same' };
      else data = { ok: true };
      return Promise.resolve({ data: data, error: null });
    },
    from: function (table) {
      var filters = [];
      var b = {
        select: function () { return b; },
        eq: function (col, val) { filters.push([col, val]); return b; },
        then: function (resolve, reject) {
          var rows = [];
          if (table === 'friend_leaderboard') rows = boardFriends();
          else if (table === 'site_leaderboard') rows = boardSite();
          else if (table === 'lesson_comments_feed') {
            rows = comments.filter(function (c) {
              return filters.every(function (f) { return c[f[0]] === f[1]; });
            });
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
      };
      return b;
    }
  };
}

async function shot(page, name, opts) {
  const file = OUT + '/' + name + '.png';
  await page.screenshot(Object.assign({ path: file }, opts || {}));
  console.log('saved', file);
}

async function prepare(page, path) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(function () {
    return document.documentElement.classList.contains('gated') === false;
  }, { timeout: 10000 });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
});

await mkdir(OUT, { recursive: true });

async function withPage(viewport, fn) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(function () {
    try { localStorage.setItem('sh_consent_ga', 'no'); } catch (e) {}
  });
  await page.evaluateOnNewDocument(installMock);
  await page.evaluateOnNewDocument(function (lessons, pips) {
    window.__LESSONS = lessons;
    window.__FRIEND_PIPS = pips;
  }, lessons, friendPips);
  await page.setRequestInterception(true);
  page.on('request', function (req) {
    var url = req.url();
    if (url.indexOf('/supabase.js') >= 0) {
      req.respond({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.supabase={createClient:function(){return window.__sbMock}};'
      });
      return;
    }
    req.continue();
  });
  page.on('pageerror', function (err) { console.log('PAGEERROR', err.message); });
  page.on('console', function (msg) { if (msg.type() === 'error') console.log('CONSOLE', msg.text()); });
  try { await fn(page); }
  finally { await page.close(); }
}

const desktop = { width: 1280, height: 900, deviceScaleFactor: 1 };
const mobile = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function profileFlow(page, tag) {
  await prepare(page, '/profil.html');
  await page.waitForFunction(function () { return document.body.innerText.indexOf('Student-4821') >= 0 && document.body.innerText.indexOf('Kamarád A') >= 0; });
  var text = await page.evaluate(function () { return document.body.innerText; });
  if (text.indexOf('student@example.com') >= 0) throw new Error('email leaked into the page');
  if (text.indexOf('1\u00a0840') < 0 && text.indexOf('1840') < 0 && text.indexOf('1 840') < 0) throw new Error('XP missing: ' + text.slice(0, 400));
  await shot(page, 'profil-' + tag, { fullPage: true });
  await page.click('button[data-val="site"]');
  await page.waitForFunction(function () { return document.body.innerText.indexOf('Student-7701') >= 0; });
  var board = await page.$('#sp-board');
  await board.screenshot({ path: OUT + '/zebricek-studovna-' + tag + '.png' });
  console.log('saved site board', tag);
  await page.click('button[data-val="friends"]');
  await page.click('button[data-val="all"]');
  await page.waitForFunction(function () {
    var rows = Array.prototype.map.call(document.querySelectorAll('#sp-lb .who b'), function (n) { return n.textContent; });
    return rows.length && rows[0].indexOf('Kamarád A') === 0;
  });
  board = await page.$('#sp-board');
  await board.screenshot({ path: OUT + '/zebricek-kamaradi-' + tag + '.png' });
  await page.click('li[data-name="Kamarád A"]');
  await page.waitForFunction(function () { return document.body.innerText.indexOf('Latina 1') >= 0 && document.body.innerText.indexOf('✓') >= 0; });
  await page.evaluate(function () { document.getElementById('sp-add').click(); });
  await page.waitForSelector('#sp-overlay.show');
  await shot(page, 'kamarad-dialog-' + tag);
  await page.evaluate(function () {
    document.getElementById('sp-friend-code').value = 'STUD-ABCD';
    document.getElementById('sp-send').click();
  });
  await page.waitForFunction(function () { return document.body.innerText.indexOf('Kamarád E') >= 0; });
  await page.evaluate(function () { document.getElementById('sp-close').click(); });
  await page.waitForSelector('button[data-accept="4"]', { timeout: 8000 });
  await page.click('button[data-accept="4"]');
  await page.waitForFunction(function () {
    return Array.prototype.some.call(document.querySelectorAll('.sp-friends b'), function (n) { return n.textContent === 'Kamarád D'; });
  });
}

async function lessonFlow(page, tag) {
  await prepare(page, '/svaly-hlavy-krku-lekce.html');
  await page.waitForFunction(function () {
    return document.body.innerText.indexOf('Rozpracováno') >= 0 && document.body.innerText.indexOf('masseter') >= 0;
  }, { timeout: 20000 });
  var text = await page.evaluate(function () { return document.body.innerText; });
  if (text.indexOf('student@example.com') >= 0) throw new Error('email on lesson page');
  if (text.indexOf('Uložit poznámku') < 0) throw new Error('moderator form missing');
  var el = await page.$('#sp-lesson');
  await el.screenshot({ path: OUT + '/lekce-postup-' + tag + '.png' });
  console.log('saved lesson', tag);
  await shot(page, 'lekce-stranka-' + tag);
}

async function navFlow(page, path, tag, mobile) {
  await prepare(page, path);
  await page.waitForSelector('#account');
  if (mobile) {
    await page.click('#burger');
    await page.waitForSelector('#menu.open');
  }
  var h = mobile ? 720 : 150;
  await page.screenshot({ path: OUT + '/nav-' + tag + '.png', clip: { x: 0, y: 0, width: page.viewport().width, height: h } });
  console.log('saved nav', tag);
  var info = await page.evaluate(function () {
    var links = Array.prototype.map.call(document.querySelectorAll('#menu a, #account'), function (a) { return a.textContent.replace(/\s+/g, ' ').trim(); });
    return { text: document.body.innerText, links: links, accounts: document.querySelectorAll('#account').length };
  });
  if (info.accounts !== 1) throw new Error('expected one account entry, got ' + info.accounts + ' ' + info.links.join(' | '));
  if (info.text.indexOf('student@example.com') >= 0) throw new Error('email visible in nav');
  if (info.links.filter(function (t) { return t === 'Účet' || t.indexOf('Účet') >= 0; }).length) throw new Error('Účet still in nav: ' + info.links.join(' | '));
}

await withPage(desktop, async function (page) { await navFlow(page, '/o-webu.html?nav=out', 'odhlaseno-desktop', false); });
await withPage(mobile, async function (page) { await navFlow(page, '/o-webu.html?nav=out', 'odhlaseno-mobil', true); });
await withPage(desktop, async function (page) { await navFlow(page, '/index.html', 'prihlaseno-desktop', false); });
await withPage(mobile, async function (page) { await navFlow(page, '/index.html', 'prihlaseno-mobil', true); });
await withPage(desktop, async function (page) { await profileFlow(page, 'desktop'); });
await withPage(mobile, async function (page) { await profileFlow(page, 'mobil'); });
await withPage(desktop, async function (page) { await lessonFlow(page, 'desktop'); });
await withPage(Object.assign({}, mobile, { height: 1000 }), async function (page) { await lessonFlow(page, 'mobil'); });

await browser.close();
console.log('shots done');
