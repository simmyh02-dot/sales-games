/* ---------------------------------------------------------------------- */
/* Language (i18n) — Phase 1: pick the language the AI trains you in.       */
/* Because the product is mostly AI-generated, switching the *training*     */
/* language is a tiny change: we inject one instruction server-side. The     */
/* static UI chrome (buttons, nav, labels) stays English for now (Phase 2). */
/*                                                                          */
/* This module, loaded early in <head> like theme.js:                       */
/*   - stores the chosen language (localStorage, key `scg_lang`)             */
/*   - wraps fetch to add `language` to every /api POST body, so all AI      */
/*     endpoints switch language without each call site opting in            */
/*   - builds the Settings selector and renders per-lesson flags             */
/* ---------------------------------------------------------------------- */
const SCG_LANG = (() => {
  const KEY = "scg_lang";

  // Launch set. Phase 1 works for ANY language the model speaks, so offering
  // a new one is just another row here (its UI chrome stays English until
  // Phase 2). `native` is what the option reads as in its own language.
  const LANGS = [
    { code: "en", name: "English",    native: "English" },
    { code: "sv", name: "Swedish",    native: "Svenska" },
    { code: "es", name: "Spanish",    native: "Español" },
    { code: "de", name: "German",     native: "Deutsch" },
    { code: "fr", name: "French",     native: "Français" },
    { code: "no", name: "Norwegian",  native: "Norsk" },
    { code: "da", name: "Danish",     native: "Dansk" },
    { code: "fi", name: "Finnish",    native: "Suomi" },
    { code: "it", name: "Italian",    native: "Italiano" },
    { code: "nl", name: "Dutch",      native: "Nederlands" },
    { code: "pt", name: "Portuguese", native: "Português" },
  ];
  const CODES = LANGS.map((l) => l.code);
  const byCode = Object.fromEntries(LANGS.map((l) => [l.code, l]));

  // Inline SVG flags (3:2, viewBox 0 0 24 16). Hand-rolled and geometric so
  // they render identically on Windows, where 🇸🇪/🇬🇧 emoji degrade to letters.
  // Nordic flags share an off-centre cross; tricolours are trivial rects.
  const nordic = (field, cross) =>
    `<rect width="24" height="16" fill="${field}"/>` +
    `<rect x="7" width="3" height="16" fill="${cross}"/>` +
    `<rect y="6.5" width="24" height="3" fill="${cross}"/>`;
  const vert = (a, b, c) =>
    `<rect width="8" height="16" fill="${a}"/>` +
    `<rect x="8" width="8" height="16" fill="${b}"/>` +
    `<rect x="16" width="8" height="16" fill="${c}"/>`;
  const horiz = (a, b, c) =>
    `<rect width="24" height="16" fill="${a}"/>` +
    `<rect y="5.33" width="24" height="5.34" fill="${b}"/>` +
    `<rect y="10.67" width="24" height="5.33" fill="${c}"/>`;

  const FLAGS = {
    // Union Jack, simplified: navy field, white then red saltire, white then
    // red upright cross. Not heraldically exact, but reads as the UK flag.
    en:
      `<rect width="24" height="16" fill="#012169"/>` +
      `<path d="M0 0 L24 16 M24 0 L0 16" stroke="#fff" stroke-width="3"/>` +
      `<path d="M0 0 L24 16 M24 0 L0 16" stroke="#C8102E" stroke-width="1.5"/>` +
      `<rect x="9.5" width="5" height="16" fill="#fff"/>` +
      `<rect y="5.5" width="24" height="5" fill="#fff"/>` +
      `<rect x="10.5" width="3" height="16" fill="#C8102E"/>` +
      `<rect y="6.5" width="24" height="3" fill="#C8102E"/>`,
    sv: nordic("#005293", "#FECB00"),
    no:
      `<rect width="24" height="16" fill="#BA0C2F"/>` +
      `<rect x="6.5" width="4" height="16" fill="#fff"/>` +
      `<rect y="6" width="24" height="4" fill="#fff"/>` +
      `<rect x="7.5" width="2" height="16" fill="#00205B"/>` +
      `<rect y="7" width="24" height="2" fill="#00205B"/>`,
    da: nordic("#C8102E", "#fff"),
    fi: nordic("#fff", "#003580"),
    fr: vert("#0055A4", "#fff", "#EF4135"),
    it: vert("#008C45", "#fff", "#CD212A"),
    nl: horiz("#AE1C28", "#fff", "#21468B"),
    de: horiz("#000", "#DD0000", "#FFCE00"),
    es:
      `<rect width="24" height="16" fill="#AA151B"/>` +
      `<rect y="4" width="24" height="8" fill="#F1BF00"/>`,
    pt:
      `<rect width="24" height="16" fill="#DA291C"/>` +
      `<rect width="9.5" height="16" fill="#046A38"/>` +
      `<circle cx="9.5" cy="8" r="2.2" fill="#FFE900" stroke="#046A38" stroke-width="0.6"/>`,
  };
  // Neutral flag for lessons saved before language was tracked.
  const UNKNOWN =
    `<rect width="24" height="16" fill="var(--panel-border)"/>` +
    `<text x="12" y="12" font-size="10" text-anchor="middle" fill="var(--text-2)">?</text>`;

  function get() {
    const saved = localStorage.getItem(KEY);
    return CODES.includes(saved) ? saved : "en";
  }
  function set(code) {
    const next = CODES.includes(code) ? code : "en";
    localStorage.setItem(KEY, next);
    return next;
  }
  function name(code) { return (byCode[code] || {}).name || null; }

  // Return an <svg> string for a lesson card. `code` may be null/unknown.
  function flagSvg(code) {
    const body = FLAGS[code] || UNKNOWN;
    const label = name(code) || "Unknown language";
    return `<svg class="flag" viewBox="0 0 24 16" role="img" aria-label="${label}">${body}</svg>`;
  }

  // ---- Settings selector (mirrors SCG_THEME.mountToggle) ------------------
  function buildSelect() {
    const sel = document.createElement("select");
    sel.className = "settings-select";
    sel.setAttribute("aria-label", "Training language");
    const cur = get();
    sel.innerHTML = LANGS.map(
      (l) => `<option value="${l.code}"${l.code === cur ? " selected" : ""}>${l.native} — ${l.name}</option>`
    ).join("");
    sel.addEventListener("change", () => set(sel.value));
    return sel;
  }
  function mountSelect(host) {
    if (!host) return null;
    const sel = buildSelect();
    host.appendChild(sel);
    return sel;
  }

  // ---- Inject language into every /api POST -------------------------------
  // Centralised so no call site has to remember to send it, and so the two
  // endpoints that quit/end also carry it. Server ignores it where unused;
  // "en" produces no language rule server-side.
  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (
        init && typeof init.body === "string" &&
        (init.method || "GET").toUpperCase() === "POST" &&
        url.indexOf("/api/") !== -1 &&
        init.body.trim().charAt(0) === "{"
      ) {
        const obj = JSON.parse(init.body);
        if (obj && typeof obj === "object" && !Array.isArray(obj) && obj.language == null) {
          obj.language = get();
          init = Object.assign({}, init, { body: JSON.stringify(obj) });
        }
      }
    } catch (_) {
      /* On any hiccup, leave the request exactly as it was. */
    }
    return _fetch(input, init);
  };

  return { LANGS, get, set, name, flagSvg, buildSelect, mountSelect };
})();
