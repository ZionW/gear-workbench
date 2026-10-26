/* Printable mounting kit. Millimeters; diametral clearances, not per-side offsets. */
globalThis.GearMount = (() => {
  const E = globalThis.GearEngine,
    TAU = 2 * Math.PI;
  const defaults = {
    enabled: false,
    adaptive: false,
    pitch: 10,
    thickness: 6,
    margin: 10,
    plug: 6,
    clearance: 0.3,
    shaftClearance: 0.3,
    backlash: 0.2,
    recess: 1.5,
    standOff: 4,
  };
  function normalize(value = {}) {
    if (!value || typeof value !== "object") value = {};
    const s = { ...defaults };
    s.enabled = value.enabled === true;
    s.adaptive = value.adaptive === true;
    for (const k of Object.keys(defaults))
      if (!["enabled", "adaptive"].includes(k) && value[k] !== undefined)
        s[k] = Number(value[k]);
    if (value.shaftClearance === undefined && value.clearance !== undefined)
      s.shaftClearance = Number(value.clearance);
    return s;
  }
  function build(gears, value = {}) {
    const s = normalize(value),
      errors = [],
      warnings = [],
      pins = [],
      unmounted = [];
    const limits = {
      pitch: [6, 50],
      thickness: [3, 20],
      margin: [5, 40],
      plug: [3, 12],
      clearance: [0.15, 1],
      shaftClearance: [0.15, 1],
      backlash: [0, 0.6],
      recess: [0.5, 3],
      standOff: [2, 20],
    };
    for (const [k, [min, max]] of Object.entries(limits))
      if (!Number.isFinite(s[k]) || s[k] < min || s[k] > max)
        errors.push(k + " 超出範圍 " + min + "–" + max + " mm");
    if (s.thickness <= s.recess + 1) errors.push("板厚需大於沉槽深度至少 1 mm");
    const hole = s.plug + s.clearance,
      recessDiameter = hole + 1.8 * s.recess;
    if (!s.adaptive && s.pitch < recessDiameter + 1)
      errors.push("孔距太小：沉槽之間需保留至少 1 mm");
    if (!gears.length || gears.some((g) => E.validate(g).length))
      errors.push("請先修正齒輪尺寸");
    if (errors.length)
      return { settings: s, errors, warnings, pins, unmounted };
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const g of gears) {
      const d = E.dims(g),
        ext = g.type === "rack" ? d.length / 2 + g.base + g.m : d.outer;
      minX = Math.min(minX, g.x - ext);
      maxX = Math.max(maxX, g.x + ext);
      minY = Math.min(minY, g.y - ext);
      maxY = Math.max(maxY, g.y + ext);
    }
    const i0 = Math.floor((minX - s.margin + s.pitch / 2) / s.pitch),
      i1 = Math.ceil((maxX + s.margin - s.pitch / 2) / s.pitch),
      j0 = Math.floor((minY - s.margin + s.pitch / 2) / s.pitch),
      j1 = Math.ceil((maxY + s.margin - s.pitch / 2) / s.pitch);
    const cols = i1 - i0 + 1,
      rows = j1 - j0 + 1,
      rim = 2,
      width = cols * s.pitch + 2 * rim,
      height = rows * s.pitch + 2 * rim,
      top = Math.min(...gears.map((g) => g.z)) - s.standOff,
      bottom = top - s.thickness;
    if (!s.adaptive && cols * rows > 600)
      errors.push("孔位超過 600 個，請加大孔距或縮小配置");
    if (width > 256 || height > 256)
      warnings.push(
        "底盤超過 A1 的 256 × 256 mm 成形範圍，請縮小配置或分割後列印",
      );
    if (width > 500 || height > 500) errors.push("底盤超過 500 mm，請縮小配置");
    const holes = [];
    if (!errors.length && !s.adaptive)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++)
          holes.push({ x: i * s.pitch, y: j * s.pitch, i, j });
    for (const g of gears) {
      if (g.coupler === true && g.couplerMount === true) {
        if (s.adaptive) {
          holes.push({ x: g.x, y: g.y });
          continue;
        }
        const x = Math.round(g.x / s.pitch) * s.pitch,
          y = Math.round(g.y / s.pitch) * s.pitch,
          offset = Math.hypot(x - g.x, y - g.y);
        if (offset > 0.05)
          unmounted.push({ id: g.id, name: g.name, offset, x, y });
        continue;
      }
      if (g.coupler === true) {
        warnings.push(
          g.name + "：使用馬達聯軸器，不生成固定支撐桿；馬達另需固定座",
        );
        continue;
      }
      if (!["spur", "helical"].includes(g.type)) {
        warnings.push(
          g.name + "：需另外的環形支撐／齒條滑軌，本版不生成其桿件",
        );
        continue;
      }
      if (g.bore < 3) {
        warnings.push(g.name + "：軸孔至少 3 mm 才能生成桿件");
        continue;
      }
      const x = Math.round(g.x / s.pitch) * s.pitch,
        y = Math.round(g.y / s.pitch) * s.pitch,
        offset = Math.hypot(x - g.x, y - g.y);
      if (offset > 0.05 && !s.adaptive)
        unmounted.push({ id: g.id, name: g.name, offset, x, y });
      const shaft =
          g.bore -
          (s.adaptive ? Math.max(0.4, s.shaftClearance) : s.shaftClearance),
        collar = Math.max(s.plug + 1.8 * s.recess, g.bore + 3);
      pins.push({
        id: g.id,
        name: g.name,
        x: g.x,
        y: g.y,
        holeX: x,
        holeY: y,
        z: g.z,
        width: g.width,
        shaft,
        collar,
        aligned: s.adaptive || offset <= 0.05,
      });
    }
    for (let i = 0; i < pins.length; i++)
      for (let j = i + 1; j < pins.length; j++)
        if (
          Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y) <
          (pins[i].collar + pins[j].collar) / 2 + 0.2
        )
          errors.push(pins[i].name + " 與 " + pins[j].name + " 的支撐座重疊");
    if (unmounted.length)
      warnings.push(
        unmounted.length + " 個輪心未對孔位；請調整孔距，或使用「對齊孔位」",
      );
    if (!pins.length) warnings.push("尚無可用支撐桿；外齒輪需有至少 3 mm 軸孔");
    const result = {
      settings: s,
      errors,
      warnings,
      pins,
      unmounted,
      holes,
      cols,
      rows,
      width,
      height,
      top,
      bottom,
      hole,
      recessDiameter,
      rim,
      i0,
      i1,
      j0,
      j1,
      x0: (i0 - 0.5) * s.pitch - rim,
      x1: (i1 + 0.5) * s.pitch + rim,
      y0: (j0 - 0.5) * s.pitch - rim,
      y1: (j1 + 0.5) * s.pitch + rim,
    };
    if (s.adaptive) {
      const points = [];
      for (const g of gears) {
        const d = E.dims(g);
        if (g.type === "rack") {
          for (const x of [-d.length / 2 - s.margin, d.length / 2 + s.margin])
            for (const y of [-g.base - 1.25 * g.m - s.margin, g.m + s.margin]) {
              const v = E.rot([x, y], E.rad(g.yaw || 0));
              points.push([g.x + v[0], g.y + v[1]]);
            }
        } else
          for (let i = 0; i < 32; i++) {
            const a = (TAU * i) / 32,
              r = d.outer + s.margin;
            points.push([g.x + r * Math.cos(a), g.y + r * Math.sin(a)]);
          }
      }
      result.outline = hull(points);
      result.x0 = Math.min(...result.outline.map((v) => v[0]));
      result.x1 = Math.max(...result.outline.map((v) => v[0]));
      result.y0 = Math.min(...result.outline.map((v) => v[1]));
      result.y1 = Math.max(...result.outline.map((v) => v[1]));
      result.width = result.x1 - result.x0;
      result.height = result.y1 - result.y0;
      result.effectiveShaftClearance = Math.max(0.4, s.shaftClearance);
    }
    return result;
  }
  // A tapered seat prints without a suspended flange underside and can be lifted out.
  function hull(points) {
    const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      cross = (a, b, c) =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      half = (arr) => {
        const out = [];
        for (const p of arr) {
          while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 1e-8)
            out.pop();
          out.push(p);
        }
        return out.slice(0, -1);
      };
    return [...half(sorted), ...half(sorted.slice().reverse())];
  }
  function pinProfile(pin, m) {
    if (m.settings.adaptive) {
      const r = pin.collar / 2,
        rs = pin.shaft / 2,
        z = pin.z - 0.2;
      return [
        [r, m.top],
        [r, z],
        [rs, z],
        [rs, pin.z + pin.width + 1.1],
        [Math.max(0.5, rs - 0.4), pin.z + pin.width + 1.5],
      ];
    }
    const s = m.settings,
      r = s.plug / 2,
      rf = r + 0.9 * s.recess,
      rc = pin.collar / 2,
      rs = pin.shaft / 2,
      z0 = m.top - s.recess - (s.thickness - s.recess - 0.3),
      seat = m.top - s.recess;
    const rise = Math.min(rc - rf, pin.z - m.top - 0.5);
    return [
      [r - 0.4, z0],
      [r, z0 + 0.4],
      [r, seat],
      [rf, m.top],
      [rc, m.top + Math.max(0, rise)],
      [rc, pin.z],
      [rs, pin.z],
      [rs, pin.z + pin.width + 1.1],
      [Math.max(0.5, rs - 0.4), pin.z + pin.width + 1.5],
    ];
  }
  function boardTriangles(m, segments = 32) {
    if (m.settings.adaptive)
      return adaptiveTriangles(m, Math.max(32, segments));
    if (m.errors.length) throw Error(m.errors.join("；"));
    const t = [],
      s = m.settings,
      n = segments,
      r = m.hole / 2,
      R = m.recessDiameter / 2,
      z0 = 0,
      z1 = s.thickness - s.recess,
      z2 = s.thickness;
    const tri = (a, b, c) => t.push([a, b, c]),
      quad = (a, b, c, d) => {
        tri(a, b, c);
        tri(a, c, d);
      };
    for (const h of m.holes) {
      const x = h.x - m.x0,
        y = h.y - m.y0,
        outer = [],
        small = [],
        large = [];
      for (let k = 0; k < n; k++) {
        const a = (TAU * k) / n,
          c = Math.cos(a),
          v = Math.sin(a),
          q = s.pitch / 2 / Math.max(Math.abs(c), Math.abs(v));
        outer.push([x + q * c, y + q * v]);
        small.push([x + r * c, y + r * v]);
        large.push([x + R * c, y + R * v]);
      }
      const V = (p, z) => [p[0], p[1], z];
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        quad(
          V(outer[k], z2),
          V(outer[j], z2),
          V(large[j], z2),
          V(large[k], z2),
        );
        quad(
          V(outer[k], z0),
          V(small[k], z0),
          V(small[j], z0),
          V(outer[j], z0),
        );
        quad(
          V(small[k], z0),
          V(small[k], z1),
          V(small[j], z1),
          V(small[j], z0),
        );
        quad(
          V(small[k], z1),
          V(large[k], z2),
          V(large[j], z2),
          V(small[j], z1),
        );
        const a = outer[k],
          b = outer[j],
          near = (a, b) => Math.abs(a - b) < 1e-7;
        const boundary =
          (h.i === m.i0 &&
            near(a[0], x - s.pitch / 2) &&
            near(b[0], x - s.pitch / 2)) ||
          (h.i === m.i1 &&
            near(a[0], x + s.pitch / 2) &&
            near(b[0], x + s.pitch / 2)) ||
          (h.j === m.j0 &&
            near(a[1], y - s.pitch / 2) &&
            near(b[1], y - s.pitch / 2)) ||
          (h.j === m.j1 &&
            near(a[1], y + s.pitch / 2) &&
            near(b[1], y + s.pitch / 2));
        if (boundary) {
          // A solid 2 mm perimeter frame keeps the outermost recesses away from thin edges.
          const extend = (p) => [
              near(p[0], m.rim)
                ? 0
                : near(p[0], m.width - m.rim)
                  ? m.width
                  : p[0],
              near(p[1], m.rim)
                ? 0
                : near(p[1], m.height - m.rim)
                  ? m.height
                  : p[1],
            ],
            A = extend(a),
            B = extend(b);
          quad(V(a, z2), V(A, z2), V(B, z2), V(b, z2));
          quad(V(a, z0), V(b, z0), V(B, z0), V(A, z0));
          quad(V(A, z0), V(B, z0), V(B, z2), V(A, z2));
        }
      }
    }
    return t;
  }
  function pinsTriangles(m, segments = 64) {
    if (m.settings.adaptive)
      throw Error("自適應底板的支撐桿已融合，請下載底板");
    if (m.errors.length || m.unmounted.length)
      throw Error([...m.errors, ...m.warnings].join("；"));
    if (!m.pins.length) throw Error("沒有可列印的支撐桿");
    const t = [],
      tri = (a, b, c) => t.push([a, b, c]);
    let nextX = 0;
    for (const p of m.pins) {
      const profile = pinProfile(p, m),
        minZ = profile[0][1],
        x = nextX + p.collar / 2,
        y = p.collar / 2;
      const point = (r, z, k) => [
        x + r * Math.cos((TAU * k) / segments),
        y + r * Math.sin((TAU * k) / segments),
        z - minZ,
      ];
      for (let l = 0; l < profile.length - 1; l++) {
        const [r, z] = profile[l],
          [R, Z] = profile[l + 1];
        if (Math.abs(r - R) + Math.abs(z - Z) < 1e-8) continue;
        for (let k = 0; k < segments; k++) {
          const j = (k + 1) % segments,
            a = point(r, z, k),
            b = point(r, z, j),
            c = point(R, Z, j),
            d = point(R, Z, k);
          tri(a, b, c);
          tri(a, c, d);
        }
      }
      for (let k = 0; k < segments; k++) {
        const j = (k + 1) % segments,
          [r, z] = profile[0],
          [R, Z] = profile.at(-1);
        tri([x, y, 0], point(r, z, j), point(r, z, k));
        tri([x, y, Z - minZ], point(R, Z, k), point(R, Z, j));
      }
      nextX += p.collar + 8;
    }
    return t;
  }
  function adaptiveTriangles(m, n = 64) {
    if (m.errors.length) throw Error(m.errors.join("；"));
    const t = [],
      s = m.settings,
      tri = (a, b, c) => t.push([a, b, c]),
      quad = (a, b, c, d) => {
        tri(a, b, c);
        tri(a, c, d);
      },
      V = (p, z) => [p[0] - m.x0, p[1] - m.y0, z - m.bottom],
      ring = (x, y, r) =>
        Array.from({ length: n }, (_, i) => [
          x + r * Math.cos((TAU * i) / n),
          y + r * Math.sin((TAU * i) / n),
        ]),
      outer = m.outline;
    const pins = m.pins.map((p) => ({
        p,
        profile: pinProfile(p, m),
        base: ring(p.x, p.y, p.collar / 2),
      })),
      holes = m.holes.map((h) => ({
        h,
        low: ring(h.x, h.y, m.hole / 2),
        high: ring(h.x, h.y, m.recessDiameter / 2),
      }));
    function cap(z, loops, up) {
      const points = [...outer, ...loops.flat()],
        starts = [],
        flat = points.flat();
      let offset = outer.length;
      for (const loop of loops) {
        starts.push(offset);
        offset += loop.length;
      }
      const indices = globalThis.GearEarcut(flat, starts, 2);
      for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = indices.slice(i, i + 3).map((k) => V(points[k], z));
        up ? tri(a, b, c) : tri(a, c, b);
      }
    }
    cap(
      m.bottom,
      holes.map((h) => h.low),
      false,
    );
    cap(m.top, [...pins.map((p) => p.base), ...holes.map((h) => h.high)], true);
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      quad(
        V(outer[i], m.bottom),
        V(outer[j], m.bottom),
        V(outer[j], m.top),
        V(outer[i], m.top),
      );
    }
    for (const { h, low, high } of holes)
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        quad(
          V(low[i], m.bottom),
          V(low[i], m.top - s.recess),
          V(low[j], m.top - s.recess),
          V(low[j], m.bottom),
        );
        quad(
          V(low[i], m.top - s.recess),
          V(high[i], m.top),
          V(high[j], m.top),
          V(low[j], m.top - s.recess),
        );
      }
    for (const { p, profile } of pins) {
      for (let k = 0; k < profile.length - 1; k++) {
        const [r, z] = profile[k],
          [R, Z] = profile[k + 1],
          low = ring(p.x, p.y, r),
          high = ring(p.x, p.y, R);
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          quad(V(low[i], z), V(low[j], z), V(high[j], Z), V(high[i], Z));
        }
      }
      const [r, z] = profile.at(-1),
        top = ring(p.x, p.y, r);
      for (let i = 0; i < n; i++)
        tri(V([p.x, p.y], z), V(top[i], z), V(top[(i + 1) % n], z));
    }
    return t;
  }
  function stl(tris, label) {
    const out = new Uint8Array(84 + 50 * tris.length),
      dv = new DataView(out.buffer);
    out.set(
      new TextEncoder().encode("Gear Workbench " + label + " | millimeters"),
    );
    dv.setUint32(80, tris.length, true);
    let k = 84;
    for (const v of tris) {
      const u = v[1].map((n, i) => n - v[0][i]),
        w = v[2].map((n, i) => n - v[0][i]),
        n = [
          u[1] * w[2] - u[2] * w[1],
          u[2] * w[0] - u[0] * w[2],
          u[0] * w[1] - u[1] * w[0],
        ],
        len = Math.hypot(...n);
      if (len < 1e-12) throw Error("底盤網格含退化三角形");
      for (const a of [n.map((n) => n / len), ...v])
        for (const x of a) {
          dv.setFloat32(k, x, true);
          k += 4;
        }
      dv.setUint16(k, 0, true);
      k += 2;
    }
    return out;
  }
  const makeSTL = (m, part = "board") =>
    stl(part === "board" ? boardTriangles(m) : pinsTriangles(m), part);
  return {
    defaults,
    normalize,
    build,
    pinProfile,
    boardTriangles,
    pinsTriangles,
    makeSTL,
  };
})();
