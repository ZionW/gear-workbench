const { test } = require("node:test"),
  assert = require("node:assert/strict");
require("../assets/engine.js");
require("../assets/coupler.js");
require("../assets/exports.js");
require("../assets/mount.js");
require("../assets/downloads.js");
const E = GearEngine,
  C = GearCoupler,
  X = GearExports;
const g = (patch = {}) => ({
  id: "g1",
  name: "Motor gear",
  type: "spur",
  m: 2,
  teeth: 20,
  alpha: 20,
  width: 10,
  bore: 8,
  beta: 20,
  wall: 6,
  base: 6,
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  phase: 0,
  rotation: 0,
  fixed: false,
  coupler: true,
  motorShaft: 3,
  motorAllowance: 0,
  motorLength: 12,
  couplerWall: 2,
  hexClearance: 0.3,
  hexLength: 6,
  ...patch,
});
function inspect(bytes) {
  const v = new DataView(bytes.buffer),
    edges = new Map();
  let volume = 0;
  const key = (p) => p.map((n) => Math.round(n * 1e5)).join(",");
  for (let i = 0; i < v.getUint32(80, true); i++) {
    const p = [0, 1, 2].map((j) =>
        [0, 1, 2].map((k) =>
          v.getFloat32(84 + 50 * i + 12 + j * 12 + k * 4, true),
        ),
      ),
      [a, b, c] = p;
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    for (let j = 0; j < 3; j++) {
      const a = key(p[j]),
        b = key(p[(j + 1) % 3]),
        k = [a, b].sort().join("|"),
        e = edges.get(k) || [0, 0];
      assert.notEqual(a, b);
      e[0]++;
      e[1] += a < b ? 1 : -1;
      edges.set(k, e);
    }
  }
  for (const [k, e] of edges) assert.deepEqual(e, [2, 0], k);
  assert.ok(volume > 0);
  return volume;
}
test("coupled gear uses exact AF hex and reserves the corner radius for recesses", () => {
  const a = g(),
    geo = E.geometry(a);
  assert.equal(geo.inner.n, 6);
  const pts = E.sample(geo.inner, 1);
  assert.equal(pts.length, 6);
  assert.ok(Math.abs(Math.max(...pts.map((v) => v[1])) - 4) < 1e-8);
  assert.ok(Math.abs(E.boreRadius(a) - 8 / Math.sqrt(3)) < 1e-8);
  assert.deepEqual(E.validate(a), []);
  assert.equal(E.pocket({ ...a, recessDepth: 5 }).inner, 8 / Math.sqrt(3) + 2);
  assert.ok(E.validate(g({ bore: 4 })).length);
});
test("motor coupling is one manifold stepped hollow solid with expected volume", () => {
  const p = C.poses([g()])[0],
    v = inspect(X.makeSTL([p])),
    d = C.dimensions(g()),
    expected =
      ((Math.sqrt(3) / 2) * d.flats ** 2 - (Math.PI * d.shaft ** 2) / 4) *
        d.neck +
      Math.PI * (d.radius ** 2 - d.shaft ** 2 / 4) * d.body;
  assert.ok(Math.abs(v - expected) < expected * 0.001);
  assert.equal(d.shaft, 3);
  assert.equal(d.flats, 7.7);
  assert.equal(p.z, 4);
  assert.equal(GearMount.build([g()], { enabled: true }).pins.length, 0);
  assert.ok(X.makeSTEP([p]).includes("MANIFOLD_SOLID_BREP"));
});
for (const type of ["spur", "helical"])
  for (const recessDepth of [0, 5])
    test(`${type} hex through-hole and recess ${recessDepth} export manifold`, () => {
      const a = g({ type, recessDepth });
      inspect(X.makeSTL([a]));
      assert.ok(X.makeSTEP([a]).includes("MANIFOLD_SOLID_BREP"));
    });
test("Rhino assembly and print kit include associated couplers automatically", () => {
  const a = g(),
    macro = X.rhinoAssemblyMacro([a], null),
    data = JSON.parse(JSON.parse(macro.match(/data = json.loads\(u(.+)\)/)[1]));
  assert.equal(data.length, 2);
  assert(data[0].hex);
  assert.equal(data[0].loops.length, 1);
  assert.equal(data[1].kind, "coupler");
  assert.equal(data[1].shaft, 3);
  assert.equal(data[1].flats, 7.7);
  const bytes = GearDownloads.build({
    target: "kit",
    format: "stl",
    poses: [a],
    mount: GearMount.build([a]),
  }).data;
  assert(
    new TextDecoder().decode(bytes).includes("couplers/motor-coupler-1.stl"),
  );
});
for (const shape of ["round", "d"])
  for (const motorDepth of [0, 7])
    test(`${shape} socket depth ${motorDepth}: correct profile, blind floor and closed mesh`, () => {
      const a = g({ motorShape: shape, motorFlat: 0.5, motorDepth }),
        p = C.poses([a])[0],
        volume = inspect(X.makeSTL([p])),
        d = C.dimensions(a),
        r = d.shaft / 2,
        c = r - 0.5,
        segment = r * r * Math.acos(c / r) - c * Math.sqrt(r * r - c * c),
        area = Math.PI * r * r - (shape === "d" ? segment : 0),
        expected =
          (Math.sqrt(3) / 2) * d.flats ** 2 * d.neck +
          Math.PI * d.radius ** 2 * d.body -
          area * (motorDepth || d.height);
      assert.ok(Math.abs(volume - expected) < expected * 0.001);
      assert.equal(p.holeFloor, motorDepth ? d.height - motorDepth : 0);
      if (shape === "d") {
        const pts = C.socketPoints(p);
        assert.ok(Math.abs(Math.max(...pts.map((v) => v[0])) - 1) < 1e-8);
        assert.equal(C.geometry(p).inner.kind, "d");
      }
      assert.ok(X.makeSTEP([p]).includes("MANIFOLD_SOLID_BREP"));
    });
