/* Slučování postupu z prohlížeče a z účtu. Bez sítě, dá se pustit v Node i v prohlížeči. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StudovnaMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var KEYS = [
    'anat_svaly_hk_study_v1', 'anat_axial_study_v1',
    'latina_study_L1', 'latina_study_L2', 'latina_study_L3',
    'latina_study_L4', 'latina_study_L5', 'latina_study_L6',
    'sg_hk_proto_v1', 'sh_done', 'sh_fav', 'sh_last'
  ];

  function isKey(k) { return KEYS.indexOf(k) >= 0; }

  function parse(raw) {
    if (raw == null || raw === '') return null;
    try {
      var v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return v == null ? null : v;
    } catch (e) { return null; }
  }

  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stable(v[k]);
    }).join(',') + '}';
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function truthy(v) { return v === 1 || v === true || v === '1' || v === 'true'; }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  function mergeAnat(a, b) {
    a = a || {}; b = b || {};
    var out = clone(b) || {};
    var ex = {};
    var be = b.ex || {}, ae = a.ex || {};
    Object.keys(be).forEach(function (k) { ex[k] = be[k]; });
    Object.keys(ae).forEach(function (k) {
      if (!ex[k]) { ex[k] = ae[k]; return; }
      ex[k] = num(ae[k] && ae[k].ok) >= num(be[k] && be[k].ok) ? ae[k] : be[k];
    });
    out.ex = ex;
    var anki = {};
    Object.keys(b.anki || {}).forEach(function (k) { anki[k] = !!b.anki[k]; });
    Object.keys(a.anki || {}).forEach(function (k) { anki[k] = !!a.anki[k] || !!anki[k]; });
    out.anki = anki;
    out.t = Math.max(num(a.t), num(b.t));
    out.inp = Object.keys(a.inp || {}).length ? a.inp : (b.inp || {});
    out.last = a.last != null ? a.last : b.last;
    return out;
  }

  function scoreOf(v) {
    if (v && typeof v === 'object') return num(v.best != null ? v.best : v.ok);
    return truthy(v) ? 1 : 0;
  }

  function mergeLatina(a, b) {
    a = a || {}; b = b || {};
    var keys = {}, out = {};
    Object.keys(b).forEach(function (k) { keys[k] = 1; });
    Object.keys(a).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      if (a[k] == null) out[k] = b[k];
      else if (b[k] == null) out[k] = a[k];
      else out[k] = scoreOf(a[k]) >= scoreOf(b[k]) ? a[k] : b[k];
    });
    return out;
  }

  function mergeSg(a, b) {
    a = a || {}; b = b || {};
    var out = {};
    Object.keys(b).forEach(function (k) { out[k] = truthy(b[k]) ? 1 : b[k]; });
    Object.keys(a).forEach(function (k) {
      if (truthy(a[k])) out[k] = 1;
      else if (out[k] == null) out[k] = a[k];
    });
    return out;
  }

  function mergeFlags(a, b) {
    var out = {};
    Object.keys(b || {}).forEach(function (k) { if (truthy(b[k])) out[k] = 1; });
    Object.keys(a || {}).forEach(function (k) { if (truthy(a[k])) out[k] = 1; });
    return out;
  }

  function merge(key, local, remote) {
    if (key.indexOf('anat_') === 0) return mergeAnat(local, remote);
    if (key.indexOf('latina_study_') === 0) return mergeLatina(local, remote);
    if (key === 'sg_hk_proto_v1') return mergeSg(local, remote);
    if (key === 'sh_done' || key === 'sh_fav') return mergeFlags(local, remote);
    if (local != null) return local;
    return remote;
  }

  function reconcile(key, localRaw, remote, cleared) {
    var local = parse(localRaw);
    if (cleared) {
      var state = local == null ? (key === 'sh_last' ? null : (key.indexOf('anat_') === 0 ? { ex: {}, anki: {}, t: 0, inp: {} } : {})) : local;
      return { state: state, push: true, writeLocal: false };
    }
    if (local == null && (remote == null)) return { state: null, push: false, writeLocal: false };
    if (local == null) return { state: remote, push: false, writeLocal: true };
    if (remote == null) return { state: local, push: true, writeLocal: false };
    var merged = merge(key, local, remote);
    return {
      state: merged,
      push: stable(merged) !== stable(remote),
      writeLocal: stable(merged) !== stable(local)
    };
  }

  return {
    KEYS: KEYS,
    isKey: isKey,
    parse: parse,
    stable: stable,
    merge: merge,
    reconcile: reconcile
  };
});
