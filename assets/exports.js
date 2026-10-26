globalThis.GearExports = (() => {
  const E = globalThis.GearEngine,
    { TAU, rot, numberText: num } = E;
  const world = (p, xy, z = 0) => {
      const a = rot(xy, p.rotation || 0);
      return [a[0] + p.x, a[1] + p.y, p.z + z];
    },
    ref = (a) => "(" + a.join(",") + ")";
  function makeSVG(poses) {
    const pieces = [],
      bounds = [];
    for (const p of poses) {
      const g = E.geometry(p),
        parts = [];
      for (const c of [g.outer, g.inner].filter(Boolean)) {
        if (c.kind === "circle")
          parts.push(
            `M${c.r},0 A${c.r},${c.r} 0 1 0 ${-c.r},0 A${c.r},${c.r} 0 1 0 ${c.r},0 Z`,
          );
        else {
          let d = "M" + c.poles[0].map(num).join(",");
          for (let i = 0; i < c.n; i++)
            d +=
              " C" +
              c.poles
                .slice(i * 3 + 1, i * 3 + 4)
                .map((a) => a.map(num).join(","))
                .join(" ");
          parts.push(d + "Z");
        }
      }
      for (const v of E.sample(g.outer, 1)) bounds.push(world(p, v));
      pieces.push(
        `<g transform="translate(${p.x},${-p.y}) rotate(${-E.deg(p.rotation || 0)}) scale(1,-1)"><path d="${parts.join(" ")}" fill="none" stroke="black" stroke-width="0.1"/>${(globalThis.GearLettering?.layout(p).paths || []).map((path) => `<path data-role="engrave" d="M${path.map((v) => v.map(num).join(",")).join(" L")}" fill="none" stroke="#245fba" stroke-width="0.1"/>`).join("")}</g>`,
      );
    }
    const xs = bounds.map((v) => v[0]),
      ys = bounds.map((v) => -v[1]),
      x = Math.min(...xs),
      y = Math.min(...ys),
      w = Math.max(...xs) - x,
      h = Math.max(...ys) - y;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${x - 0.1} ${y - 0.1} ${w + 0.2} ${h + 0.2}"><title>Gear Workbench; mm; approximate geometry</title>${pieces.join("")}</svg>`;
  }
  function makeDXF(poses) {
    const a = [
        "0",
        "SECTION",
        "2",
        "HEADER",
        "9",
        "$ACADVER",
        "1",
        "AC1027",
        "9",
        "$INSUNITS",
        "70",
        "4",
        "0",
        "ENDSEC",
        "0",
        "SECTION",
        "2",
        "TABLES",
        "0",
        "TABLE",
        "2",
        "LAYER",
        "70",
        "2",
        "0",
        "LAYER",
        "2",
        "CUT",
        "70",
        "0",
        "62",
        "7",
        "6",
        "CONTINUOUS",
        "0",
        "LAYER",
        "2",
        "ENGRAVE",
        "70",
        "0",
        "62",
        "5",
        "6",
        "CONTINUOUS",
        "0",
        "ENDTAB",
        "0",
        "ENDSEC",
        "0",
        "SECTION",
        "2",
        "ENTITIES",
      ],
      put = (c, v) => a.push(String(c), String(v));
    for (const p of poses) {
      const g = E.geometry(p);
      for (const c of [g.outer, g.inner].filter(Boolean)) {
        put(0, c.kind === "circle" ? "CIRCLE" : "SPLINE");
        put(100, "AcDbEntity");
        put(8, "CUT");
        put(100, c.kind === "circle" ? "AcDbCircle" : "AcDbSpline");
        if (c.kind === "circle") {
          put(10, p.x);
          put(20, p.y);
          put(30, 0);
          put(40, c.r);
        } else {
          put(210, 0);
          put(220, 0);
          put(230, 1);
          put(70, 9);
          put(71, 3);
          put(72, c.poles.length + 4);
          put(73, c.poles.length);
          put(74, 0);
          put(42, 1e-9);
          put(43, 1e-9);
          for (let i = 0; i <= c.n; i++)
            for (let j = 0; j < (i === 0 || i === c.n ? 4 : 3); j++) put(40, i);
          for (const v of c.poles) {
            const W = world(p, v);
            put(10, num(W[0]));
            put(20, num(W[1]));
            put(30, 0);
          }
        }
      }
    }
    for (const p of poses)
      for (const path of globalThis.GearLettering?.layout(p).paths || []) {
        put(0, "LWPOLYLINE");
        put(100, "AcDbEntity");
        put(8, "ENGRAVE");
        put(100, "AcDbPolyline");
        put(90, path.length);
        put(70, 0);
        for (const v of path) {
          const w = world(p, v);
          put(10, num(w[0]));
          put(20, num(w[1]));
        }
      }
    a.push("0", "ENDSEC", "0", "EOF");
    return a.join("\n") + "\n";
  }
  function earClip(points) {
    const ix = points.map((_, i) => i),
      tris = [],
      cross = (A, B, C) =>
        (B[0] - A[0]) * (C[1] - B[1]) - (B[1] - A[1]) * (C[0] - B[0]),
      inTri = (P, A, B, C) =>
        cross(A, B, P) > -1e-10 &&
        cross(B, C, P) > -1e-10 &&
        cross(C, A, P) > -1e-10;
    let tries = 0;
    while (ix.length > 3) {
      let found = false;
      for (let i = 0; i < ix.length; i++) {
        const a = ix[(i + ix.length - 1) % ix.length],
          b = ix[i],
          c = ix[(i + 1) % ix.length];
        if (cross(points[a], points[b], points[c]) <= 1e-10) continue;
        if (
          ix.some(
            (j) =>
              j !== a &&
              j !== b &&
              j !== c &&
              inTri(points[j], points[a], points[b], points[c]),
          )
        )
          continue;
        tris.push([a, b, c]);
        ix.splice(i, 1);
        found = true;
        break;
      }
      if (!found || tries++ > points.length)
        throw Error("齒條輪廓無法三角化，請調整規格");
    }
    tris.push(ix);
    return tris;
  }
  function makeSTL(poses) {
    const tris = [];
    function tri(A, B, C) {
      const u = B.map((x, i) => x - A[i]),
        v = C.map((x, i) => x - A[i]),
        N = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ],
        l = Math.hypot(...N);
      if (l > 1e-10) tris.push({ v: [A, B, C], n: N.map((x) => x / l) });
    }
    for (const p of poses) {
      if (p.type === "coupler") {
        for (const t of globalThis.GearCoupler.triangles(p)) tri(...t);
        continue;
      }
      const geom = E.geometry(p),
        twist = geom.d.twist,
        b = p.width;
      let O, I;
      if (p.type === "internal") {
        I = E.sample(geom.inner, 2);
        O = I.map(([x, y]) => {
          const a = Math.atan2(y, x);
          return [geom.outer.r * Math.cos(a), geom.outer.r * Math.sin(a)];
        });
      } else {
        O = E.sample(geom.outer, 2);
        if (geom.pocket || p.coupler === true) {
          const angle = (v) => Math.atan2(v[1], v[0]);
          O.sort((a, b) => angle(a) - angle(b));
          O = O.filter(
            (v, i, arr) => i === 0 || angle(v) - angle(arr[i - 1]) > 1e-5,
          );
          if (O.length > 1 && angle(O[0]) + TAU - angle(O.at(-1)) < 1e-5)
            O.pop();
        }
        if (p.coupler === true) {
          const angle = (v) => (Math.atan2(v[1], v[0]) + TAU) % TAU;
          O.sort((a, b) => angle(a) - angle(b));
          for (let k = 0; k < 6; k++) {
            const a = (TAU * k) / 6;
            if (O.some((v) => Math.abs(angle(v) - a) < 1e-7)) continue;
            let j = O.findIndex((v) => angle(v) > a);
            if (j < 0) j = 0;
            const A = O[(j + O.length - 1) % O.length],
              B = O[j],
              D = [Math.cos(a), Math.sin(a)],
              u = [B[0] - A[0], B[1] - A[1]],
              cross = (a, b) => a[0] * b[1] - a[1] * b[0],
              t = -cross(A, D) / cross(u, D);
            O.push([A[0] + t * u[0], A[1] + t * u[1]]);
            O.sort((a, b) => angle(a) - angle(b));
          }
        }
        I = geom.inner
          ? O.map(([x, y]) => {
              const l = Math.hypot(x, y),
                r =
                  p.coupler === true
                    ? E.hexRadius(p.bore, Math.atan2(y, x))
                    : geom.inner.r;
              return [(x / l) * r, (y / l) * r];
            })
          : O.map(() => [0, 0]);
      }
      if (p.type === "rack") {
        // Remove exactly collinear perimeter samples before both the caps and side wall.
        let changed = true;
        while (changed) {
          changed = false;
          O = O.filter((B, i) => {
            const A = O[(i + O.length - 1) % O.length],
              C = O[(i + 1) % O.length],
              cross =
                (B[0] - A[0]) * (C[1] - B[1]) - (B[1] - A[1]) * (C[0] - B[0]);
            if (Math.abs(cross) < 1e-10) {
              changed = true;
              return false;
            }
            return true;
          });
        }
        const cap = earClip(O);
        for (const [i, j, k] of cap) {
          tri(world(p, O[i], b), world(p, O[j], b), world(p, O[k], b));
          tri(world(p, O[i]), world(p, O[k]), world(p, O[j]));
        }
        for (let i = 0; i < O.length; i++) {
          const j = (i + 1) % O.length;
          tri(world(p, O[i]), world(p, O[j]), world(p, O[j], b));
          tri(world(p, O[i]), world(p, O[j], b), world(p, O[i], b));
        }
        continue;
      }
      let shift = 0;
      if (p.coupler === true) {
        const angle = Math.atan2(I[0][1], I[0][0]) + twist;
        let best = Infinity;
        I.forEach((v, i) => {
          const d = Math.abs(
            Math.atan2(
              Math.sin(Math.atan2(v[1], v[0]) - angle),
              Math.cos(Math.atan2(v[1], v[0]) - angle),
            ),
          );
          if (d < best) {
            best = d;
            shift = i;
          }
        });
      }
      const levels = Math.max(1, Math.ceil(Math.abs(twist) / E.rad(2))),
        V = (v, z) => world(p, rot(v, (twist * z) / b), z),
        VI = (v, z) => (p.coupler === true ? world(p, v, z) : V(v, z)),
        n = O.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n,
          A = V(O[i], b),
          B = V(O[j], b),
          C = VI(I[(i + shift) % n], b),
          D = VI(I[(j + shift) % n], b),
          F = V(O[i], 0),
          G = V(O[j], 0),
          H = VI(I[i], 0),
          J = VI(I[j], 0);
        if (geom.pocket) {
          const pocket = geom.pocket,
            radial = (k, r) => {
              const len = Math.hypot(...O[k]);
              return O[k].map((x) => (x / len) * r);
            },
            P = (k, r, z) => {
              const v = V(radial(k, r), b);
              v[2] = p.z + z;
              return v;
            },
            u = P(i, pocket.outer, b),
            v = P(j, pocket.outer, b),
            h = P(i, pocket.inner, b),
            k = P(j, pocket.inner, b),
            U = P(i, pocket.outer, pocket.floor),
            W = P(j, pocket.outer, pocket.floor),
            H = P(i, pocket.inner, pocket.floor),
            K = P(j, pocket.inner, pocket.floor);
          tri(A, B, v);
          tri(A, v, u);
          tri(h, k, D);
          tri(h, D, C);
          tri(U, W, K);
          tri(U, K, H);
          tri(U, u, v);
          tri(U, v, W);
          tri(H, K, k);
          tri(H, k, h);
        } else {
          tri(A, B, D);
          tri(A, D, C);
        }
        tri(F, J, G);
        tri(F, H, J);
        for (let z = 0; z < levels; z++) {
          const z0 = (b * z) / levels,
            z1 = (b * (z + 1)) / levels;
          tri(V(O[i], z0), V(O[j], z0), V(O[j], z1));
          tri(V(O[i], z0), V(O[j], z1), V(O[i], z1));
          if (geom.inner) {
            tri(VI(I[i], z0), VI(I[i], z1), VI(I[j], z1));
            tri(VI(I[i], z0), VI(I[j], z1), VI(I[j], z0));
          }
        }
      }
    }
    if (tris.length > 1500000)
      throw Error("組合網格超過 150 萬三角形，請選單顆或降低齒數");
    const out = new Uint8Array(84 + 50 * tris.length),
      dv = new DataView(out.buffer);
    out.set(
      new TextEncoder().encode(
        "Gear Workbench | millimeters | approximate geometry",
      ),
    );
    dv.setUint32(80, tris.length, true);
    let k = 84;
    for (const t of tris) {
      for (const v of [t.n, ...t.v])
        for (const x of v) {
          dv.setFloat32(k, x, true);
          k += 4;
        }
      dv.setUint16(k, 0, true);
      k += 2;
    }
    return out;
  }
  function makeSTEP(poses) {
    const rows = [],
      add = (s) => {
        rows.push(s);
        return "#" + rows.length;
      },
      pt = (a) => add(`CARTESIAN_POINT('',(${a.map(num).join(",")}))`),
      dir = (a) => add(`DIRECTION('',(${a.map(num).join(",")}))`),
      vec = (a, l = 1) => add(`VECTOR('',${dir(a)},${num(l)})`),
      ax = (a, angle = 0) =>
        add(
          `AXIS2_PLACEMENT_3D('',${pt(a)},${dir([0, 0, 1])},${dir([Math.cos(angle), Math.sin(angle), 0])})`,
        ),
      line = (a, v) => add(`LINE('',${pt(a)},${vec(v)})`),
      edge = (v1, v2, c) => add(`EDGE_CURVE('',${v1},${v2},${c},.T.)`),
      orient = (e, pos = true) =>
        add(`ORIENTED_EDGE('',*,*,${e},.${pos ? "T" : "F"}.)`),
      bound = (es, pos = true) =>
        add(
          `FACE_BOUND('',${add(`EDGE_LOOP('',${ref(es)})`)},.${pos ? "T" : "F"}.)`,
        ),
      face = (bounds, s, pos = true) =>
        add(`ADVANCED_FACE('',${ref(bounds)},${s},.${pos ? "T" : "F"}.)`),
      mult = (n) =>
        Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? 4 : 3)),
      knots = (n) => Array.from({ length: n + 1 }, (_, i) => num(i));
    const app = add(
      "APPLICATION_CONTEXT('core data for automotive mechanical design processes')",
    );
    add(
      `APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${app})`,
    );
    const pc = add(`PRODUCT_CONTEXT('',${app},'mechanical')`),
      prod = add(
        `PRODUCT('Gear assembly','Gear assembly','approximate tooth profiles',(${pc}))`,
      ),
      form = add(`PRODUCT_DEFINITION_FORMATION('','',${prod})`),
      pdc = add(
        `PRODUCT_DEFINITION_CONTEXT('part definition',${app},'design')`,
      ),
      pd = add(`PRODUCT_DEFINITION('design','',${form},${pdc})`),
      pds = add(`PRODUCT_DEFINITION_SHAPE('','',${pd})`),
      units = add("( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )"),
      ang = add("( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )"),
      sa = add("( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )"),
      unc = add(
        `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),${units},'distance_accuracy_value','')`,
      ),
      ctx = add(
        `( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${units},${ang},${sa})) REPRESENTATION_CONTEXT('','') )`,
      ),
      ctx2 = add(
        "( GEOMETRIC_REPRESENTATION_CONTEXT(2) PARAMETRIC_REPRESENTATION_CONTEXT() REPRESENTATION_CONTEXT('','') )",
      );
    const pcurve = (s, c) =>
        add(
          `PCURVE('',${s},${add(`DEFINITIONAL_REPRESENTATION('',(${c}),${ctx2})`)})`,
        ),
      sc = (c, pcs, seam = false) =>
        add(
          `${seam ? "SEAM_CURVE" : "SURFACE_CURVE"}('',${c},${ref(pcs)},.PCURVE_S1.)`,
        ),
      splineCurve = (poles, n, closed) =>
        add(
          `B_SPLINE_CURVE_WITH_KNOTS('',3,${ref(poles.map(pt))},.UNSPECIFIED.,.${closed ? "T" : "F"}.,.F.,(${mult(n)}),(${knots(n)}),.UNSPECIFIED.)`,
        ),
      solids = [];
    function supportedCoupler(p) {
      const C = globalThis.GearCoupler,
        faces = [],
        circle = (r, z) => {
          const A = [p.x + r, p.y, p.z + z],
            v = add(`VERTEX_POINT('',${pt(A)})`),
            e = edge(
              v,
              v,
              add(`CIRCLE('',${ax([p.x, p.y, p.z + z])},${num(r)})`),
            );
          return {
            z,
            r,
            points: [A],
            vertices: [v],
            edges: [e],
            parts: [{ kind: "arc" }],
          };
        },
        polygon = (points, z, parts = null) => {
          const P = points.map((v) => world(p, v, z)),
            vertices = P.map((A) => add(`VERTEX_POINT('',${pt(A)})`));
          const es = P.map((A, i) => {
            const j = (i + 1) % P.length,
              B = P[j],
              u = B.map((v, k) => v - A[k]),
              l = Math.hypot(...u);
            return edge(
              vertices[i],
              vertices[j],
              parts?.[i]?.kind === "arc"
                ? add(
                    `CIRCLE('',${ax([p.x, p.y, p.z + z], p.rotation || 0)},${num(p.shaft / 2)})`,
                  )
                : line(
                    A,
                    u.map((v) => v / l),
                  ),
            );
          });
          return { z, points: P, vertices, edges: es, parts };
        },
        loop = (ring, hole = false) =>
          bound(
            ring.edges.map((e) => orient(e)),
            !hole,
          ),
        cap = (outer, inner = null, up = true) =>
          faces.push(
            face(
              [loop(outer), ...(inner ? [loop(inner, true)] : [])],
              add(`PLANE('',${ax([p.x, p.y, p.z + outer.z])})`),
              up,
            ),
          ),
        band = (low, high, hole = false) => {
          const n = low.edges.length,
            vertical = low.points.map((A, i) => {
              const B = high.points[i],
                u = B.map((v, k) => v - A[k]),
                l = Math.hypot(...u);
              return edge(
                low.vertices[i],
                high.vertices[i],
                line(
                  A,
                  u.map((v) => v / l),
                ),
              );
            });
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n,
              A = low.points[i],
              arc = low.r !== undefined || low.parts?.[i]?.kind === "arc";
            let surface;
            if (arc && low.r !== undefined && Math.abs(low.r - high.r) > 1e-8) {
              const B = high.points[i],
                u = B.map((v, k) => v - A[k]),
                l = Math.hypot(...u);
              surface = add(
                `SURFACE_OF_REVOLUTION('',${line(
                  A,
                  u.map((v) => v / l),
                )},${add(`AXIS1_PLACEMENT('',${pt([p.x, p.y, 0])},${dir([0, 0, 1])})`)})`,
              );
            } else if (arc)
              surface = add(
                `CYLINDRICAL_SURFACE('',${ax([p.x, p.y, p.z + low.z])},${num(low.r ?? p.shaft / 2)})`,
              );
            else {
              const B = low.points[j],
                u = B.map((v, k) => v - A[k]),
                l = Math.hypot(...u),
                U = u.map((v) => v / l);
              surface = add(
                `PLANE('',${add(`AXIS2_PLACEMENT_3D('',${pt(A)},${dir([U[1], -U[0], 0])},${dir(U)})`)})`,
              );
            }
            faces.push(
              face(
                [
                  bound([
                    orient(low.edges[i]),
                    orient(vertical[j]),
                    orient(high.edges[i], false),
                    orient(vertical[i], false),
                  ]),
                ],
                surface,
                !hole,
              ),
            );
          }
        };
      const profile = p.support.profile.map(([r, z]) => circle(r, z));
      cap(profile[0], null, false);
      for (let i = 0; i < profile.length - 1; i++) {
        const a = profile[i],
          b = profile[i + 1];
        if (Math.abs(a.z - b.z) < 1e-8)
          cap(a.r > b.r ? a : b, a.r > b.r ? b : a, a.r > b.r);
        else band(a, b);
      }
      const hex0 = polygon(E.hexPoints(p.flats), p.support.start),
        hex1 = polygon(E.hexPoints(p.flats), p.neck),
        body0 = circle(p.radius, p.neck),
        body1 = circle(p.radius, p.height);
      if (profile.at(-1).r < p.flats / 2) cap(hex0, profile.at(-1), false);
      else cap(profile.at(-1), hex0);
      band(hex0, hex1);
      cap(body0, hex1, false);
      band(body0, body1);
      let hole0, hole1;
      if (p.shape === "round") {
        hole0 = circle(p.shaft / 2, p.holeFloor);
        hole1 = circle(p.shaft / 2, p.height);
      } else {
        const parts = C.socketSegments(p);
        hole0 = polygon(
          parts.map((v) => v.start),
          p.holeFloor,
          parts,
        );
        hole1 = polygon(
          parts.map((v) => v.start),
          p.height,
          parts,
        );
      }
      band(hole0, hole1, true);
      cap(hole0);
      cap(body1, hole1);
      return add(
        `MANIFOLD_SOLID_BREP('${p.id}',${add(`CLOSED_SHELL('',${ref(faces)})`)})`,
      );
    }
    for (const p of poses) {
      if (p.type === "coupler" && p.support) {
        solids.push(supportedCoupler(p));
        continue;
      }
      const geom = E.geometry(p),
        b = p.width,
        faces = [],
        bottom = [],
        top = [],
        plane0 = add(`PLANE('',${ax([0, 0, p.z])})`),
        plane1 = add(`PLANE('',${ax([0, 0, p.z + b])})`),
        original = p,
        stepBounds = [],
        holeBounds = [],
        holePlane =
          geom.coupler?.holeFloor > 0
            ? add(`PLANE('',${ax([0, 0, p.z + geom.coupler.holeFloor])})`)
            : null,
        stepPlane = geom.coupler
          ? add(`PLANE('',${ax([0, 0, p.z + geom.coupler.neck])})`)
          : null;
      const sections = geom.coupler
        ? [
            [geom.coupler.hex, false, 0, geom.coupler.neck],
            [geom.outer, false, geom.coupler.neck, b],
            [geom.inner, true, geom.coupler.holeFloor || 0, b],
          ]
        : [
            [geom.outer, false, 0, b],
            [geom.inner, true, 0, b],
          ];
      for (const [curve, isHole, start, end] of sections) {
        if (!curve) continue;
        const p = { ...original, z: original.z + start },
          b = end - start,
          plane0 =
            start === 0
              ? add(`PLANE('',${ax([0, 0, p.z])})`)
              : isHole
                ? holePlane
                : stepPlane,
          plane1 =
            end === original.width
              ? add(`PLANE('',${ax([0, 0, p.z + b])})`)
              : stepPlane;
        let c0,
          c1,
          c20,
          c21,
          side,
          seamGeo,
          first0,
          first1,
          uMax,
          vMax = b;
        if (curve.kind === "d" || curve.kind === "double-d") {
          const parts = globalThis.GearCoupler.socketSegments({
              shape: curve.kind,
              shaft: curve.r * 2,
              flat: curve.flat,
            }),
            n = parts.length,
            angle = p.rotation || 0,
            base = parts.map((part) => world(p, part.start)),
            upper = parts.map((part) => world(p, part.start, b)),
            v0 = base.map((A) => add(`VERTEX_POINT('',${pt(A)})`)),
            v1 = upper.map((A) => add(`VERTEX_POINT('',${pt(A)})`)),
            axis0 = ax([p.x, p.y, p.z], angle),
            axis1 = ax([p.x, p.y, p.z + b], angle),
            circle0 = add(`CIRCLE('',${axis0},${num(curve.r)})`),
            circle1 = add(`CIRCLE('',${axis1},${num(curve.r)})`),
            circle2 = add(
              `CIRCLE('',${add(`AXIS2_PLACEMENT_2D('',${pt([p.x, p.y])},${dir([Math.cos(angle), Math.sin(angle)])})`)},${num(curve.r)})`,
            ),
            cyl = add(`CYLINDRICAL_SURFACE('',${axis0},${num(curve.r)})`);
          const walls = parts.map((part, i) => {
            if (part.kind === "arc")
              return { surface: cyl, u0: part.a0, u1: part.a1 };
            const j = (i + 1) % n,
              A = base[i],
              B = base[j],
              length = Math.hypot(B[0] - A[0], B[1] - A[1]),
              u = [(B[0] - A[0]) / length, (B[1] - A[1]) / length, 0],
              surface = add(
                `PLANE('',${add(`AXIS2_PLACEMENT_3D('',${pt(A)},${dir([u[1], -u[0], 0])},${dir(u)})`)})`,
              );
            return { surface, u0: 0, u1: length, u };
          });
          const vertical = base.map((A, i) => {
              const previous = walls[(i + n - 1) % n],
                current = walls[i];
              return edge(
                v0[i],
                v1[i],
                sc(line(A, [0, 0, 1]), [
                  pcurve(current.surface, line([current.u0, 0], [0, 1])),
                  pcurve(previous.surface, line([previous.u1, 0], [0, 1])),
                ]),
              );
            }),
            eb = [],
            et = [];
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n,
              wall = walls[i],
              arc = parts[i].kind === "arc";
            eb.push(
              edge(
                v0[i],
                v0[j],
                sc(arc ? circle0 : line(base[i], wall.u), [
                  pcurve(wall.surface, line([0, 0], [1, 0])),
                  pcurve(
                    plane0,
                    arc
                      ? circle2
                      : line(base[i].slice(0, 2), wall.u.slice(0, 2)),
                  ),
                ]),
              ),
            );
            et.push(
              edge(
                v1[i],
                v1[j],
                sc(arc ? circle1 : line(upper[i], wall.u), [
                  pcurve(wall.surface, line([0, b], [1, 0])),
                  pcurve(
                    plane1,
                    arc
                      ? circle2
                      : line(upper[i].slice(0, 2), wall.u.slice(0, 2)),
                  ),
                ]),
              ),
            );
            faces.push(
              face(
                [
                  bound([
                    orient(eb[i]),
                    orient(vertical[j]),
                    orient(et[i], false),
                    orient(vertical[i], false),
                  ]),
                ],
                wall.surface,
                !isHole,
              ),
            );
          }
          if (start === 0)
            bottom.push(
              bound(
                eb.map((e) => orient(e)),
                isHole,
              ),
            );
          else holeBounds.push(bound(eb.map((e) => orient(e))));
          top.push(
            bound(
              et.map((e) => orient(e)),
              !isHole,
            ),
          );
          continue;
        }
        if (curve.polygon) {
          const points = curve.vertices.map((v) => world(p, v)),
            pointsTop = curve.vertices.map((v) => world(p, v, b)),
            n = points.length,
            lengths = points.map((A, i) =>
              Math.hypot(
                points[(i + 1) % n][0] - A[0],
                points[(i + 1) % n][1] - A[1],
              ),
            ),
            units = points.map((A, i) => {
              const B = points[(i + 1) % n];
              return [
                (B[0] - A[0]) / lengths[i],
                (B[1] - A[1]) / lengths[i],
                0,
              ];
            }),
            walls = points.map((A, i) =>
              add(
                `PLANE('',${add(`AXIS2_PLACEMENT_3D('',${pt(A)},${dir([units[i][1], -units[i][0], 0])},${dir(units[i])})`)})`,
              ),
            ),
            vs0 = points.map((A) => add(`VERTEX_POINT('',${pt(A)})`)),
            vs1 = pointsTop.map((A) => add(`VERTEX_POINT('',${pt(A)})`)),
            vertical = points.map((A, i) => {
              const prev = (i + n - 1) % n;
              return edge(
                vs0[i],
                vs1[i],
                sc(line(A, [0, 0, 1]), [
                  pcurve(walls[i], line([0, 0], [0, 1])),
                  pcurve(walls[prev], line([lengths[prev], 0], [0, 1])),
                ]),
              );
            }),
            eb = [],
            et = [];
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n,
              A = points[i],
              B = pointsTop[i],
              u = units[i];
            eb.push(
              edge(
                vs0[i],
                vs0[j],
                sc(line(A, u), [
                  pcurve(walls[i], line([0, 0], [1, 0])),
                  pcurve(plane0, line(A.slice(0, 2), u.slice(0, 2))),
                ]),
              ),
            );
            et.push(
              edge(
                vs1[i],
                vs1[j],
                sc(line(B, u), [
                  pcurve(walls[i], line([0, b], [1, 0])),
                  pcurve(plane1, line(B.slice(0, 2), u.slice(0, 2))),
                ]),
              ),
            );
            faces.push(
              face(
                [
                  bound([
                    orient(eb[i]),
                    orient(vertical[j]),
                    orient(et[i], false),
                    orient(vertical[i], false),
                  ]),
                ],
                walls[i],
                !isHole,
              ),
            );
          }
          if (start === 0)
            bottom.push(
              bound(
                eb.map((e) => orient(e)),
                isHole,
              ),
            );
          else if (isHole) holeBounds.push(bound(eb.map((e) => orient(e))));
          else stepBounds.unshift(bound(eb.map((e) => orient(e))));
          if (end === original.width)
            top.push(
              bound(
                et.map((e) => orient(e)),
                !isHole,
              ),
            );
          else
            stepBounds.push(
              bound(
                et.map((e) => orient(e)),
                false,
              ),
            );
          continue;
        }
        if (curve.kind === "circle") {
          const center = [p.x, p.y],
            angle = p.rotation || 0;
          c0 = add(`CIRCLE('',${ax([...center, p.z], angle)},${num(curve.r)})`);
          c1 = add(
            `CIRCLE('',${ax([...center, p.z + b], angle)},${num(curve.r)})`,
          );
          c20 = add(
            `CIRCLE('',${add(`AXIS2_PLACEMENT_2D('',${pt(center)},${dir([Math.cos(angle), Math.sin(angle)])})`)},${num(curve.r)})`,
          );
          c21 = c20;
          side = add(
            `CYLINDRICAL_SURFACE('',${ax([...center, p.z], angle)},${num(curve.r)})`,
          );
          first0 = world(p, [curve.r, 0]);
          first1 = world(p, [curve.r, 0], b);
          seamGeo = line(first0, [0, 0, 1]);
          uMax = TAU;
        } else {
          const twist = isHole && p.coupler === true ? 0 : geom.d.twist,
            base = curve.poles.map((v) => world(p, v)),
            end = curve.poles.map((v) => world(p, rot(v, twist), b));
          c0 = splineCurve(base, curve.n, true);
          c1 = splineCurve(end, curve.n, true);
          c20 = splineCurve(
            base.map((v) => v.slice(0, 2)),
            curve.n,
            true,
          );
          c21 = splineCurve(
            end.map((v) => v.slice(0, 2)),
            curve.n,
            true,
          );
          first0 = base[0];
          first1 = end[0];
          uMax = curve.n;
          if (Math.abs(twist) < 1e-10) {
            side = add(
              `SURFACE_OF_LINEAR_EXTRUSION('',${c0},${vec([0, 0, 1])})`,
            );
            seamGeo = line(first0, [0, 0, 1]);
          } else {
            const nv = Math.max(1, Math.ceil(Math.abs(twist) / E.rad(5)));
            vMax = nv;
            const grid = curve.poles.map((v) => {
              const control = [world(p, v)];
              for (let j = 0; j < nv; j++) {
                const t0 = j / nv,
                  t1 = (j + 1) / nv,
                  A = rot(v, twist * t0),
                  B = rot(v, twist * t1),
                  At = rot(
                    [(-A[1] * twist) / nv, (A[0] * twist) / nv],
                    p.rotation || 0,
                  ),
                  Bt = rot(
                    [(-B[1] * twist) / nv, (B[0] * twist) / nv],
                    p.rotation || 0,
                  ),
                  W0 = world(p, A, b * t0),
                  W1 = world(p, B, b * t1);
                control.push(
                  [W0[0] + At[0] / 3, W0[1] + At[1] / 3, W0[2] + b / nv / 3],
                  [W1[0] - Bt[0] / 3, W1[1] - Bt[1] / 3, W1[2] - b / nv / 3],
                  W1,
                );
              }
              return control;
            });
            side = add(
              `B_SPLINE_SURFACE_WITH_KNOTS('',3,3,${ref(grid.map((row) => ref(row.map(pt))))},.UNSPECIFIED.,.T.,.F.,.F.,(${mult(curve.n)}),(${mult(nv)}),(${knots(curve.n)}),(${knots(nv)}),.UNSPECIFIED.)`,
            );
            seamGeo = splineCurve(grid[0], nv, false);
          }
        }
        const v0 = add(`VERTEX_POINT('',${pt(first0)})`),
          v1 = add(`VERTEX_POINT('',${pt(first1)})`),
          seam = edge(
            v0,
            v1,
            sc(
              seamGeo,
              [
                pcurve(side, line([0, 0], [0, 1])),
                pcurve(side, line([uMax, 0], [0, 1])),
              ],
              true,
            ),
          ),
          e0 = edge(
            v0,
            v0,
            sc(c0, [pcurve(side, line([0, 0], [1, 0])), pcurve(plane0, c20)]),
          ),
          e1 = edge(
            v1,
            v1,
            sc(c1, [
              pcurve(side, line([0, vMax], [1, 0])),
              pcurve(plane1, c21),
            ]),
          );
        faces.push(
          face(
            [
              bound([
                orient(e0),
                orient(seam),
                orient(e1, false),
                orient(seam, false),
              ]),
            ],
            side,
            !isHole,
          ),
        );
        if (start === 0) bottom.push(bound([orient(e0)], isHole));
        else if (isHole) holeBounds.push(bound([orient(e0)]));
        else stepBounds.unshift(bound([orient(e0)]));
        if (end === original.width) top.push(bound([orient(e1)], !isHole));
        else stepBounds.push(bound([orient(e1)], false));
      }
      if (geom.coupler) faces.push(face(stepBounds, stepPlane, false));
      if (holeBounds.length) faces.push(face(holeBounds, holePlane));
      faces.push(face(bottom, plane0, false));
      if (geom.pocket) {
        const pocket = geom.pocket,
          z = p.z + pocket.floor,
          floorPlane = add(`PLANE('',${ax([0, 0, z])})`);
        const pocketWall = (radius, isHole) => {
          const angle = p.rotation || 0,
            center = [p.x, p.y],
            c0 = add(`CIRCLE('',${ax([...center, z], angle)},${num(radius)})`),
            c1 = add(
              `CIRCLE('',${ax([...center, p.z + b], angle)},${num(radius)})`,
            ),
            c2 = add(
              `CIRCLE('',${add(`AXIS2_PLACEMENT_2D('',${pt(center)},${dir([Math.cos(angle), Math.sin(angle)])})`)},${num(radius)})`,
            ),
            side = add(
              `CYLINDRICAL_SURFACE('',${ax([...center, z], angle)},${num(radius)})`,
            ),
            P = [
              p.x + radius * Math.cos(angle),
              p.y + radius * Math.sin(angle),
              z,
            ],
            Q = [P[0], P[1], p.z + b],
            v0 = add(`VERTEX_POINT('',${pt(P)})`),
            v1 = add(`VERTEX_POINT('',${pt(Q)})`),
            seam = edge(
              v0,
              v1,
              sc(
                line(P, [0, 0, 1]),
                [
                  pcurve(side, line([0, 0], [0, 1])),
                  pcurve(side, line([TAU, 0], [0, 1])),
                ],
                true,
              ),
            ),
            low = edge(
              v0,
              v0,
              sc(c0, [
                pcurve(side, line([0, 0], [1, 0])),
                pcurve(floorPlane, c2),
              ]),
            ),
            high = edge(
              v1,
              v1,
              sc(c1, [
                pcurve(side, line([0, pocket.depth], [1, 0])),
                pcurve(plane1, c2),
              ]),
            );
          faces.push(
            face(
              [
                bound([
                  orient(low),
                  orient(seam),
                  orient(high, false),
                  orient(seam, false),
                ]),
              ],
              side,
              !isHole,
            ),
          );
          return { low, high };
        };
        const outer = pocketWall(pocket.outer, true),
          inner = pocketWall(pocket.inner, false);
        faces.push(
          face([top[0], bound([orient(outer.high)], false)], plane1),
          face([bound([orient(inner.high)]), ...top.slice(1)], plane1),
          face(
            [bound([orient(outer.low)]), bound([orient(inner.low)], false)],
            floorPlane,
          ),
        );
      } else faces.push(face(top, plane1));
      solids.push(
        add(
          `MANIFOLD_SOLID_BREP('${p.id}',${add(`CLOSED_SHELL('',${ref(faces)})`)})`,
        ),
      );
    }
    const repr = add(
      `ADVANCED_BREP_SHAPE_REPRESENTATION('',${ref([ax([0, 0, 0]), ...solids])},${ctx})`,
    );
    add(`SHAPE_DEFINITION_REPRESENTATION(${pds},${repr})`);
    add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prod}))`);
    return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Gear Workbench approximate geometry'),'2;1');\nFILE_NAME('gears.step','${new Date().toISOString().slice(0, 19)}',(''),(''),'Gear Workbench','Gear Workbench','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n${rows.map((s, i) => "#" + (i + 1) + " = " + s + ";").join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`;
  }
  function gearPayload(poses) {
    // One built-in Python command avoids nested interactive selection during Rhino Paste.
    // No files, extra plugin, document curves, or localized command options are required.
    const payload = poses.map((p, i) => {
      if (p.type === "coupler")
        return {
          kind: "coupler",
          name: p.name,
          center: [p.x, p.y, p.z],
          rotation: p.rotation || 0,
          ...globalThis.GearCoupler.geometry(p).g,
        };
      const g = E.geometry(p),
        loop = (c) =>
          c.kind === "circle"
            ? { kind: "circle", center: [p.x, p.y, p.z], radius: c.r }
            : { kind: "nurbs", poles: c.poles.map((v) => world(p, v)) };
      return {
        name: p.name || "Gear " + (i + 1),
        center: [p.x, p.y, p.z],
        width: p.width,
        twist: g.d.twist,
        pocket: g.pocket,
        hex:
          p.coupler === true
            ? { points: E.hexPoints(p.bore).map((v) => world(p, v)) }
            : null,
        loops: [g.outer, p.coupler === true ? null : g.inner]
          .filter(Boolean)
          .map(loop),
      };
    });
    return payload;
  }
  function rhinoMacro(poses) {
    return rhinoSolidCommand(
      gearPayload([...poses, ...(globalThis.GearCoupler?.poses(poses) || [])]),
    );
  }
  function mountPayload(m, includePins = true) {
    if (!m || !m.settings.enabled) throw Error("請先開啟生成列印底盤");
    if (m.errors.length) throw Error(m.errors.join("；"));
    if (includePins && m.unmounted.length)
      throw Error("輪心未對孔位：請先對齊孔位，或取消包含支撐桿");
    const payload = [
      {
        kind: "board",
        name: m.settings.adaptive ? "自適應底板與固定支撐桿" : "凹槽洞洞板",
        outline: m.outline,
        fusedPins: m.settings.adaptive
          ? m.pins.map((p) => ({
              center: [p.x, p.y],
              profile: globalThis.GearMount.pinProfile(p, m),
            }))
          : [],
        x0: m.x0,
        x1: m.x1,
        y0: m.y0,
        y1: m.y1,
        top: m.top,
        bottom: m.bottom,
        hole: m.hole,
        recessDiameter: m.recessDiameter,
        recess: m.settings.recess,
        holes: m.holes.map((h) => [h.x, h.y]),
      },
    ];
    if (includePins && !m.settings.adaptive)
      for (const p of m.pins)
        payload.push({
          kind: "pin",
          name: p.name + " 支撐桿",
          center: [p.x, p.y],
          profile: globalThis.GearMount.pinProfile(p, m),
        });
    return payload;
  }
  function rhinoMountMacro(m, includePins = true) {
    return rhinoSolidCommand(mountPayload(m, includePins));
  }
  function rhinoAssemblyMacro(poses, m, includePins = true) {
    return rhinoSolidCommand([
      ...gearPayload([
        ...poses,
        ...(globalThis.GearCoupler?.poses(
          poses.map((p) => ({ ...p, mountContext: p.mountContext || m })),
        ) || []),
      ]),
      ...(m ? mountPayload(m, includePins) : []),
    ]);
  }
  function rhinoSolidCommand(payload) {
    const literal = JSON.stringify(JSON.stringify(payload)).replace(
      /[^\x00-\x7f]/g,
      (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
    );
    return `! _-RunPythonScript (
# -*- coding: utf-8 -*-
# Gear Workbench solid-copy-v3: build, join, cap and validate before adding anything.
import Rhino
import System
import json

def gear_workbench_paste():
    doc = Rhino.RhinoDoc.ActiveDoc
    if doc is None:
        raise RuntimeError('No active Rhino document')
    data = json.loads(u${literal})
    scale = Rhino.RhinoMath.UnitScale(Rhino.UnitSystem.Millimeters, doc.ModelUnitSystem)
    tol = max(1e-7 * scale, min(doc.ModelAbsoluteTolerance, 0.001 * scale))
    def point(v):
        return Rhino.Geometry.Point3d(v[0] * scale, v[1] * scale, v[2] * scale)
    def curve(spec):
        if spec['kind'] == 'circle':
            plane = Rhino.Geometry.Plane(point(spec['center']), Rhino.Geometry.Vector3d.ZAxis)
            return Rhino.Geometry.Circle(plane, spec['radius'] * scale).ToNurbsCurve()
        poles = spec['poles']
        result = Rhino.Geometry.NurbsCurve(3, False, 4, len(poles))
        for i, v in enumerate(poles):
            result.Points.SetPoint(i, point(v))
        for i in range(result.Knots.Count):
            result.Knots[i] = float(i // 3)
        if not result.IsValid or not result.IsClosed:
            raise RuntimeError('Invalid closed gear profile')
        return result
    def circle_at(x, y, z, radius):
        plane = Rhino.Geometry.Plane(point([x, y, z]), Rhino.Geometry.Vector3d.ZAxis)
        return Rhino.Geometry.Circle(plane, radius * scale).ToNurbsCurve()
    def make_board(p):
        corners = p.get('outline') or [[p['x0'], p['y0']], [p['x1'], p['y0']], [p['x1'], p['y1']], [p['x0'], p['y1']]]
        def outline(z):
            return Rhino.Geometry.PolylineCurve([point([v[0], v[1], z]) for v in corners + [corners[0]]])
        lower = [outline(p['bottom'])]
        upper = [outline(p['top'])]
        for h in p['holes']:
            lower.append(circle_at(h[0], h[1], p['bottom'], p['hole'] / 2))
            upper.append(circle_at(h[0], h[1], p['top'], p['recessDiameter'] / 2))
        faces = []
        for loops in [lower, upper]:
            caps = Rhino.Geometry.Brep.CreatePlanarBreps(loops, tol)
            if caps is None or len(caps) != 1:
                raise RuntimeError('Could not create perforated board face')
            faces.append(caps[0])
        for i in range(len(corners)):
            a, b = corners[i], corners[(i + 1) % len(corners)]
            side = Rhino.Geometry.Brep.CreateFromCornerPoints(point([a[0], a[1], p['bottom']]), point([b[0], b[1], p['bottom']]), point([b[0], b[1], p['top']]), point([a[0], a[1], p['top']]), tol)
            if side is None:
                raise RuntimeError('Could not create board edge')
            faces.append(side)
        seat_z = p['top'] - p['recess']
        for h in p['holes']:
            bottom_ring = circle_at(h[0], h[1], p['bottom'], p['hole'] / 2)
            lower_ring = circle_at(h[0], h[1], seat_z, p['hole'] / 2)
            upper_ring = circle_at(h[0], h[1], p['top'], p['recessDiameter'] / 2)
            wall = Rhino.Geometry.Surface.CreateExtrusion(bottom_ring, Rhino.Geometry.Vector3d(0, 0, (seat_z - p['bottom']) * scale))
            if wall is None:
                raise RuntimeError('Could not create board hole')
            faces.append(wall.ToBrep())
            recess = Rhino.Geometry.Brep.CreateFromLoft([lower_ring, upper_ring], Rhino.Geometry.Point3d.Unset, Rhino.Geometry.Point3d.Unset, Rhino.Geometry.LoftType.Straight, False)
            if recess is None or len(recess) != 1:
                raise RuntimeError('Could not create recessed hole')
            faces.append(recess[0])
        result = Rhino.Geometry.Brep.JoinBreps(faces, tol)
        if result is None or len(result) != 1:
            raise RuntimeError('Could not join the recessed pegboard')
        board = result[0]
        if p.get('fusedPins'):
            pieces = [board]
            for pin in p['fusedPins']:
                profile = [list(v) for v in pin['profile']]
                profile[0][1] -= 0.05
                part = make_pin({'center': pin['center'], 'profile': profile})
                if part.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward: part.Flip()
                pieces.append(part)
            if board.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward: board.Flip()
            union = Rhino.Geometry.Brep.CreateBooleanUnion(pieces, tol)
            if union is None or len(union) != 1: raise RuntimeError('Could not fuse fixed posts to adaptive baseplate')
            board = union[0]
        return board
    def make_pin(p):
        x, y = p['center']
        points = []
        for radius, z in p['profile']:
            v = point([x + radius, y, z])
            if not points or v.DistanceTo(points[-1]) > 1e-9 * scale:
                points.append(v)
        profile = Rhino.Geometry.PolylineCurve(points)
        axis = Rhino.Geometry.Line(point([x, y, p['profile'][0][1]]), point([x, y, p['profile'][-1][1]]))
        surface = Rhino.Geometry.RevSurface.Create(profile, axis)
        if surface is None:
            raise RuntimeError('Could not revolve removable post')
        return Rhino.Geometry.Brep.CreateFromRevSurface(surface, True, True)
    def extrude_polygon(points, height):
        curve = Rhino.Geometry.PolylineCurve([point(v) for v in points + [points[0]]])
        surface = Rhino.Geometry.Surface.CreateExtrusion(curve, Rhino.Geometry.Vector3d(0, 0, height * scale))
        return surface.ToBrep().CapPlanarHoles(tol)
    def make_coupler(p):
        import math
        x, y, z = p['center']
        radius = p['flats'] / math.sqrt(3.0)
        points = [[x + radius * math.cos(p['rotation'] + i * math.pi / 3), y + radius * math.sin(p['rotation'] + i * math.pi / 3), z] for i in range(6)]
        support = p.get('support')
        start_hex = support['start'] if support else 0
        points = [[v[0], v[1], v[2] + start_hex] for v in points]
        plug = extrude_polygon(points, p['neck'] - start_hex + 0.01)
        plane = Rhino.Geometry.Plane(point([x, y, z + p['neck']]), Rhino.Geometry.Vector3d.ZAxis)
        body = Rhino.Geometry.Cylinder(Rhino.Geometry.Circle(plane, p['radius'] * scale), p['body'] * scale).ToBrep(True, True)
        if plug.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
            plug.Flip()
        pieces = [plug, body]
        if support:
            profile = [[r, z + Z] for r, Z in support['profile']]
            # Extend the last collar slightly into the hex to make a robust solid union.
            profile[-1][1] += 0.01
            base = make_pin({'center': [x, y], 'profile': profile})
            if base.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
                base.Flip()
            pieces.append(base)
        union = Rhino.Geometry.Brep.CreateBooleanUnion(pieces, tol)
        if union is None or len(union) != 1:
            raise RuntimeError('Could not join the hex plug and motor socket')
        floor = p.get('holeFloor', 0)
        start = floor if floor > 0 else -0.5
        length = p['height'] - start + 0.5
        plane = Rhino.Geometry.Plane(point([x, y, z + start]), Rhino.Geometry.Vector3d.ZAxis)
        if p.get('shape') in ('d', 'double-d'):
            r = p['shaft'] / 2.0
            c = r - p['flat']
            h = math.sqrt(r * r - c * c)
            def local(a, b):
                return point([x + a * math.cos(p['rotation']) - b * math.sin(p['rotation']), y + a * math.sin(p['rotation']) + b * math.cos(p['rotation']), z + start])
            upper, lower, middle = local(c, h), local(c, -h), local(-r, 0)
            if p.get('shape') == 'double-d':
                upper_left, lower_left = local(-c, h), local(-c, -h)
                parts = [Rhino.Geometry.ArcCurve(Rhino.Geometry.Arc(upper, local(0, r), upper_left)), Rhino.Geometry.LineCurve(upper_left, lower_left), Rhino.Geometry.ArcCurve(Rhino.Geometry.Arc(lower_left, local(0, -r), lower)), Rhino.Geometry.LineCurve(lower, upper)]
            else:
                parts = [Rhino.Geometry.ArcCurve(Rhino.Geometry.Arc(upper, middle, lower)), Rhino.Geometry.LineCurve(lower, upper)]
            joined = Rhino.Geometry.Curve.JoinCurves(parts, tol)
            if joined is None or len(joined) != 1:
                raise RuntimeError('Could not create the D shaft profile')
            surface = Rhino.Geometry.Surface.CreateExtrusion(joined[0], Rhino.Geometry.Vector3d(0, 0, length * scale))
            cutter = surface.ToBrep().CapPlanarHoles(tol)
            if cutter.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
                cutter.Flip()
        else:
            cutter = Rhino.Geometry.Cylinder(Rhino.Geometry.Circle(plane, p['shaft'] * scale / 2), length * scale).ToBrep(True, True)
        cut = Rhino.Geometry.Brep.CreateBooleanDifference(union[0], cutter, tol)
        if cut is None or len(cut) != 1:
            raise RuntimeError('Could not create the motor shaft hole')
        return cut[0]
    ready = []
    for p in data:
        if p.get('kind') == 'coupler':
            solid = make_coupler(p)
        elif p.get('kind') == 'board':
            solid = make_board(p)
        elif p.get('kind') == 'pin':
            solid = make_pin(p)
        else:
            curves = [curve(c) for c in p['loops']]
            bases = Rhino.Geometry.Brep.CreatePlanarBreps(curves, tol)
            if bases is None or len(bases) != 1:
                raise RuntimeError('Could not create one holed gear region')
            walls = []
            direction = Rhino.Geometry.Vector3d(0, 0, p['width'] * scale)
            for c in curves:
                surface = Rhino.Geometry.Surface.CreateExtrusion(c, direction)
                if surface is None:
                    raise RuntimeError('Could not extrude gear wall')
                walls.append(surface.ToBrep())
            joined = Rhino.Geometry.Brep.JoinBreps([bases[0]] + walls, tol)
            if joined is None or len(joined) != 1:
                raise RuntimeError('Could not join the gear base and walls')
            solid = joined[0].CapPlanarHoles(tol)
            if solid is None:
                raise RuntimeError('Could not cap the gear')
            if abs(p['twist']) > 1e-10:
                axis = Rhino.Geometry.Line(point(p['center']), point([p['center'][0], p['center'][1], p['center'][2] + p['width']]))
                morph = Rhino.Geometry.Morphs.TwistSpaceMorph()
                morph.TwistAxis = axis
                morph.TwistAngleRadians = p['twist']
                morph.InfiniteTwist = True
                morph.PreserveStructure = False
                morph.Tolerance = tol
                if not morph.Morph(solid):
                    raise RuntimeError('Could not twist the helical gear')
        if p.get('hex'):
            if solid.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
                solid.Flip()
            points = [[v[0], v[1], v[2] - 0.5] for v in p['hex']['points']]
            cutter = extrude_polygon(points, p['width'] + 1)
            if cutter.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
                cutter.Flip()
            cut = Rhino.Geometry.Brep.CreateBooleanDifference(solid, cutter, tol)
            if cut is None or len(cut) != 1:
                raise RuntimeError('Could not create the straight hex gear bore')
            solid = cut[0]
        if p.get('pocket'):
            if solid.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
                solid.Flip()
            pocket = p['pocket']
            base = point([p['center'][0], p['center'][1], p['center'][2] + pocket['floor']])
            plane = Rhino.Geometry.Plane(base, Rhino.Geometry.Vector3d.ZAxis)
            height = (pocket['depth'] + 1.0) * scale
            outer = Rhino.Geometry.Cylinder(Rhino.Geometry.Circle(plane, pocket['outer'] * scale), height).ToBrep(True, True)
            inner = Rhino.Geometry.Cylinder(Rhino.Geometry.Circle(plane, pocket['inner'] * scale), height).ToBrep(True, True)
            annulus = Rhino.Geometry.Brep.CreateBooleanDifference(outer, inner, tol)
            if annulus is None or len(annulus) != 1:
                raise RuntimeError('Could not build the annular recess cutter')
            if annulus[0].SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
                annulus[0].Flip()
            cut = Rhino.Geometry.Brep.CreateBooleanDifference(solid, annulus[0], tol)
            if cut is None or len(cut) != 1:
                raise RuntimeError('Could not create one recessed gear solid')
            solid = cut[0]
        if solid is None or not solid.IsValid or not solid.IsSolid:
            raise RuntimeError('Gear is not a valid closed solid; nothing was added')
        if solid.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
            solid.Flip()
        ready.append((p['name'], solid, p.get('kind', 'gear')))
    # All shapes pass first. Each paste gets its own layer, including repeated pastes.
    layer = Rhino.DocObjects.Layer()
    layer.Name = 'GearPaste_' + System.Guid.NewGuid().ToString('N')
    record = doc.BeginUndoRecord('Paste Gear Workbench solids')
    created = []
    layer_index = -1
    try:
        layer_index = doc.Layers.Add(layer)
        if layer_index < 0:
            raise RuntimeError('Could not create the gear layer')
        for name, solid, kind in ready:
            attrs = Rhino.DocObjects.ObjectAttributes()
            attrs.LayerIndex = layer_index
            attrs.Name = name
            attrs.SetUserString('GearWorkbench', 'solid-copy-v3')
            attrs.SetUserString('GearWorkbenchPart', kind)
            object_id = doc.Objects.AddBrep(solid, attrs)
            if object_id == System.Guid.Empty:
                raise RuntimeError('Could not add the gear solid')
            created.append(object_id)
    except:
        for object_id in created:
            doc.Objects.Delete(object_id, True)
        if layer_index >= 0:
            doc.Layers.Delete(layer_index, True)
        raise
    finally:
        doc.EndUndoRecord(record)
    doc.Views.Redraw()
    print('Gear Workbench: created {0} valid closed solids (mm).'.format(len(created)))

gear_workbench_paste()
)
`;
  }
  return {
    makeSVG,
    makeDXF,
    makeSTL,
    makeSTEP,
    rhinoMacro,
    rhinoMountMacro,
    rhinoAssemblyMacro,
  };
})();
