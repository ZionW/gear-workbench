const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../assets/engine.js');
require('../assets/exports.js');
const E = globalThis.GearEngine;
const X = globalThis.GearExports;
const gear = (id, changes = {}) => ({ id, name: id, type: 'spur', m: 2, teeth: 20, alpha: 20, width: 10, bore: 8, wall: 6, base: 6, beta: 20, x: 0, y: 0, z: 0, yaw: 0, phase: 0, rotation: 0, fixed: false, ...changes });
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('custom module decimals preserve the pitch diameter', () => {
  for (const m of [0.5, 1.25, 1.5, 2.5, 1.2345]) {
    const g = gear('a', { m, bore: 0 });
    close(2 * E.dims(g).r, m * g.teeth);
    assert.equal(E.validate(g).length, 0);
  }
  const h = gear('h', { type: 'helical', m: 1.25 });
  close(2 * E.dims(h).r, h.m * h.teeth / Math.cos(E.rad(h.beta)));
});

test('spur train reverses direction and preserves tooth ratios', () => {
  const a = gear('a'), b = gear('b', { x: 60, teeth: 40 }), c = gear('c', { x: 120 });
  const s = E.solve([a, b, c], [{ a: 'a', b: 'b', kind: 'mesh' }, { a: 'b', b: 'c', kind: 'mesh' }], 'a', 30);
  assert.deepEqual(s.errors, []);
  close(s.rates.b, -s.rates.a / 2);
  close(s.rates.c, s.rates.a);
});

test('internal mesh, rigid shaft and finite rack motion', () => {
  const a = gear('a', { x: 40 }), ring = gear('ring', { type: 'internal', teeth: 60 });
  const s = E.solve([a, ring], [{ a: 'a', b: 'ring', kind: 'mesh' }], 'a', 30);
  assert.deepEqual(s.errors, []);
  close(s.rates.ring, s.rates.a / 3);
  const pin = gear('pin'), rack = gear('rack', { type: 'rack', y: -20, teeth: 20 });
  const links = [{ a: 'pin', b: 'rack', kind: 'mesh' }];
  const t = E.solve([pin, rack], links, 'pin', 30);
  assert.deepEqual(t.errors, []);
  close(t.rates.rack, t.rates.pin * 20);
  assert.ok(E.rackEngaged([pin, rack], links, t, 0));
  assert.ok(!E.rackEngaged([pin, rack], links, t, 20));
  const shaft = gear('shaft', { z: 15, teeth: 60 });
  const u = E.solve([pin, shaft], [{ a: 'pin', b: 'shaft', kind: 'shaft' }], 'pin', 30);
  assert.deepEqual(u.errors, []);
  close(u.rates.pin, u.rates.shaft);
});

test('impossible motion and mismatched helical hands are rejected', () => {
  const a = gear('a'), b = gear('b', { x: 40 }), c = gear('c', { x: 20, y: 20 * Math.sqrt(3) });
  const s = E.solve([a, b, c], [{ a: 'a', b: 'b', kind: 'mesh' }, { a: 'b', b: 'c', kind: 'mesh' }, { a: 'c', b: 'a', kind: 'mesh' }], 'a', 30);
  assert.ok(s.errors.some(e => e.includes('鎖死')));
  assert.ok(E.match(gear('h1', { type: 'helical' }), gear('h2', { type: 'helical' })).length);
  b.fixed = true;
  assert.ok(E.solve([a, b], [{ a: 'a', b: 'b', kind: 'mesh' }], 'a', 30).errors.some(e => e.includes('固定')));
});

for (const type of ['spur', 'helical', 'internal', 'rack']) {
  test(`${type}: STL closes, STEP contains a solid and DXF declares mm`, () => {
    const g = gear('part', { type, teeth: type === 'internal' ? 60 : type === 'rack' ? 12 : 20 });
    const bytes = X.makeSTL([g]), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(80, true);
    assert.equal(bytes.length, 84 + 50 * count);
    const edges = new Map(); let volume = 0;
    const key = p => p.map(v => Math.abs(v) < 1e-6 ? '0.000000' : v.toFixed(6)).join(',');
    for (let i = 0; i < count; i++) {
      const offset = 84 + 50 * i + 12;
      const points = [0, 1, 2].map(j => [0, 1, 2].map(k => view.getFloat32(offset + j * 12 + k * 4, true)));
      const [a, b, c] = points;
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const id = [key(u), key(v)].sort().join('|'); edges.set(id, (edges.get(id) || 0) + 1);
      }
    }
    assert.ok(volume > 0);
    assert.ok([...edges.values()].every(n => n === 2));
    const step = X.makeSTEP([g]);
    assert.ok(step.startsWith('ISO-10303-21;'));
    assert.equal((step.match(/ADVANCED_FACE\(/g) || []).length, type === 'rack' ? 3 : 4);
    assert.ok(step.includes('MANIFOLD_SOLID_BREP'));
    const ids = new Set([...step.matchAll(/^#(\d+) =/gm)].map(m => m[1]));
    for (const ref of step.matchAll(/#(\d+)/g)) assert.ok(ids.has(ref[1]));
    assert.ok(X.makeDXF([g]).includes('$INSUNITS\n70\n4'));
  });
}
