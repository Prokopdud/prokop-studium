'use strict';
var assert = require('assert');
var K = require('../kviz-klouby-dk.js');

assert.strictEqual(K.LIMIT, 20000);
assert.strictEqual(K.points(20000), 1000);
assert.strictEqual(K.points(10000), 500);
assert.strictEqual(K.points(0), 0);
assert.strictEqual(K.points(-20), 0);
assert.strictEqual(K.points(25000), 1000);
assert.strictEqual(K.points(15000), 750);

console.log('kviz-klouby ok');
