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
          ${Array.isArray(a.turningPoints) ? newShape(a) : oldShape(a)}
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

  // Calls saved before the debrief redesign: a lesson and two bullet lists.
  function oldShape(a) {
    return `
      ${a.rememberThis ? `<div class="pc-debrief-remember"><strong>Remember this:</strong> ${esc(a.rememberThis)}</div>` : ""}
      ${bullets("What you did well", a.whatYouDidWell)}
      ${bullets("Think about this next time", a.thinkAboutNextTime)}`;
  }

  // Calls saved since: the same five blocks the live debrief shows, in the
  // reader's quieter register.
  function newShape(a) {
    const nc = a.nextCall || {};
    const next = (nc.change || nc.tryLine || nc.keep) ? `
      <div class="pc-debrief-remember">
        ${nc.change ? `<div><strong>Change:</strong> ${esc(nc.change)}</div>` : ""}
        ${nc.tryLine ? `<div><strong>Try:</strong> ${esc(nc.tryLine)}</div>` : ""}
        ${nc.keep ? `<div><strong>Keep:</strong> ${esc(nc.keep)}</div>` : ""}
      </div>` : "";

    const VERDICT = { good: "Keep this", improve: "Could be sharper", bad: "Watch this" };
    const moments = (a.turningPoints || []).length ? `
      <div class="pc-debrief-block"><h4>Turning points</h4>
        ${a.turningPoints.map((t) => `
          <div class="db-moment db-moment-${esc(t.verdict || "improve")}">
            <div class="db-moment-verdict">${VERDICT[t.verdict] || "Could be sharper"}</div>
            <div class="db-moment-quote"><span class="db-who">You</span> &ldquo;${esc(t.quote)}&rdquo;</div>
            ${t.prospectReply ? `<div class="db-moment-reply"><span class="db-who">Them</span> &ldquo;${esc(t.prospectReply)}&rdquo;</div>` : ""}
            ${t.what ? `<div class="db-moment-what">${esc(t.what)}</div>` : ""}
            ${t.sayInstead ? `<div class="db-moment-alt"><span class="db-alt-label">Say instead</span>${esc(t.sayInstead)}</div>` : ""}
          </div>`).join("")}
      </div>` : "";

    const steps = a.scorecard && Array.isArray(a.scorecard.steps) ? a.scorecard.steps : (a.structure || []);
    const LABEL = { hit: "Hit", partial: "Partial", missed: "Missed" };
    const card = steps.length ? `
      <div class="pc-debrief-block"><h4>Scorecard${a.scorecard && a.scorecard.focus ? " · " + esc(a.scorecard.focus) : ""}</h4>
        <div class="setter-stages">${steps.map((st) => `
          <div class="setter-stage stage-${esc(st.status || "missed")}">
            <div class="setter-stage-head">
              <span class="setter-stage-name">${esc(st.label || st.key || "")}</span>
              <span class="setter-stage-badge stage-${esc(st.status || "missed")}">${LABEL[st.status] || "Missed"}</span>
            </div>
            ${st.note ? `<div class="setter-stage-note">${esc(st.note)}</div>` : ""}
          </div>`).join("")}
        </div>
      </div>` : "";

    const r = a.reveal;
    const reveal = r && (r.hidden || (r.beliefs || []).length) ? `
      <div class="pc-debrief-block"><h4>What they were holding back</h4>
        ${r.disposition ? `<div class="db-disposition"><span class="db-disp-chip">${esc(r.disposition)}</span></div>` : ""}
        ${r.hidden ? `<div class="db-hidden ${r.hiddenSurfaced ? "surfaced" : ""}"><div class="db-hidden-text">&ldquo;${esc(r.hidden)}&rdquo;</div>${r.hiddenNote ? `<div class="db-hidden-note">${esc(r.hiddenNote)}</div>` : ""}</div>` : ""}
        <div class="db-beliefs">${(r.beliefs || []).map((b) => {
          const cls = !b.surfaced ? "quiet" : b.handled ? "handled" : "missed";
          const mark = !b.surfaced ? "&ndash;" : b.handled ? "&#10003;" : "&#10007;";
          const tail = !b.surfaced ? "never came up" : b.handled ? (b.evidence || "handled") : (b.evidence || "not handled");
          return `<div class="db-belief db-belief-${cls}"><span class="db-belief-mark">${mark}</span><span class="db-belief-text">${esc(b.text)}</span><span class="db-belief-tail">${esc(tail)}</span></div>`;
        }).join("")}</div>
      </div>` : "";

    const n = a.numbers;
    const numbers = n && Number.isFinite(n.talkRatio) ? `
      <div class="pc-debrief-block"><h4>By the numbers</h4>
        <ul>
          <li>Your words / theirs: ${n.talkRatio} / ${100 - n.talkRatio}</li>
          <li>Questions you asked: ${n.questions} in ${n.lines} lines</li>
          <li>${a.structure ? "Closer call positioned on" : "Pitch came on"}: ${n.pitchedAtLine ? "line " + n.pitchedAtLine : "not in this transcript"}</li>
          <li>Objections raised / handled: ${n.raised} / ${n.handled}</li>
        </ul>
      </div>` : "";

    return card + moments + reveal + next + numbers;
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
