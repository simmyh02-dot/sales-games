/* =====================================================================
   Sales Camp AI — Previous Calls
   Lists the conversations the trainee explicitly saved, opens one for
   reading, and downloads any of them as a PDF.
   ===================================================================== */

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    signedOut: $("pc-signedout"),
    filters:   $("pc-filters"),
    list:      $("pc-list"),
    empty:     $("pc-empty"),

    reader:      $("pc-reader"),
    readerTitle: $("pc-reader-title"),
    readerMeta:  $("pc-reader-meta"),
    readerBody:  $("pc-reader-body"),
    readerClose: $("pc-reader-close"),
    readerDelete:$("pc-reader-delete"),
    readerDownload: $("pc-reader-download"),
  };

  let calls  = [];
  let filter = "all";
  let openId = null;

  /* ---- helpers ---- */

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  function when(ms) {
    const d = new Date(Number(ms) || Date.now());
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
           " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function matches(call) {
    if (filter === "all")      return true;
    if (filter === "reviewed") return !!call.reviewed;
    return call.mode === filter;
  }

  /* ---- list ---- */

  function render() {
    const shown = calls.filter(matches);

    if (!calls.length) {
      els.list.innerHTML = "";
      els.empty.style.display = "block";
      els.empty.innerHTML = `
        <p>No saved conversations yet.</p>
        <p>After a call, hit <strong>Save this conversation</strong> on the debrief -
        or say yes when we ask after you end a call without a review.</p>
        <p><a href="/pages/sales-call.html">Run a call →</a></p>`;
      els.filters.style.display = "none";
      return;
    }

    els.filters.style.display = "flex";
    els.empty.style.display = shown.length ? "none" : "block";
    if (!shown.length) els.empty.innerHTML = "<p>Nothing saved in this category yet.</p>";

    els.list.innerHTML = shown.map((c) => {
      const score = Number.isFinite(c.score) ? `<span class="pc-score">${c.score}/10</span>` : "";
      const tags = [
        `<span class="pc-tag">${c.mode === "setter" ? "Setter" : "Closer"}</span>`,
        c.persona ? `<span class="pc-tag">${esc(c.persona)}</span>` : "",
        c.section ? `<span class="pc-tag">${esc(c.section)}</span>` : "",
        c.reviewed ? `<span class="pc-tag pc-tag-good">Debrief</span>` : `<span class="pc-tag">No review</span>`,
      ].join("");

      return `
        <article class="pc-card" data-id="${c.id}">
          <div class="pc-card-main">
            <div class="pc-card-head">
              <h3>${esc(c.label || "Sales call")}</h3>
              ${score}
            </div>
            <div class="pc-card-tags">${tags}</div>
            <div class="pc-card-sub">${when(c.created_at)} · ${c.turns} messages${c.outcome ? " · " + esc(c.outcome) : ""}</div>
          </div>
          <div class="pc-card-actions">
            <button class="btn btn-ghost pc-open" data-id="${c.id}">Read</button>
            <button class="btn btn-secondary pc-download" data-id="${c.id}">PDF</button>
          </div>
        </article>`;
    }).join("");
  }

  /* ---- reader ---- */

  async function open(id) {
    openId = id;
    els.reader.style.display = "flex";
    els.readerBody.innerHTML = `<p class="pc-loading">Loading...</p>`;
    els.readerTitle.textContent = "";
    els.readerMeta.textContent  = "";

    try {
      const call = await SCG_SAVED.get(id);
      els.readerTitle.textContent = call.label || "Sales call";
      els.readerMeta.textContent = [
        call.mode === "setter" ? "Setter call" : "Closer call",
        call.persona,
        call.section,
        when(call.created_at),
      ].filter(Boolean).join(" · ");

      const turns = (call.transcript || []).map((t) => `
        <div class="pc-turn pc-turn-${t.role}">
          <div class="pc-turn-role">${t.role === "user" ? "You" : "Prospect"}</div>
          <div class="pc-turn-text">${esc(t.content)}</div>
        </div>`).join("");

      const a = call.analysis;
      const debrief = a ? `
        <div class="pc-debrief">
          <div class="pc-debrief-label">// Debrief</div>
          ${Number.isFinite(a.callScore) ? `<div class="pc-debrief-score">${a.callScore}<span> / 10</span></div>` : ""}
          ${a.headline ? `<p class="pc-debrief-headline">${esc(a.headline)}</p>` : ""}
          ${a.rememberThis ? `<div class="pc-debrief-remember"><strong>Remember this:</strong> ${esc(a.rememberThis)}</div>` : ""}
          ${bullets("What you did well", a.whatYouDidWell)}
          ${bullets("Think about this next time", a.thinkAboutNextTime)}
        </div>` : `
        <div class="pc-debrief">
          <div class="pc-debrief-label">// No debrief</div>
          <p class="pc-debrief-headline">This call was ended without a review.</p>
        </div>`;

      els.readerBody.innerHTML = turns + debrief;
      els.readerBody.scrollTop = 0;
    } catch (err) {
      els.readerBody.innerHTML = `<p class="pc-loading">${esc(err.message)}</p>`;
    }
  }

  function bullets(title, items) {
    if (!Array.isArray(items) || !items.length) return "";
    return `<div class="pc-debrief-block"><h4>${esc(title)}</h4><ul>${
      items.map((i) => `<li>${esc(i)}</li>`).join("")
    }</ul></div>`;
  }

  function close() {
    els.reader.style.display = "none";
    openId = null;
  }

  async function download(id, btn) {
    const original = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = "Building..."; }
    try {
      await SCG_SAVED.downloadPdf(id);
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = original; }
    }
  }

  async function remove(id) {
    if (!confirm("Delete this saved conversation? This cannot be undone.")) return;
    try {
      await SCG_SAVED.remove(id);
      calls = calls.filter((c) => c.id !== id);
      close();
      render();
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---- events ---- */

  els.list.addEventListener("click", (e) => {
    const openBtn = e.target.closest(".pc-open");
    const dlBtn   = e.target.closest(".pc-download");
    const card    = e.target.closest(".pc-card");
    if (dlBtn)        return download(Number(dlBtn.dataset.id), dlBtn);
    if (openBtn)      return open(Number(openBtn.dataset.id));
    if (card)         return open(Number(card.dataset.id));
  });

  els.filters.addEventListener("click", (e) => {
    const btn = e.target.closest(".lesson-filter");
    if (!btn) return;
    filter = btn.dataset.filter;
    els.filters.querySelectorAll(".lesson-filter").forEach((b) => b.classList.toggle("selected", b === btn));
    render();
  });

  els.readerClose.addEventListener("click", close);
  els.reader.addEventListener("click", (e) => { if (e.target === els.reader) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openId !== null) close(); });
  els.readerDownload.addEventListener("click", () => openId !== null && download(openId, els.readerDownload));
  els.readerDelete.addEventListener("click", () => openId !== null && remove(openId));

  /* ---- boot ---- */

  async function init() {
    if (!localStorage.getItem("scg_auth_token")) {
      els.signedOut.style.display = "block";
      return;
    }
    try {
      calls = await SCG_SAVED.list();
    } catch {
      calls = [];
    }
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
