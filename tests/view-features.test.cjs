const { test } = require("node:test"),
  assert = require("node:assert/strict");
require("../assets/engine.js");
require("../assets/annotations.js");
const gear = {
  id: "g",
  name: "Custom",
  x: 10,
  y: 20,
  z: 0,
  width: 10,
  motorYaw: 0,
  rotation: 0,
};
test("name tags stay inside viewport and avoid gear bounding boxes when space permits", () => {
  const items = [
      {
        id: "a",
        width: 70,
        anchor: [120, 150],
        bounds: { x: 80, y: 110, w: 80, h: 80 },
      },
      {
        id: "b",
        width: 70,
        anchor: [270, 150],
        bounds: { x: 210, y: 90, w: 120, h: 120 },
      },
    ],
    placed = GearAnnotations.layout(items, 450, 300);
  for (const { rect: r } of placed) {
    assert(r.x >= 0 && r.y >= 0 && r.x + r.w <= 450 && r.y + r.h <= 300);
    for (const i of items) {
      const b = i.bounds;
      assert(
        r.x + r.w <= b.x ||
          r.x >= b.x + b.w ||
          r.y + r.h <= b.y ||
          r.y >= b.y + b.h,
      );
    }
  }
});
test("language switching translates controls and preserves technical values", () => {
  const vm = require("node:vm"),
    fs = require("node:fs"),
    context = {
      document: {
        addEventListener() {},
        getElementById() {
          return null;
        },
      },
      window: { dispatchEvent() {} },
      Event: class {},
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {},
      },
    };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(require.resolve("../assets/translations.js"), "utf8"),
    context,
  );
  vm.runInContext(
    fs.readFileSync(require.resolve("../assets/i18n.js"), "utf8"),
    context,
  );
  const i = context.GearI18n;
  for (const [language, text] of [
    ["en", "Inspect part"],
    ["ja", "単体プレビュー"],
    ["ko", "개별 미리보기"],
  ]) {
    i.setLanguage(language);
    assert.equal(i.t("單獨預覽"), text);
    assert.equal(i.t("M2 Ø5.2 / 3.6 mm"), "M2 Ø5.2 / 3.6 mm");
    assert.equal(i.t("My custom gear"), "My custom gear");
  }
  i.setLanguage("zh-Hant");
  assert.equal(i.t("單獨預覽"), "單獨預覽");
});

test("rotating gear labels use an invariant envelope and still follow position and dimensions", () => {
  for (const type of ["spur", "helical", "internal"]) {
    const g = { type, x: 10, y: -5, z: 2, width: 12, rotation: 0 }, d = { outer: 24 };
    const original = GearAnnotations.envelope(g, d);
    for (const rotation of [.01, .37, 1.2, Math.PI, 2 * Math.PI]) assert.deepEqual(GearAnnotations.envelope({ ...g, rotation }, d), original);
    assert.notDeepEqual(GearAnnotations.envelope({ ...g, x: 20 }, d), original);
    assert.notDeepEqual(GearAnnotations.envelope(g, { outer: 30 }), original);
  }
});
