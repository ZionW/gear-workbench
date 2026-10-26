/* Cosmetic motion only: never used by geometry, hit tests, or exports. */
globalThis.GearMotion = {
  duration: { enter: 260, exit: 170, pulse: 280, settle: 180 },
  sample(kind, progress, reduced = false) {
    const t = Math.max(0, Math.min(1, progress));
    if (reduced || t === 1)
      return {
        scale: kind === "exit" && !reduced ? 0.8 : 1,
        alpha: kind === "exit" ? 0 : 1,
        lift: 0,
      };
    if (kind === "enter") {
      const x = t - 1,
        back = 1 + 2.4 * x * x * x + 1.4 * x * x;
      return {
        scale: 0.88 + 0.12 * back,
        alpha: 1 - Math.pow(1 - t, 3),
        lift: 5 * Math.pow(1 - t, 3),
      };
    }
    if (kind === "exit")
      return { scale: 1 - 0.2 * t * t, alpha: 1 - t * t, lift: -4 * t * t };
    if (kind === "settle")
      return {
        scale: 1 + 0.015 * Math.pow(1 - t, 3),
        alpha: 1,
        lift: -2 * Math.pow(1 - t, 3),
      };
    return {
      scale: 1 + 0.035 * Math.pow(Math.sin(Math.PI * t), 2),
      alpha: 1,
      lift: 0,
    };
  },
};
