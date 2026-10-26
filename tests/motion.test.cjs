const { test } = require("node:test"),
  assert = require("node:assert/strict");
require("../assets/motion.js");
test("cosmetic motion stays subtle and always settles to the original geometry scale", () => {
  for (const kind of ["enter", "exit", "pulse", "settle"]) {
    for (let i = 0; i <= 100; i++) {
      const s = GearMotion.sample(kind, i / 100);
      assert(
        Number.isFinite(s.scale) &&
          Number.isFinite(s.alpha) &&
          Number.isFinite(s.lift),
      );
      assert(s.scale >= 0.8 && s.scale <= 1.04);
      assert(s.alpha >= 0 && s.alpha <= 1);
      assert(Math.abs(s.lift) <= 5);
    }
    const end = GearMotion.sample(kind, 1);
    assert.equal(end.alpha, kind === "exit" ? 0 : 1);
    if (kind !== "exit") {
      assert.equal(end.scale, 1);
      assert.equal(end.lift, 0);
    }
  }
  assert(Math.abs(GearMotion.sample("pulse", 0.5).scale - 1.035) < 1e-10);
});
test("reduced motion removes cosmetic scale and displacement", () => {
  for (const kind of ["enter", "exit", "pulse", "settle"])
    for (const progress of [0, 0.2, 0.5, 0.9, 1]) {
      const s = GearMotion.sample(kind, progress, true);
      assert.equal(s.scale, 1);
      assert.equal(s.lift, 0);
    }
});
