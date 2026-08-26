/* ==========================================================================
   lessons.js — the Lessons library for Sales Camp Games
   Lists the takeaways saved after each Sales Call (Setter + Closer), and lets
   the user review, pin and filter them. Requires sign-in + the database.
   ========================================================================== */

const SCG_LESSONS = (() => {
  const els = {};
  let all = [];               // every lesson from the server
  let filter = "all";         // all | pinned | unread | setter | closer
  let personaFilter = "all";
  let loading = false;

  function $(id) { return document.getElementById(id); }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  function fmtDate(ms) {
    const n = Number(ms);
    if (!n) return "";
    const d = new Date(n);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  async function authFetch(url, opts = {}) {
    const token = (typeof SCG_AUTH !== "undefined") ? SCG_AUTH.getToken() : null;
    if (!token) return null;
    return fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...(opts.headers || {}) },
    });
  }

  function signedIn() {
    return typeof SCG_AUTH !== "undefined" && !!SCG_AUTH.getToken();
  }

  // --- Load ----------------------------------------------------------------

  async function load() {
    if (loading) return;
    loading = true;

    if (!signedIn()) {
      els.signedOut.style.display = "block";
      els.controls.style.display  = "none";
      els.list.innerHTML = "";
      els.empty.style.display = "none";
      loading = false;
      return;
    }
    els.signedOut.style.display = "none";

    try {
      const res = await authFetch("/api/lessons");
      if (!res || res.status === 401) { els.signedOut.style.display = "block"; els.controls.style.display = "none"; loading = false; return; }
      const data = await res.json().catch(() => ({}));
      if (data.dbDisabled) {
        els.controls.style.display = "none";
        els.list.innerHTML = "";
        els.empty.style.display = "block";
        els.empty.textContent = "Lessons need the database to be configured.";
        loading = false;
        return;
      }
      all = data.lessons || [];
      populatePersonaFilter();
      render();
    } catch {
      els.empty.style.display = "block";
      els.empty.textContent = "Couldn't load your lessons.";
    }
    loading = false;
  }

  function populatePersonaFilter() {
    const personas = [...new Set(all.map((l) => l.persona).filter(Boolean))].sort();
    const current = els.personaFilter.value;
    els.personaFilter.innerHTML =
      `<option value="all">All personas</option>` +
      personas.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
    // keep selection if still valid
    if (personas.includes(current)) els.personaFilter.value = current;
    else { els.personaFilter.value = "all"; personaFilter = "all"; }
  }

  // --- Filter + render -----------------------------------------------------

  function visibleLessons() {
    return all.filter((l) => {
      if (filter === "pinned" && !l.pinned) return false;
      if (filter === "unread" && l.reviewed) return false;
      if (filter === "setter" && (l.source || "").toLowerCase() !== "setter") return false;
      if (filter === "closer" && (l.source || "").toLowerCase() !== "closer") return false;
      if (personaFilter !== "all" && l.persona !== personaFilter) return false;
      return true;
    });
  }

  function render() {
    els.controls.style.display = "flex";

    if (!all.length) {
      els.list.innerHTML = "";
      els.empty.style.display = "block";
      els.empty.textContent = "No lessons yet. Run a Sales Call and your key takeaway will be saved here.";
      return;
    }

    const items = visibleLessons();
    if (!items.length) {
      els.list.innerHTML = "";
      els.empty.style.display = "block";
      els.empty.textContent = "No lessons match this filter.";
      return;
    }
    els.empty.style.display = "none";

    els.list.innerHTML = items.map((l) => {
      const src = (l.source || "").toLowerCase();
      const reviewed = !!l.reviewed;
      const pinned = !!l.pinned;
      return `
        <div class="lesson-card${reviewed ? " reviewed" : ""}${pinned ? " pinned" : ""}" data-id="${l.id}">
          <div class="lesson-card-top">
            <div class="lesson-badges">
              ${typeof SCG_LANG !== "undefined"
                ? `<span class="lesson-flag" title="${SCG_LANG.name(l.language) || "Language not recorded"}">${SCG_LANG.flagSvg(l.language)}</span>`
                : ""}
              <span class="lesson-badge source-${src || "closer"}">${esc(l.source || "Call")}</span>
              ${l.persona ? `<span class="lesson-badge persona">${esc(l.persona)}</span>` : ""}
              ${typeof l.call_score === "number" ? `<span class="lesson-score">${l.call_score}/100</span>` : ""}
              <span class="lesson-date">${fmtDate(l.created_at)}</span>
            </div>
            <div class="lesson-actions">
              <button class="lesson-act lesson-pin${pinned ? " on" : ""}" data-act="pin" title="${pinned ? "Unpin" : "Pin"}">${pinned ? "★" : "☆"}</button>
              <button class="lesson-act lesson-review${reviewed ? " on" : ""}" data-act="review" title="${reviewed ? "Mark unread" : "Mark reviewed"}">✓</button>
              <button class="lesson-act lesson-del" data-act="delete" title="Delete">✕</button>
            </div>
          </div>
          <div class="lesson-content">${esc(l.content)}</div>
          ${l.headline ? `<div class="lesson-headline">${esc(l.headline)}</div>` : ""}
        </div>`;
    }).join("");
  }

  // --- Actions -------------------------------------------------------------

  async function patchLesson(id, body) {
    const res = await authFetch(`/api/lessons/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    return res && res.ok;
  }

  async function onListClick(e) {
    const btn = e.target.closest(".lesson-act");
    if (!btn) return;
    const card = btn.closest(".lesson-card");
    const id = parseInt(card.dataset.id, 10);
    const lesson = all.find((l) => l.id === id);
    if (!lesson) return;
    const act = btn.dataset.act;

    if (act === "pin") {
      const next = !lesson.pinned;
      if (await patchLesson(id, { pinned: next })) { lesson.pinned = next; render(); }
    } else if (act === "review") {
      const next = !lesson.reviewed;
      if (await patchLesson(id, { reviewed: next })) { lesson.reviewed = next; render(); }
    } else if (act === "delete") {
      const res = await authFetch(`/api/lessons/${id}`, { method: "DELETE" });
      if (res && res.ok) { all = all.filter((l) => l.id !== id); populatePersonaFilter(); render(); }
    }
  }

  // --- Init ----------------------------------------------------------------

  function init() {
    els.signedOut     = $("lessons-signedout");
    els.controls      = $("lessons-controls");
    els.filters       = $("lessons-filters");
    els.personaFilter = $("persona-filter");
    els.list          = $("lessons-list");
    els.empty         = $("lessons-empty");
    if (!els.list) return;

    els.filters.addEventListener("click", (e) => {
      const btn = e.target.closest(".lesson-filter");
      if (!btn) return;
      [...els.filters.children].forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      filter = btn.dataset.filter;
      render();
    });
    els.personaFilter.addEventListener("change", () => { personaFilter = els.personaFilter.value; render(); });
    els.list.addEventListener("click", onListClick);

    load();
  }

  document.addEventListener("DOMContentLoaded", init);

  // Called by auth.js when the signed-in user changes.
  return { refresh: load };
})();
