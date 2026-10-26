/* One browser download per action. ZIP uses standard uncompressed entries; no dependency. */
globalThis.GearDownloads = (() => {
  const encoder = new TextEncoder(),
    X = globalThis.GearExports,
    M = globalThis.GearMount;
  function zip(files) {
    const entries = files.map((f) => {
      const name = encoder.encode(f.name),
        data = typeof f.data === "string" ? encoder.encode(f.data) : f.data;
      let crc = 0xffffffff;
      for (const byte of data) {
        crc ^= byte;
        for (let j = 0; j < 8; j++)
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      return { name, data, crc: (crc ^ 0xffffffff) >>> 0 };
    });
    const total = entries.reduce(
        (n, e) => n + 30 + e.name.length + e.data.length + 46 + e.name.length,
        22,
      ),
      out = new Uint8Array(total),
      v = new DataView(out.buffer);
    let pos = 0;
    const offsets = [];
    for (const e of entries) {
      offsets.push(pos);
      v.setUint32(pos, 0x04034b50, true);
      v.setUint16(pos + 4, 20, true);
      v.setUint16(pos + 6, 0x800, true);
      v.setUint16(pos + 12, 33, true);
      v.setUint32(pos + 14, e.crc, true);
      v.setUint32(pos + 18, e.data.length, true);
      v.setUint32(pos + 22, e.data.length, true);
      v.setUint16(pos + 26, e.name.length, true);
      out.set(e.name, pos + 30);
      out.set(e.data, pos + 30 + e.name.length);
      pos += 30 + e.name.length + e.data.length;
    }
    const directory = pos;
    entries.forEach((e, i) => {
      v.setUint32(pos, 0x02014b50, true);
      v.setUint16(pos + 4, 20, true);
      v.setUint16(pos + 6, 20, true);
      v.setUint16(pos + 8, 0x800, true);
      v.setUint16(pos + 14, 33, true);
      v.setUint32(pos + 16, e.crc, true);
      v.setUint32(pos + 20, e.data.length, true);
      v.setUint32(pos + 24, e.data.length, true);
      v.setUint16(pos + 28, e.name.length, true);
      v.setUint32(pos + 42, offsets[i], true);
      out.set(e.name, pos + 46);
      pos += 46 + e.name.length;
    });
    v.setUint32(pos, 0x06054b50, true);
    v.setUint16(pos + 8, entries.length, true);
    v.setUint16(pos + 10, entries.length, true);
    v.setUint32(pos + 12, pos - directory, true);
    v.setUint32(pos + 16, directory, true);
    return out;
  }
  function checkMount(m, pins = false) {
    if (!m?.settings.enabled) throw Error("請先啟用底盤");
    if (m.errors.length) throw Error(m.errors.join("；"));
    if (pins && m.unmounted.length)
      throw Error("輪心未對孔位，請先對齊孔位再下載支撐桿");
    if (pins && !m.pins.length) throw Error("目前沒有可生成的支撐桿");
  }
  function build({ target, format, poses, mount }) {
    if (
      ![
        "selected",
        "all",
        "board",
        "pins",
        "kit",
        "couplers",
        "fitTest",
      ].includes(target)
    )
      throw Error("未知下載內容");
    if (!["stl", "step", "dxf"].includes(format)) throw Error("未知下載格式");
    if (
      ["board", "pins", "kit", "fitTest"].includes(target) &&
      format !== "stl"
    )
      throw Error("底盤、支撐桿與列印包目前提供 STL；STEP／DXF 請選齒輪");
    if (target === "fitTest") {
      const gears = poses.filter((g) => g.coupler),
        files = [],
        notes = [
          "馬達軸試配包 · 單位 mm",
          "各套筒高 5 mm，為貫通試配孔，不是完整聯軸器。",
          "套筒未刻字，請依檔名分次試印，或保留切片器物件名稱與排列記錄以免混淆。",
          "檔名 allowance 為直徑方向總補償；雙扁對邊也增加相同值，每側為一半。",
          "請以正式零件相同的材料、噴嘴、層高、方向與切片設定列印，避免重複加 XY 孔徑補償。",
          "選擇能插入、轉動傳扭且不過鬆的配合，再把 allowance 填回軸孔尺寸補償。",
        ];
      if (!gears.length) throw Error("請先啟用馬達聯軸器");
      gears.forEach((g, i) => {
        for (const sample of globalThis.GearCoupler.fitSamples(g)) {
          const filename = `motor-${i + 1}/allowance-${sample.allowance.toFixed(2)}mm.stl`;
          files.push({ name: filename, data: X.makeSTL([sample]) });
          notes.push(
            filename +
              "：軸孔 Ø" +
              sample.shaft.toFixed(3) +
              " mm" +
              (sample.shape === "double-d"
                ? "，孔對邊 " +
                  (sample.shaft - 2 * sample.flat).toFixed(3) +
                  " mm"
                : "") +
              "，軸形 " +
              sample.shape,
          );
        }
      });
      files.push({ name: "README.txt", data: notes.join("\n") + "\n" });
      return {
        data: zip(files),
        name: "motor-shaft-fit-tests.zip",
        mime: "application/zip",
        note: "已輸出馬達軸試配套筒 ZIP；依附帶尺寸說明選擇合適補償。",
      };
    }
    if (target === "couplers") {
      const coupled =
        globalThis.GearCoupler?.poses(
          poses.map((p) => ({ ...p, mountContext: p.mountContext || mount })),
        ) || [];
      if (!coupled.length) throw Error("請先啟用馬達聯軸器");
      if (format === "dxf") throw Error("聯軸器支援 STL／STEP");
      return {
        data: format === "stl" ? X.makeSTL(coupled) : X.makeSTEP(coupled),
        name: "motor-couplers." + format,
        mime: format === "stl" ? "model/stl" : "application/step",
        note: coupled.length + " 個聯軸器 · 組裝位置 · mm。",
      };
    }
    if (target === "pins" && mount?.settings.adaptive)
      throw Error("支撐桿已融合於自適應底板，請下載底板");
    if (target === "board" || target === "pins") {
      checkMount(mount, target === "pins");
      return {
        data: M.makeSTL(mount, target),
        name:
          target === "board"
            ? `pegboard-${mount.width}x${mount.height}mm.stl`
            : `removable-posts-${mount.pins.length}pcs.stl`,
        mime: "model/stl",
        note:
          target === "board"
            ? "底盤已平放至 Z=0。"
            : "桿件已分開排列，底面 Z=0。",
      };
    }
    if (!poses?.length) throw Error("沒有可下載的齒輪");
    if (target === "kit") {
      const files = poses.map((p, i) => ({
        name: `gears/gear-${String(i + 1).padStart(2, "0")}-${p.type}.stl`,
        data: X.makeSTL([{ ...p, x: 0, y: 0, z: 0 }]),
      }));
      const coupled =
        globalThis.GearCoupler?.poses(
          poses.map((p) => ({ ...p, mountContext: p.mountContext || mount })),
        ) || [];
      coupled.forEach((p, i) =>
        files.push({
          name: `couplers/motor-coupler-${i + 1}.stl`,
          data: X.makeSTL([
            { ...p, x: 0, y: 0, z: -(p.support?.profile[0][1] || 0) },
          ]),
        }),
      );
      if (mount?.settings.enabled) {
        checkMount(mount);
        if (mount.pins.length && !mount.settings.adaptive)
          checkMount(mount, true);
        files.push({
          name: "mount/pegboard.stl",
          data: M.makeSTL(mount, "board"),
        });
        if (mount.pins.length && !mount.settings.adaptive)
          files.push({
            name: "mount/removable-posts.stl",
            data: M.makeSTL(mount, "pins"),
          });
      }
      const warnings = mount?.settings.enabled ? mount.warnings : [];
      files.push({
        name: "README.txt",
        data: `Gear Workbench 列印包\n聯軸器：${coupled.length} 件（獨立 STL，軸孔配合需試印確認，未含止付螺絲）。\n${coupled
          .filter((p) => p.type === "coupler")
          .map(
            (p) =>
              p.name +
              "：" +
              (p.shape === "double-d"
                ? "雙 D 型"
                : p.shape === "d"
                  ? "D 型"
                  : "圓型") +
              "孔 Ø" +
              p.shaft +
              " mm，削平 " +
              (p.shape !== "round" ? p.flat : 0) +
              " mm，馬達端長 " +
              p.body +
              " mm，孔深 " +
              (p.holeFloor > 0
                ? p.height - p.holeFloor + " mm（盲孔）"
                : "貫通"),
          )
          .join(
            "\n",
          )}\n單位：mm。每個齒輪為獨立檔案，底面 Z=0；底盤與桿件亦位於 Z=0。\n請分件列印後組裝，各檔案需在切片器自行排版。自適應模式的支撐桿已與底板融合；齒輪套在固定桿上轉動。接底板聯軸器採一體軸，六角孔可通過下方圓柱；請先試印確認間隙。齒輪依目前姿態輸出，已套用列印間隙。\n一對齒輪總齒側間隙：${(poses[0].backlash || 0) * 2} mm\n軸孔／桿徑差：${mount?.settings.shaftClearance ?? "未設定"} mm；底盤孔／插腳直徑差：${mount?.settings.clearance ?? "未設定"} mm。\n${poses.map((p, i) => `gear-${String(i + 1).padStart(2, "0")}-${p.type}.stl: ${p.name}，組裝中心 (${p.x}, ${p.y}, ${p.z}) mm，旋轉 ${p.rotation || 0} rad`).join("\n")}\n${warnings?.join("\n") || ""}\n`,
      });
      return {
        data: zip(files),
        name: "gear-print-kit.zip",
        mime: "application/zip",
        note: `整套列印包：${poses.length} 個獨立齒輪檔${coupled.length ? "＋" + coupled.length + " 個聯軸器" : ""}${mount?.settings.enabled ? "＋底盤" + (mount.pins.length ? "＋桿件" : "") : ""}及說明；全部底面 Z=0，請在切片器分件排版。`,
      };
    }
    const data =
      format === "stl"
        ? X.makeSTL(poses)
        : format === "step"
          ? X.makeSTEP(poses)
          : X.makeDXF(poses);
    return {
      data,
      name:
        (target === "all" ? "gear-assembly" : "selected-gear") + "." + format,
      mime:
        format === "stl"
          ? "model/stl"
          : format === "step"
            ? "application/step"
            : "image/vnd.dxf",
      note:
        `${poses.length} 個齒輪 · mm。` +
        (format === "dxf"
          ? "XY 投影輪廓。"
          : poses.length > 1
            ? "保留組裝位置；列印請改用整套列印包分件輸出。"
            : "保留目前位置。"),
    };
  }
  return { build, zip };
})();
