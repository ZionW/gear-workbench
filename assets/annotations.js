/* Screen-space name tags; never included in cutting/engraving geometry. */
globalThis.GearAnnotations = {
  // Rotating tooth tips must not change the screen-space label envelope.
  envelope(g, dimensions) {
    const ring =
      g.type === "rack"
        ? [
            [-dimensions.length / 2, -1.25 * g.m - g.base],
            [dimensions.length / 2, -1.25 * g.m - g.base],
            [dimensions.length / 2, g.m],
            [-dimensions.length / 2, g.m],
          ].map(([x, y]) => {
            const angle = g.rotation || 0;
            return [
              x * Math.cos(angle) - y * Math.sin(angle),
              x * Math.sin(angle) + y * Math.cos(angle),
            ];
          })
        : Array.from({ length: 64 }, (_, i) => {
            const angle = (2 * Math.PI * i) / 64;
            return [
              dimensions.outer * Math.cos(angle),
              dimensions.outer * Math.sin(angle),
            ];
          });
    return ring.flatMap(([x, y]) => [
      [g.x + x, g.y + y, g.z],
      [g.x + x, g.y + y, g.z + g.width],
    ]);
  },
  layout(items, width, height) {
    const occupied = [];
    return items.map((item) => {
      const w = Math.min(width - 12, Math.max(54, item.width)),
        h = 26,
        b = item.bounds,
        candidates = [];
      for (let gap of [12, 32, 58, 90])
        for (const [x, y] of [
          [b.x + b.w / 2 - w / 2, b.y - gap - h],
          [b.x + b.w + gap, b.y + b.h / 2 - h / 2],
          [b.x - w - gap, b.y + b.h / 2 - h / 2],
          [b.x + b.w / 2 - w / 2, b.y + b.h + gap],
        ])
          candidates.push({
            x: Math.max(6, Math.min(width - w - 6, x)),
            y: Math.max(6, Math.min(height - h - 6, y)),
            w,
            h,
          });
      const overlap = (a, b) =>
        Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const score = (a) =>
        items.reduce((n, v) => n + overlap(a, v.bounds) * 20, 0) +
        occupied.reduce((n, v) => n + overlap(a, v) * 40, 0) +
        Math.hypot(a.x + w / 2 - item.anchor[0], a.y + h / 2 - item.anchor[1]);
      candidates.sort((a, b) => score(a) - score(b));
      const rect = candidates[0];
      occupied.push(rect);
      return { ...item, rect };
    });
  },
};
