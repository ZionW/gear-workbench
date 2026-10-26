/* Isolated inspection uses the same printable meshes as STL export; model state is never edited. */
(() => {
  "use strict";
  const root = document.querySelector("#gear-lab"),
    q = (id) => document.getElementById("v-component-" + id),
    panel = q("preview"),
    canvas = q("canvas"),
    ctx = canvas.getContext("2d"),
    stage = panel.closest(".stage");
  let active = false,
    items = [],
    mesh = [],
    edges = [],
    center = [0, 0, 0],
    yaw = -0.45,
    tilt = 1,
    zoom = 1,
    drag = null;
  const fmt = (n) => Number(n.toFixed(2)).toString(),
    dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  function entries() {
    const api = root.labTest,
      s = api.getState(),
      m = api.getMount(),
      out = [];
    for (const g of api.poses()) {
      const d = GearEngine.dims(g),
        rows = [
          ["厚度", g.width],
          ["模數", g.m],
          ["齒數", String(g.teeth)],
        ];
      if (g.type === "rack") rows.unshift(["齒條長度", d.length]);
      else rows.unshift(["齒頂外徑", 2 * d.outer], ["節圓直徑", 2 * d.r]);
      if (g.type !== "rack")
        rows.push([g.coupler ? "六角孔對邊" : "軸孔直徑", g.bore]);
      if (g.recessDepth) rows.push(["凹槽深度", g.recessDepth]);
      out.push({
        id: "gear:" + g.id,
        name: g.name,
        rows,
        build: () =>
          readSTL(
            GearExports.makeSTL([{ ...g, x: 0, y: 0, z: 0, rotation: 0 }]),
          ),
      });
    }
    for (const g of api.poses()) {
      try {
        for (const p of GearCoupler.poses([g]))
          out.push({
            id: p.id,
            name: p.name,
            rows: [
              ["總長", p.height - (p.support?.profile[0][1] || 0)],
              ["馬達端外徑", 2 * p.radius],
              ["六角對邊", p.flats],
              ["插入深度", p.holeFloor > 0 ? p.height - p.holeFloor : "貫通"],
            ],
            build: () =>
              GearCoupler.triangles({ ...p, x: 0, y: 0, z: 0, rotation: 0 }),
          });
      } catch (e) {
        out.push({
          id: g.id + "-coupler",
          name: g.name + " 聯軸器",
          rows: [],
          build: () => {
            throw e;
          },
        });
      }
    }
    if (m && !m.errors.length) {
      out.push({
        id: "board",
        name: m.settings.adaptive ? "自適應底板與固定支撐桿" : "凹槽洞洞底盤",
        rows: [
          ...(!s.mount.enabled ? [["預覽狀態", "底盤未啟用，僅預覽"]] : []),
          ["長度", m.width],
          ["寬度", m.height],
          ["厚度", m.settings.thickness],
          ...(m.settings.adaptive
            ? [
                ["固定支撐桿", String(m.pins.length)],
                ["轉動孔", String(m.holes.length)],
                ["孔軸直徑差", m.effectiveShaftClearance],
              ]
            : [
                ["孔距", m.settings.pitch],
                ["孔徑", m.hole],
                ["沉槽直徑", m.recessDiameter],
              ]),
        ],
        build: () => GearMount.boardTriangles(m),
      });
      if (!m.settings.adaptive)
        for (const p of m.pins) {
          const profile = GearMount.pinProfile(p, m),
            zs = profile.map((v) => v[1]);
          out.push({
            id: "pin:" + p.id,
            name: p.name + " 支撐桿",
            rows: [
              ["總高", Math.max(...zs) - Math.min(...zs)],
              ["支撐軸徑", p.shaft],
              ["底座直徑", p.collar],
              ["插腳直徑", m.settings.plug],
            ],
            build: () =>
              GearMount.pinsTriangles({ ...m, pins: [p], unmounted: [] }),
          });
        }
    }
    return out;
  }
  function readSTL(bytes) {
    const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      out = [];
    for (let i = 0, n = d.getUint32(80, true); i < n; i++) {
      const t = [];
      for (let j = 0; j < 3; j++)
        t.push(
          [0, 1, 2].map((k) =>
            d.getFloat32(84 + i * 50 + 12 + j * 12 + k * 4, true),
          ),
        );
      out.push(t);
    }
    return out;
  }
  function load() {
    const item = items.find((v) => v.id === q("select").value);
    mesh = [];
    edges = [];
    q("dimensions").replaceChildren();
    q("error").textContent = "";
    if (!item) return;
    q("name").textContent = item.name;
    for (const [label, value] of item.rows) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = typeof value === "number" ? fmt(value) : value;
      q("dimensions").append(dt, dd);
    }
    try {
      const tris = item.build(),
        min = [Infinity, Infinity, Infinity],
        max = min.map(() => -Infinity),
        map = new Map();
      mesh = tris.map((v) => {
        for (const p of v)
          for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], p[k]);
            max[k] = Math.max(max[k], p[k]);
          }
        const a = v[1].map((n, i) => n - v[0][i]),
          b = v[2].map((n, i) => n - v[0][i]),
          n = [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
          ],
          l = Math.hypot(...n),
          normal = n.map((x) => x / (l || 1));
        const face = { v, n: normal, edges: [], color: v.color };
        for (let i = 0; i < 3; i++) {
          const ends = [v[i], v[(i + 1) % 3]],
            key = ends
              .map((p) =>
                p
                  .map((x) => (Math.abs(x) < 0.0005 ? 0 : x).toFixed(3))
                  .join(","),
              )
              .sort()
              .join("|");
          if (!map.has(key)) map.set(key, { v: ends, ns: [] });
          map.get(key).ns.push(normal);
          face.edges.push(map.get(key));
        }
        return face;
      });
      center = min.map((n, i) => (n + max[i]) / 2);
      edges = [...map.values()];
    } catch (e) {
      q("error").textContent = e.message;
    }
    draw();
  }
  function rotate(p) {
    const [x, y, z] = p,
      a = x * Math.cos(yaw) - y * Math.sin(yaw),
      b = x * Math.sin(yaw) + y * Math.cos(yaw);
    return [
      a,
      -b * Math.cos(tilt) - z * Math.sin(tilt),
      b * Math.sin(tilt) - z * Math.cos(tilt),
    ];
  }
  function draw() {
    if (!active) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    if (!mesh.length) return;
    const transformed = mesh.map((f) => ({
        ...f,
        p: f.v.map((v) => rotate(v.map((x, i) => x - center[i]))),
        normal: rotate(f.n),
      })),
      points = transformed.flatMap((f) => f.p),
      range = [0, 1].map(
        (k) =>
          points.reduce((n, p) => Math.max(n, p[k]), -Infinity) -
          points.reduce((n, p) => Math.min(n, p[k]), Infinity),
      ),
      scale =
        Math.min(
          (r.width - 60) / (range[0] || 1),
          (r.height - 60) / (range[1] || 1),
        ) * zoom;
    const screen = (p) => [
      r.width / 2 + p[0] * scale,
      r.height / 2 + p[1] * scale,
    ];
    const W = Math.round(r.width),
      H = Math.round(r.height),
      pixels = new Uint8ClampedArray(W * H * 4),
      depth = new Float32Array(W * H);
    depth.fill(Infinity);
    for (const f of transformed) {
      const P = f.p.map((p) => [...screen(p), p[2]]),
        [A, B, C] = P,
        den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
      if (Math.abs(den) < 1e-8) continue;
      const lowX = Math.max(0, Math.floor(Math.min(...P.map((p) => p[0])))),
        highX = Math.min(W - 1, Math.ceil(Math.max(...P.map((p) => p[0])))),
        lowY = Math.max(0, Math.floor(Math.min(...P.map((p) => p[1])))),
        highY = Math.min(H - 1, Math.ceil(Math.max(...P.map((p) => p[1])))),
        light = 0.6 + 0.35 * Math.abs(dot(f.normal, [0.25, -0.45, 0.86])),
        rgb = f.color
          ? [1, 3, 5].map((i) => parseInt(f.color.slice(i, i + 2), 16))
          : [108, 206, 194],
        color = rgb.map((c) => Math.round(c * light));
      for (let y = lowY; y <= highY; y++)
        for (let x = lowX; x <= highX; x++) {
          const u =
              ((B[1] - C[1]) * (x + 0.5 - C[0]) +
                (C[0] - B[0]) * (y + 0.5 - C[1])) /
              den,
            v =
              ((C[1] - A[1]) * (x + 0.5 - C[0]) +
                (A[0] - C[0]) * (y + 0.5 - C[1])) /
              den,
            w = 1 - u - v;
          if (u < -0.00001 || v < -0.00001 || w < -0.00001) continue;
          const z = u * A[2] + v * B[2] + w * C[2],
            i = y * W + x;
          if (z >= depth[i]) continue;
          depth[i] = z;
          pixels.set([...color, 255], i * 4);
        }
    }
    const tolerance = (Math.max(...range) / scale) * 0.003;
    for (const e of edges) {
      const ns = e.ns.map(rotate),
        crease = e.ns.length > 1 && e.ns.some((n) => dot(n, e.ns[0]) < 0.82),
        silhouette = ns.some((n) => n[2] > 0);
      if (!ns.some((n) => n[2] < 0) || (!crease && !silhouette)) continue;
      const P = e.v.map((v) => rotate(v.map((x, i) => x - center[i]))),
        A = screen(P[0]),
        B = screen(P[1]),
        steps = Math.max(
          1,
          Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) * 1.5),
        );
      for (let j = 0; j <= steps; j++) {
        const t = j / steps,
          x = Math.round(A[0] + (B[0] - A[0]) * t),
          y = Math.round(A[1] + (B[1] - A[1]) * t);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x,
          z = P[0][2] + (P[1][2] - P[0][2]) * t;
        if (z <= depth[i] + tolerance) pixels.set([48, 33, 54, 255], i * 4);
      }
    }
    const output = document.createElement("canvas");
    output.width = W;
    output.height = H;
    output.getContext("2d").putImageData(new ImageData(pixels, W, H), 0, 0);
    ctx.drawImage(output, 0, 0, r.width, r.height);
  }
  function sync() {
    if (!active) return;
    const old = q("select").value;
    try {
      items = entries();
    } catch (e) {
      mesh = [];
      edges = [];
      q("dimensions").replaceChildren();
      q("name").textContent = "請先修正底盤接合";
      q("error").textContent = e.message;
      draw();
      return;
    }
    q("select").replaceChildren(
      ...items.map((item) => new Option(item.name, item.id)),
    );
    q("select").value = items.some((x) => x.id === old)
      ? old
      : "gear:" + root.labTest.getState().selected;
    if (!q("select").value && items.length) q("select").selectedIndex = 0;
    load();
  }
  function toggle(on) {
    active = on;
    panel.hidden = !on;
    stage.dataset.component = on ? "open" : "closed";
    q("toggle").setAttribute("aria-pressed", String(on));
    if (on) {
      if (root.labTest.isPlaying()) document.getElementById("v-play").click();
      sync();
    } else window.dispatchEvent(new Event("resize"));
  }
  q("toggle").addEventListener("click", () => toggle(!active));
  q("back").addEventListener("click", () => toggle(false));
  q("select").addEventListener("change", () => {
    zoom = 1;
    load();
  });
  q("home").addEventListener("click", () => {
    yaw = -0.45;
    tilt = 1;
    zoom = 1;
    draw();
  });
  for (const id of ["v-view2", "v-view3"])
    document.getElementById(id).addEventListener("click", () => toggle(false));
  canvas.addEventListener("pointerdown", (e) => {
    drag = [e.clientX, e.clientY];
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw += (e.clientX - drag[0]) * 0.01;
    tilt += (e.clientY - drag[1]) * 0.01;
    drag = [e.clientX, e.clientY];
    draw();
  });
  canvas.addEventListener("pointerup", () => (drag = null));
  canvas.addEventListener("pointercancel", () => (drag = null));
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = Math.max(0.25, Math.min(5, zoom * Math.exp(-e.deltaY * 0.001)));
      draw();
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (e) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "-",
        "=",
      ].includes(e.key)
    )
      return;
    e.preventDefault();
    if (e.key === "ArrowLeft") yaw -= 0.15;
    if (e.key === "ArrowRight") yaw += 0.15;
    if (e.key === "ArrowUp") tilt -= 0.15;
    if (e.key === "ArrowDown") tilt += 0.15;
    if (e.key === "+" || e.key === "=") zoom = Math.min(5, zoom * 1.1);
    if (e.key === "-") zoom = Math.max(0.25, zoom / 1.1);
    draw();
  });
  root.addEventListener("change", (e) => {
    if (!panel.contains(e.target)) setTimeout(sync, 0);
  });
  root.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== q("toggle"))
      setTimeout(sync, 0);
  });
  new ResizeObserver(draw).observe(canvas);
})();
