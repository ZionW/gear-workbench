/* Local, offline UI translations. Geometry values and user-entered names are never rewritten. */
globalThis.GearI18n = (() => {
  "use strict";
  const dictionary = globalThis.GearTranslations;
  let language = "zh-Hant";
  try {
    const saved = localStorage.getItem("gear-workbench-language");
    if (["en", "ja", "ko"].includes(saved)) language = saved;
  } catch {}
  const keys = Object.keys(dictionary).sort((a, b) => b.length - a.length),
    sources = new WeakMap(),
    attributes = new WeakMap();
  function t(source) {
    if (language === "zh-Hant" || typeof source !== "string") return source;
    const i = { en: 0, ja: 1, ko: 2 }[language],
      text = source.trim();
    if (dictionary[text]) return source.replace(text, dictionary[text][i]);
    let out = source;
    const tokens = [];
    for (const key of keys)
      if (out.includes(key)) {
        const token = "\uE000" + tokens.length + "\uE001";
        out = out.split(key).join(token);
        tokens.push(dictionary[key][i]);
      }
    out = out.replace(/\uE000(\d+)\uE001/g, (_, n) => tokens[+n]);
    out = out
      .replace(
        /(\d+) 個(?:Part|部品|부품)/g,
        (_, n) =>
          ({ en: n + " parts", ja: n + " 部品", ko: n + "개 부품" })[language],
      )
      .replace(
        /(\d+) 組連動/g,
        (_, n) =>
          ({ en: n + " connections", ja: n + " 組の連動", ko: n + "개 연결" })[
            language
          ],
      );
    return out;
  }
  function apply() {
    const root = document.getElementById("gear-lab");
    if (!root) return;
    observer?.disconnect();
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const node = walk.currentNode;
      if (
        node.parentElement.closest(
          "script,style,textarea,#v-language,[data-user-content]",
        )
      )
        continue;
      const old = sources.get(node);
      const source =
        old && node.nodeValue === old.rendered ? old.source : node.nodeValue;
      const rendered = t(source);
      if (node.nodeValue !== rendered) node.nodeValue = rendered;
      sources.set(node, { source, rendered });
    }
    for (const el of root.querySelectorAll("[aria-label],[title]")) {
      let data = attributes.get(el) || {};
      for (const key of ["aria-label", "title"]) {
        if (!el.hasAttribute(key)) continue;
        const current = el.getAttribute(key),
          old = data[key],
          source = old && current === old.rendered ? old.source : current,
          rendered = t(source);
        if (current !== rendered) el.setAttribute(key, rendered);
        data[key] = { source, rendered };
      }
      attributes.set(el, data);
    }
    document.documentElement.lang = language;
    document.title = t("齒輪工坊") + " · Gear Workbench";
    observer?.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["title", "aria-label"],
    });
  }
  let observer = null,
    queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      apply();
    });
  }
  function setLanguage(value) {
    language = ["en", "ja", "ko"].includes(value) ? value : "zh-Hant";
    try {
      localStorage.setItem("gear-workbench-language", language);
    } catch {}
    apply();
    window.dispatchEvent(new Event("gear-language-change"));
  }
  document.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("v-language");
    select.value = language;
    select.addEventListener("change", () => setLanguage(select.value));
    observer = new MutationObserver(schedule);
    apply();
  });
  return { t, setLanguage, getLanguage: () => language };
})();
