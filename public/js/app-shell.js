/* ==========================================================================
   app-shell.js — shared top app-bar + user menu for signed-in app pages.
   Included on every protected page (home, the game modes, skill tree,
   lessons, settings). It owns the persistent chrome:
     - brand → /home
     - a points / level chip (from /api/scores/summary)
     - an avatar button that opens a dropdown menu:
         Train  (Sales Call · Objection Battle · Pattern Recognition)
         Progress (Skill Tree · Lessons)
         Profile · Settings · Invite friends · Sign out
   auth.js stays the owner of sign-in; it just calls SCG_SHELL.setUser(user)
   so the same widget works whether or not a shell is present (landing has no
   shell and keeps its own inline auth UI).
   ========================================================================== */

const SCG_SHELL = (() => {
  // Labels are i18n keys, resolved at render time so a language change can
  // just rebuild the menu (see the scg:languagechange listener below).
  const NAV = {
    train: [
      { href: "/pages/sales-call.html",          label: "nav.salesCall", tag: "nav.salesCallTag" },
      { href: "/pages/objection-battle.html",    label: "nav.objection", tag: "nav.objectionTag" },
      { href: "/pages/pattern-recognition.html", label: "nav.pattern",   tag: "nav.patternTag" },
    ],
    progress: [
      { href: "/pages/skill-map.html", label: "nav.skillTree", tag: "nav.skillTreeTag" },
      { href: "/pages/lessons.html",   label: "nav.lessons",   tag: "nav.lessonsTag" },
    ],
  };

  // Falls back to the raw key if i18n hasn't loaded (landing has no shell).
  function t(key, vars) {
    return (typeof SCG_I18N !== "undefined") ? SCG_I18N.t(key, vars) : key;
  }

  let built = false;
  let menuOpen = false;
  let lastUser = null;   // remembered so a language rebuild can restore the menu

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  function levelOf(total) { return Math.floor(Math.max(0, total) / 100) + 1; }

  function navGroup(title, items) {
    const here = location.pathname;
    const rows = items.map((it) => {
      const active = here === it.href ? " active" : "";
      return `
        <a class="um-item${active}" href="${it.href}">
          <span class="um-item-label">${esc(t(it.label))}</span>
          <span class="um-item-tag">${esc(t(it.tag))}</span>
        </a>`;
    }).join("");
    return `<div class="um-group"><div class="um-group-label">${esc(t(title))}</div>${rows}</div>`;
  }

  function build() {
    if (built) return;
    const shell = document.querySelector(".shell");
    if (!shell) return;

    const bar = document.createElement("header");
    bar.className = "app-bar";
    bar.innerHTML = `
      <a class="app-brand" href="/home" aria-label="${esc(t("shell.brandHome"))}">
        <span class="app-brand-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"></circle>
            <circle cx="12" cy="12" r="4.5"></circle>
            <circle cx="12" cy="12" r="0.5" fill="currentColor"></circle>
          </svg>
        </span>
        <span class="app-brand-text">Sales Camp Games</span>
      </a>

      <div class="app-bar-right">
        <a class="points-chip" id="points-chip" href="/settings#progress" title="${esc(t("shell.pointsTitle"))}" style="display:none;">
          <span class="pc-total">0</span><span class="pc-sep">·</span><span class="pc-level">${esc(t("shell.level", { n: 1 }))}</span>
        </a>

        <div class="user-menu" id="user-menu">
          <button class="user-menu-trigger" id="user-menu-trigger" aria-haspopup="true" aria-expanded="false" style="display:none;"></button>
          <div id="auth-widget"></div>
          <div class="user-menu-dropdown" id="user-menu-dropdown" role="menu" hidden>
            ${navGroup("nav.train", NAV.train)}
            ${navGroup("nav.progress", NAV.progress)}
            <div class="um-group">
              <div class="um-group-label">${esc(t("common.account"))}</div>
              <a class="um-item um-link" href="/settings#profile"><span class="um-item-label">${esc(t("common.profile"))}</span></a>
              <a class="um-item um-link" href="/settings"><span class="um-item-label">${esc(t("common.settings"))}</span></a>
              <a class="um-item um-link" href="/settings#friends"><span class="um-item-label">${esc(t("common.inviteFriends"))}</span></a>
              <button class="um-item um-link um-signout" id="um-signout"><span class="um-item-label">${esc(t("common.signOut"))}</span></button>
            </div>
          </div>
        </div>
      </div>`;

    shell.insertBefore(bar, shell.firstChild);
    built = true;

    const trigger  = document.getElementById("user-menu-trigger");
    const dropdown = document.getElementById("user-menu-dropdown");
    trigger.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
    document.addEventListener("click", (e) => {
      if (menuOpen && !e.target.closest("#user-menu")) closeMenu();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
    const signout = document.getElementById("um-signout");
    if (signout) signout.addEventListener("click", () => {
      closeMenu();
      if (typeof SCG_AUTH !== "undefined") SCG_AUTH.signOut();
    });
  }

  function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }
  function openMenu() {
    const dd = document.getElementById("user-menu-dropdown");
    const tr = document.getElementById("user-menu-trigger");
    if (!dd) return;
    dd.hidden = false;
    requestAnimationFrame(() => dd.classList.add("open"));
    if (tr) tr.setAttribute("aria-expanded", "true");
    menuOpen = true;
  }
  function closeMenu() {
    const dd = document.getElementById("user-menu-dropdown");
    const tr = document.getElementById("user-menu-trigger");
    if (!dd) return;
    dd.classList.remove("open");
    if (tr) tr.setAttribute("aria-expanded", "false");
    menuOpen = false;
    setTimeout(() => { if (!menuOpen) dd.hidden = true; }, 180);
  }

  // Called by auth.js when the signed-in user is known (or null on sign-out).
  function setUser(user) {
    lastUser = user;
    if (!built) build();
    const trigger = document.getElementById("user-menu-trigger");
    const widget  = document.getElementById("auth-widget");
    if (!trigger) return;

    if (user) {
      const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
      const avatar = user.picture
        ? `<img class="um-avatar" src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer" />`
        : `<span class="um-avatar um-avatar-initials">${esc(initial)}</span>`;
      trigger.innerHTML = `${avatar}<span class="um-trigger-name">${esc(user.name || t("shell.you"))}</span>
        <svg class="um-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>`;
      trigger.style.display = "inline-flex";
      if (widget) widget.style.display = "none";
      refreshPoints();
    } else {
      trigger.style.display = "none";
      trigger.innerHTML = "";
      if (widget) widget.style.display = "";
      const chip = document.getElementById("points-chip");
      if (chip) chip.style.display = "none";
      closeMenu();
    }
  }

  async function refreshPoints() {
    const chip = document.getElementById("points-chip");
    if (!chip || typeof SCG_AUTH === "undefined") return;
    const token = SCG_AUTH.getToken();
    if (!token) { chip.style.display = "none"; return; }
    try {
      const res = await fetch("/api/scores/summary", { headers: { "Authorization": `Bearer ${token}` } });
      if (!res.ok) { chip.style.display = "none"; return; }
      const data = await res.json();
      const total = Number(data.total) || 0;
      chip.querySelector(".pc-total").textContent = total.toLocaleString();
      chip.querySelector(".pc-level").textContent = t("shell.level", { n: levelOf(total) });
      chip.style.display = "inline-flex";
    } catch { chip.style.display = "none"; }
  }

  // The bar's labels are baked into innerHTML at build time, so a language
  // switch throws the old bar away and builds a fresh one in its place.
  function rebuild() {
    const bar = document.querySelector(".app-bar");
    if (!bar) return;
    bar.remove();
    built = false;
    menuOpen = false;
    build();
    setUser(lastUser);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }

  document.addEventListener("scg:languagechange", rebuild);

  return { build, rebuild, setUser, refreshPoints, closeMenu };
})();
