'use strict';
var assert = require('assert');
var M = require('../progress-merge.js');

var anat = M.merge('anat_svaly_hk_study_v1',
  { ex: { b01_0: { ok: 2, n: 4 }, b01_1: { ok: 1, n: 2 } }, anki: { b01: 0 }, t: 10, inp: { a: 'já' } },
  { ex: { b01_0: { ok: 4, n: 4 }, b01_2: { ok: 1, n: 1 } }, anki: { b01: 1 }, t: 3, inp: {} }
);
assert.strictEqual(anat.ex.b01_0.ok, 4);
assert.strictEqual(anat.ex.b01_1.ok, 1);
assert.strictEqual(anat.ex.b01_2.ok, 1);
assert.strictEqual(anat.anki.b01, true);
assert.strictEqual(anat.t, 10);
assert.strictEqual(anat.inp.a, 'já');

var lat = M.merge('latina_study_L1',
  { s1e0: { ok: 1, t: 2, best: 40 }, seen0: 1 },
  { s1e0: { ok: 2, t: 2, best: 80 }, s1e1: { ok: 1, t: 1, best: 100 } }
);
assert.strictEqual(lat.s1e0.best, 80);
assert.strictEqual(lat.s1e1.best, 100);
assert.strictEqual(lat.seen0, 1);

var sg = M.merge('sg_hk_proto_v1', { r01_0: 1 }, { a01: 1, r01_1: 0 });
assert.strictEqual(sg.r01_0, 1);
assert.strictEqual(sg.a01, 1);

var bio = M.merge('bio_p01_study_v1',
  { ex: { q001: { ok: 1, n: 1 }, exam_0: { ok: 10, n: 20 } }, anki: {}, t: 4, inp: {} },
  { ex: { exam_0: { ok: 18, n: 20 } }, anki: {}, t: 1, inp: {} }
);
assert.strictEqual(bio.ex.q001.ok, 1);
assert.strictEqual(bio.ex.exam_0.ok, 18);
assert.strictEqual(bio.t, 4);
var bioLekce = M.merge('bio_p01_lekce_v1', { r01: 1, q001: 1 }, { a01: 1 });
assert.strictEqual(bioLekce.r01, 1);
assert.strictEqual(bioLekce.q001, 1);
assert.strictEqual(bioLekce.a01, 1);
assert.ok(M.isKey('bio_p01_study_v1') && M.isKey('bio_p01_lekce_v1'));
assert.ok(M.isKey('anat_klouby_dk_v1'));

var kl = M.merge('anat_klouby_dk_v1',
  { ex: { q000: { ok: 0, n: 1, t: 20 } }, t: 4, runs: 2, bestRun: { pts: 800, max: 1000, ok: 1, n: 10, at: 2 }, lastRun: { pts: 100, max: 1000, ok: 0, n: 10, at: 9 } },
  { ex: { q000: { ok: 1, n: 1, t: 10 }, q001: { ok: 1, n: 1, t: 5 } }, t: 9, runs: 1, bestRun: { pts: 500, max: 1000, ok: 1, n: 10, at: 1 }, lastRun: { pts: 900, max: 1000, ok: 1, n: 10, at: 3 } }
);
assert.strictEqual(kl.ex.q000.ok, 0);
assert.strictEqual(kl.ex.q001.ok, 1);
assert.strictEqual(kl.t, 9);
assert.strictEqual(kl.runs, 2);
assert.strictEqual(kl.bestRun.pts, 800);
assert.strictEqual(kl.lastRun.at, 9);

var fresh = M.reconcile('latina_study_L1', null, { s1e0: { best: 10 } }, false);
assert.strictEqual(fresh.writeLocal, true);
assert.strictEqual(fresh.push, false);

var reset = M.reconcile('latina_study_L1', '{}', { s1e0: { best: 10 } }, true);
assert.deepStrictEqual(reset.state, {});
assert.strictEqual(reset.push, true);
assert.strictEqual(reset.writeLocal, false);

var same = M.reconcile('sh_done', JSON.stringify({ 'latina-lekce-01': 1 }), { 'latina-lekce-01': 1 }, false);
assert.strictEqual(same.push, false);
assert.strictEqual(same.writeLocal, false);

console.log('progress-merge ok');