test("D geometry and socket depth constraints reject invalid shapes without silent clamping", () => {
  assert.ok(E.validate(g({ motorShape: "d", motorFlat: 1.5 })).length);
  assert.ok(E.validate(g({ motorDepth: 12 })).length);
  assert.ok(E.validate(g({ motorDepth: -1 })).length);
  assert.ok(E.validate(g({ motorShape: "x" })).length);
  assert.deepEqual(
    E.validate(
      g({ motorShape: "d", motorFlat: 0.5, motorDepth: 7, motorLength: 15 }),
    ),
    [],
  );
});
for (const id of ["drawing1", "drawing2"])
  test(`${id}: double-D preset builds matching flats, insertion and watertight exports`, () => {
    const before = g({ coupler: false }),
      snapshot = JSON.stringify(before),
      patch = C.presetPatch(before, id),
      gear = { ...before, ...patch },
      p = C.poses([gear])[0],
      spec = C.presets[id];
    assert.equal(JSON.stringify(before), snapshot);
    assert.deepEqual(E.validate(gear), []);
    assert.equal(p.shape, "double-d");
    assert.ok(Math.abs(p.shaft - spec.diameter - 0.2) < 1e-8);
    assert.ok(Math.abs(p.shaft - 2 * p.flat - spec.acrossFlats - 0.2) < 1e-8);
    assert.ok(Math.abs(p.depth - spec.shaftLength - 0.3) < 1e-8);
    const pts = C.socketPoints(p);
    assert.ok(
      Math.abs(
        Math.max(...pts.map((v) => v[0])) - (spec.acrossFlats + 0.2) / 2,
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(
        Math.min(...pts.map((v) => v[0])) + (spec.acrossFlats + 0.2) / 2,
      ) < 1e-8,
    );
    const volume = inspect(X.makeSTL([p])),
      r = p.shaft / 2,
      c = r - p.flat,
      segment = r * r * Math.acos(c / r) - c * Math.sqrt(r * r - c * c),
      area = Math.PI * r * r - 2 * segment,
      expected =
        (Math.sqrt(3) / 2) * p.flats ** 2 * p.neck +
        Math.PI * p.radius ** 2 * p.body -
        area * p.depth;
    assert.ok(Math.abs(volume - expected) < expected * 0.001);
    assert.ok(X.makeSTEP([p]).includes("MANIFOLD_SOLID_BREP"));
  });
test("preset keeps larger custom hex bores and expands smaller ones only as needed", () => {
  assert.equal(C.presetPatch(g({ bore: 10 }), "drawing1").bore, 10);
  const patch = C.presetPatch(g({ bore: 4, motorAllowance: 0.2 }), "drawing1"),
    candidate = { ...g(), motorAllowance: 0.2, ...patch };
  assert.deepEqual(E.validate(candidate), []);
  assert.ok(patch.bore >= 8.1);
  assert.throws(() => C.presetPatch(g(), "unknown"));
});
test("fit samples bracket the current allowance and are closed printable 5 mm sleeves", () => {
  const gear = { ...g(), ...C.presetPatch(g(), "drawing1") },
    samples = C.fitSamples(gear);
  assert.deepEqual(
    samples.map((p) => p.allowance),
    [0.1, 0.2, 0.3],
  );
  for (const p of samples) {
    assert.equal(p.height, 5);
    assert.equal(p.z, 0);
    const volume = inspect(X.makeSTL([p])),
      r = p.shaft / 2,
      c = r - p.flat,
      segment = r * r * Math.acos(c / r) - c * Math.sqrt(r * r - c * c),
      expected =
        (Math.PI * p.radius * p.radius - Math.PI * r * r + 2 * segment) * 5;
    assert.ok(Math.abs(volume - expected) < expected * 0.001);
  }
});

test("integrated cylinder passes through enlarged hex bore and remains a closed printable solid", () => {
  for (const motorShape of ["round", "d", "double-d"]) {
    let source = g({ couplerMount: true, motorShape, motorFlat: 0.5 });
    const settings = GearMount.normalize({ enabled: true });
    source.bore = C.minimumBore(source, settings);
    const mount = GearMount.build([source], settings),
      gear = { ...source, mountContext: mount },
      p = C.poses([gear])[0];
    assert(p.support);
    assert(p.support.collar < gear.bore);
    assert(gear.bore - p.support.collar >= 0.4 - 1e-8);
    inspect(X.makeSTL([p]));
    const step = X.makeSTEP([p]);
    assert.equal((step.match(/MANIFOLD_SOLID_BREP/g) || []).length, 1);
    const data = JSON.parse(
      JSON.parse(
        X.rhinoAssemblyMacro([gear], mount).match(
          /data = json.loads\(u(.+)\)/,
        )[1],
      ),
    );
    assert(data.find((p) => p.kind === "coupler").support);
    assert(!data.some((p) => p.kind === "latch"));
  }
});
test("pegboard extension rejects unavailable boards and off-grid centers; regular coupler remains unchanged", () => {
  const source = g({ couplerMount: true });
  assert.throws(() => C.poses([source]), /啟用底盤/);
  const mount = GearMount.build([source], { enabled: true });
  assert.throws(
    () => C.poses([{ ...source, x: 1, mountContext: mount }]),
    /對準/,
  );
  assert.equal(
    GearMount.build([{ ...source, x: 1 }], { enabled: true }).unmounted.length,
    1,
  );
  assert.equal(C.poses([g()])[0].support, null);
});
