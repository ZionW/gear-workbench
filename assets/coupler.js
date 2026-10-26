/* Round motor socket + straight hexagonal male plug; all dimensions in mm. */
globalThis.GearCoupler = (() => {
  const E = globalThis.GearEngine;
  const presets = {
    drawing1: {
      name: "圖一・雙扁減速馬達軸",
      diameter: 5.2,
      acrossFlats: 3.6,
      shaftLength: 9.3,
    },
    drawing2: {
      name: "圖二・雙扁步進馬達軸",
      diameter: 5,
      acrossFlats: 4,
      shaftLength: 9.5,
    },
  };
  function presetPatch(g, id) {
    const p = presets[id];
    if (!p) throw Error("請選擇馬達軸預設");
    const allowance = 0.2,
      axial = 0.3,
      bore = Math.max(
        g.bore,
        Math.ceil(
          (p.diameter + allowance + 2.4 + (g.hexClearance ?? 0.3) - 1e-9) * 10,
        ) / 10,
      );
    return {
      coupler: true,
      motorPreset: id,
      motorShape: "double-d",
      motorShaft: p.diameter,
      motorFlat: (p.diameter - p.acrossFlats) / 2,
      motorAllowance: allowance,
      motorDepth: p.shaftLength + axial,
      motorLength: Math.max(g.motorLength ?? 12, p.shaftLength + axial + 1.2),
      bore,
    };
  }
  function dimensions(g) {
    const flats = g.bore - (g.hexClearance ?? 0.3),
      shaft = (g.motorShaft ?? 3) + (g.motorAllowance ?? 0),
      insert = Math.min(g.hexLength ?? 6, g.width),
      neck = insert + 0.5,
      body = g.motorLength ?? 12,
      radius = Math.max(
        flats / Math.sqrt(3) + 0.8,
        shaft / 2 + (g.couplerWall ?? 2),
      );
    const shape = ["d", "double-d"].includes(g.motorShape)
        ? g.motorShape
        : "round",
      flat = g.motorFlat ?? 0.5,
      depth = g.motorDepth ?? 0,
      holeFloor = depth > 0 ? neck + body - depth : 0;
    return {
      flats,
      shaft,
      insert,
      neck,
      body,
      radius,
      height: neck + body,
      shape,
      flat,
      depth,
      holeFloor,
    };
  }
  function errors(g) {
    const d = dimensions(g),
      out = [];
    if (!["spur", "helical"].includes(g.type)) out.push("聯軸器僅支援外齒輪");
    for (const [k, v, min, max] of [
      ["馬達軸徑", g.motorShaft ?? 3, 1, 12],
      ["馬達孔補償", g.motorAllowance ?? 0, -0.2, 0.6],
      ["六角對邊間隙", g.hexClearance ?? 0.3, 0.1, 0.8],
      ["插入長度", g.hexLength ?? 6, 2, 30],
      ["馬達座長", g.motorLength ?? 12, 5, 40],
      ["外壁厚", g.couplerWall ?? 2, 1.2, 8],
    ])
      if (!Number.isFinite(v) || v < min || v > max)
        out.push(k + " 超出範圍 " + min + "–" + max + " mm");
    if (
      g.motorShape !== undefined &&
      !["round", "d", "double-d"].includes(g.motorShape)
    )
      out.push("未知馬達軸形狀");
    if (
      !Number.isFinite(d.depth) ||
      d.depth < 0 ||
      d.depth > Math.max(0, d.body - 1.2)
    )
      out.push("插入深度需為 0（貫通）或不超過馬達座長減 1.2 mm");
    if (
      d.shape !== "round" &&
      (!Number.isFinite(d.flat) || d.flat < 0.1 || d.flat >= d.shaft / 2 - 0.05)
    )
      out.push("D 型削平量需至少 0.1 mm，並小於軸半徑減 0.05 mm");
    if (d.flats - d.shaft < 2.4 - 1e-8)
      out.push("六角對邊尺寸需大於馬達孔至少 2.4 mm，以保留壁厚");
    if (d.insert < 2) out.push("齒輪厚度至少 2 mm 才能插入聯軸器");
    if (d.radius > E.dims(g).root - 0.6)
      out.push("聯軸器外徑超過齒輪齒根內的可用範圍");
    return out;
  }
  function minimumBore(g, s) {
    const d = dimensions(g),
      gap = Math.max(0.4, s.shaftClearance),
      cylinder = s.plug + 1.8 * s.recess;
    return (
      Math.ceil(
        Math.max(cylinder + gap, d.shaft + 2.4 + (g.hexClearance ?? 0.3)) * 100,
      ) / 100
    );
  }
  function extension(g, z) {
    if (!g.couplerMount) return null;
    const m = g.mountContext;
    if (!m?.settings?.enabled)
      throw Error(g.name + "：請先啟用底盤，再使用聯軸器底盤延伸");
    if (m.errors?.length) throw Error("底盤尺寸無效");
    if (
      !m.settings.adaptive &&
      Math.hypot(
        g.x - Math.round(g.x / m.settings.pitch) * m.settings.pitch,
        g.y - Math.round(g.y / m.settings.pitch) * m.settings.pitch,
      ) > 0.05
    )
      throw Error(g.name + "：聯軸器延伸軸未對準底盤孔位，請先對齊孔位");
    const gap = Math.max(0.4, m.settings.shaftClearance),
      collar = m.settings.plug + 1.8 * m.settings.recess;
    if (g.bore < minimumBore(g, m.settings) - 1e-8)
      throw Error("六角孔需大於連接圓柱直徑與列印間隙");
    const pin = { z: g.z - gap, width: g.width, collar, shaft: collar },
      profile = globalThis.GearMount.pinProfile(pin, {
        ...m,
        settings: { ...m.settings, adaptive: false },
      })
        .slice(0, 6)
        .map(([r, Z], i) => [i < 4 ? Math.max(0.5, r - gap / 2) : r, Z - z]);
    return {
      profile,
      start: profile.at(-1)[1],
      gap,
      collar,
      plug: 2 * profile[1][0],
    };
  }
  function poses(gears) {
    return gears
      .filter((g) => g.coupler === true)
      .map((g) => {
        const e = errors(g);
        if (e.length) throw Error(g.name + "：" + e.join("；"));
        const d = dimensions(g),
          z = g.z + g.width - d.insert,
          support = extension(g, z);
        if (support) d.holeFloor = Math.max(1.2, d.holeFloor);
        return {
          support,
          id: g.id + "-coupler",
          name: g.name + " 聯軸器",
          type: "coupler",
          x: g.x,
          y: g.y,
          z,
          rotation: g.rotation || 0,
          width: d.height,
          ...d,
        };
      });
  }
  function fitSamples(gear) {
    if (!gear.coupler) throw Error("請先啟用聯軸器");
    const current = gear.motorAllowance ?? 0,
      allowances = [current - 0.1, current, current + 0.1]
        .map((v) => Number(v.toFixed(3)))
        .filter((v) => v >= -0.2 && v <= 0.6);
    return allowances.map((allowance) => {
      const source = { ...gear, motorAllowance: allowance },
        d = dimensions(source),
        flats = d.shaft + 2.4;
      return {
        id: gear.id + "-fit-" + allowance,
        name: gear.name + " 試配",
        type: "coupler",
        x: 0,
        y: 0,
        z: 0,
        rotation: 0,
        width: 5,
        ...d,
        allowance,
        neck: 0,
        body: 5,
        height: 5,
        depth: 0,
        holeFloor: 0,
        insert: 0,
        flats,
        radius: Math.max(flats / Math.sqrt(3) + 0.3, d.shaft / 2 + 2),
      };
    });
  }
  function geometry(p) {
    return {
      g: p,
      d: { twist: 0 },
      outer: { kind: "circle", r: p.radius },
      inner:
        p.shape !== "round"
          ? { kind: p.shape, r: p.shaft / 2, flat: p.flat }
          : { kind: "circle", r: p.shaft / 2 },
      coupler: {
        neck: p.neck,
        holeFloor: p.holeFloor || 0,
        hex: E.polygon(E.hexPoints(p.flats)),
      },
    };
  }
  function socketRadius(p, a) {
    const r = p.shaft / 2,
      c = r - p.flat,
      k = p.shape === "double-d" ? Math.abs(Math.cos(a)) : Math.cos(a);
    return p.shape !== "round" && k > 0 ? Math.min(r, c / k) : r;
  }
  function socketSegments(p) {
    const r = p.shaft / 2,
      c = r - p.flat,
      h = Math.sqrt(r * r - c * c),
      a = Math.acos(c / r),
      arc = (start, end) => ({
        kind: "arc",
        start: [r * Math.cos(start), r * Math.sin(start)],
        end: [r * Math.cos(end), r * Math.sin(end)],
        a0: start,
        a1: end,
      }),
      line = (start, end) => ({ kind: "line", start, end });
    return p.shape === "double-d"
      ? [
          arc(a, Math.PI - a),
          line([-c, h], [-c, -h]),
          arc(Math.PI + a, 2 * Math.PI - a),
          line([c, -h], [c, h]),
        ]
      : [arc(a, 2 * Math.PI - a), line([c, -h], [c, h])];
  }
  function socketPoints(p, segments = 96) {
    const r = p.shaft / 2;
    if (p.shape === "round" || !p.shape)
      return E.sample({ kind: "circle", r, segments });
    const points = [];
    for (const part of socketSegments(p)) {
      if (part.kind === "line") points.push(part.start);
      else {
        const n = Math.max(
          4,
          Math.ceil((segments * (part.a1 - part.a0)) / (2 * Math.PI)),
        );
        for (let i = 0; i < n; i++) {
          const a = part.a0 + ((part.a1 - part.a0) * i) / n;
          points.push([r * Math.cos(a), r * Math.sin(a)]);
        }
      }
    }
    return points;
  }
  function triangles(p) {
    const angles = Array.from({ length: 96 }, (_, i) => (2 * Math.PI * i) / 96);
    if (p.shape === "d" || p.shape === "double-d") {
      const a = Math.acos((p.shaft / 2 - p.flat) / (p.shaft / 2));
      for (const angle of p.shape === "double-d"
        ? [a, Math.PI - a, Math.PI + a, 2 * Math.PI - a]
        : [a, 2 * Math.PI - a])
        if (!angles.some((v) => Math.abs(v - angle) < 1e-8)) angles.push(angle);
      angles.sort((a, b) => a - b);
    }
    const n = angles.length,
      out = [],
      hex = (a) => E.hexRadius(p.flats, a),
      W = (r, z, i) => {
        const a = angles[i % n],
          v = E.rot([r * Math.cos(a), r * Math.sin(a)], p.rotation || 0);
        return [p.x + v[0], p.y + v[1], p.z + z];
      },
      tri = (a, b, c) => {
        const u = b.map((v, i) => v - a[i]),
          v = c.map((v, i) => v - a[i]);
        if (
          Math.hypot(
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ) > 1e-10
        )
          out.push([a, b, c]);
      },
      quad = (a, b, c, d) => {
        tri(a, b, c);
        tri(a, c, d);
      },
      floor = p.holeFloor || 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n,
        r = hex(angles[i]),
        R = hex(angles[j]),
        inner = socketRadius(p, angles[i]),
        next = socketRadius(p, angles[j]);
      quad(
        W(r, p.support?.start || 0, i),
        W(R, p.support?.start || 0, j),
        W(R, p.neck, j),
        W(r, p.neck, i),
      );
      quad(
        W(p.radius, p.neck, i),
        W(p.radius, p.neck, j),
        W(p.radius, p.height, j),
        W(p.radius, p.height, i),
      );
      if (p.support) {
        const profile = p.support.profile;
        for (let k = 0; k < profile.length - 1; k++) {
          const [a, z] = profile[k],
            [b, Z] = profile[k + 1];
          quad(W(a, z, i), W(a, z, j), W(b, Z, j), W(b, Z, i));
        }
        const [bottom, bz] = profile[0],
          [top, tz] = profile.at(-1);
        tri(W(0, bz, i), W(bottom, bz, j), W(bottom, bz, i));
        quad(W(top, tz, i), W(top, tz, j), W(R, tz, j), W(r, tz, i));
      } else
        quad(
          W(r, 0, i),
          W(floor > 0 ? 0 : inner, 0, i),
          W(floor > 0 ? 0 : next, 0, j),
          W(R, 0, j),
        );
      quad(
        W(p.radius, p.neck, i),
        W(r, p.neck, i),
        W(R, p.neck, j),
        W(p.radius, p.neck, j),
      );
      quad(
        W(p.radius, p.height, i),
        W(p.radius, p.height, j),
        W(next, p.height, j),
        W(inner, p.height, i),
      );
      quad(
        W(inner, floor, i),
        W(inner, p.height, i),
        W(next, p.height, j),
        W(next, floor, j),
      );
      if (floor > 0) tri(W(0, floor, i), W(inner, floor, i), W(next, floor, j));
    }
    return out;
  }

  return {
    presets,
    presetPatch,
    minimumBore,
    fitSamples,
    dimensions,
    errors,
    poses,
    geometry,
    socketRadius,
    socketPoints,
    socketSegments,
    triangles,
  };
})();
