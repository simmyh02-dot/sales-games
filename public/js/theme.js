/* ---------------------------------------------------------------------- */
/* Theme: dark "Flow" (animated hue) vs light "Still" crimson.            */
/* The attribute is set synchronously so there's no flash; the toggle     */
/* button is injected once the DOM is ready.                              */
/* ---------------------------------------------------------------------- */
(() => {
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
  function swap(theme) {
    root.classList.add("theme-switching");
    apply(theme);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove("theme-switching"))
    );
  }

  // Run immediately (works even from <head>) so the first paint is correct.
  apply(current());

  function buildToggle() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "Switch between Flow and Still themes");
    btn.innerHTML = '<span class="tt-dot"></span><span class="tt-label"></span>';
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      localStorage.setItem(KEY, next);
      swap(next);
    });
    return btn;
  }

  function mount() {
    if (document.querySelector(".theme-toggle")) return;

    // Prefer an existing top-bar container; fall back to a fixed corner button.
    const host =
      document.getElementById("theme-toggle-slot") ||
      document.querySelector(".topbar-right") ||
      document.querySelector(".home-topbar") ||
      document.querySelector(".lp-nav-inner") ||
      document.querySelector(".lp-nav") ||
      document.querySelector(".topbar");

    const toggle = buildToggle();

    if (host) {
      // Put it first so it sits left of the auth widget in the right-aligned bars.
      host.insertBefore(toggle, host.firstChild);
    } else {
      toggle.style.position = "fixed";
      toggle.style.top = "16px";
      toggle.style.right = "16px";
      toggle.style.zIndex = "50";
      document.body.appendChild(toggle);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
