/* ---------------------------------------------------------------------- */
/* Theme: dark "Glow" (animated hue) vs light "Light" crimson.            */
/* The attribute is applied synchronously so the first paint is correct.  */
/* The toggle control now lives in Settings — theme.js only applies the   */
/* saved theme and exposes SCG_THEME for Settings to build the switch.    */
/* ---------------------------------------------------------------------- */
const SCG_THEME = (() => {
  const KEY = "scg_theme";
  const root = document.documentElement;

  function current() {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
  }

  // Toggling swaps a lot of var()-derived colours at once. Chrome will "stick"
  // a transitioned property when the variable feeding it changes, so suppress
  // transitions for the single frame of the swap, then let them resume.
  function set(theme) {
    const next = theme === "light" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    root.classList.add("theme-switching");
    apply(next);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove("theme-switching"))
    );
    document.querySelectorAll(".theme-toggle").forEach(syncToggle);
    return next;
  }

  function toggle() {
    return set(root.getAttribute("data-theme") === "light" ? "dark" : "light");
  }

  function syncToggle(btn) {
    const isLight = root.getAttribute("data-theme") === "light";
    btn.setAttribute("aria-pressed", String(isLight));
    const label = btn.querySelector(".tt-label");
    if (label) label.textContent = isLight ? "Light" : "Glow";
  }

  // Build a toggle button and wire it. Settings calls this with its host.
  function buildToggle() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "Switch between Glow and Light appearance");
    btn.innerHTML = '<span class="tt-dot"></span><span class="tt-label"></span>';
    btn.addEventListener("click", () => toggle());
    syncToggle(btn);
    return btn;
  }

  function mountToggle(host) {
    if (!host) return null;
    const btn = buildToggle();
    host.appendChild(btn);
    return btn;
  }

  // Apply immediately (works even from <head>) so the first paint is correct.
  apply(current());

  return { get: current, set, toggle, buildToggle, mountToggle };
})();
