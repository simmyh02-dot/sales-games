/* =====================================================================
   admin-feedback.js — renders /api/admin/feedback.

   Same rule as the funnel page: this file is served to anyone who asks for
   it, so it is never the gate. A non-admin gets a 403 from the API and is
   bounced; the sections ship hidden so an empty shell leaks nothing either.
   ===================================================================== */

(() => {
  const $ = (id) => document.getElementById(id);

  const token = () =>
    (typeof SCG_AUTH !== "undefined" && SCG_AUTH.getToken())
      ? SCG_AUTH.getToken()
      : localStorage.getItem("scg_auth_token");

  function headers() {
    return { "Content-Type": "application/json", "Authorization": `Bearer ${token()}` };
  }

  function setMsg(id, text, isError) {
    const el = $(id);
    el.textContent = text || "";
    el.className = "settings-msg" + (isError ? " error" : "");
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  const MODE_LABELS = {
    "sales-call": "Sales Call",
    "setter": "Setter Call",
    "objection-battle": "Objection Battle",
    "pattern-recognition": "Pattern Recognition",
  };

  // Relative for anything recent, absolute once "3 weeks ago" stops being a
  // useful way to say when something happened.
  function when(ms) {
    const diff = Date.now() - ms;
    const mins = Math.round(diff / 60000);
    if (mins < 1)  return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days <= 14) return `${days}d ago`;
    return new Date(ms).toISOString().slice(0, 10);
  }

  let showArchived = false;
  let latest = null;

  /* ---- Switches ---- */

  function renderSwitches(settings) {
    const map = {
      feedback_prompt_enabled:    settings.promptEnabled,
      feedback_letterbox_enabled: settings.letterboxEnabled,
    };
    document.querySelectorAll("[data-setting]").forEach((group) => {
      const on = map[group.dataset.setting];
      group.querySelectorAll(".pdf-opt").forEach((btn) => {
        btn.classList.toggle("selected", btn.dataset.value === (on ? "on" : "off"));
      });
    });
  }

  async function setSetting(group, value) {
    setMsg("fb-switch-msg", "");
    // Paint the choice immediately — the round trip is a confirmation, not
    // the thing that decides what the button looks like.
    group.querySelectorAll(".pdf-opt").forEach((b) =>
      b.classList.toggle("selected", b.dataset.value === value));
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ key: group.dataset.setting, value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save that.");
      }
      setMsg("fb-switch-msg", value === "on" ? "On — live now." : "Off — live now.");
    } catch (e) {
      setMsg("fb-switch-msg", e.message, true);
      load();   // put the buttons back to whatever the server actually holds
    }
  }

  /* ---- Poll ---- */

  function renderPoll(poll) {
    $("fb-avg").textContent = poll.average == null ? "—" : poll.average.toFixed(1);
    $("fb-answered").textContent = Number(poll.ratings).toLocaleString();
    $("fb-answer-rate").textContent = poll.answerRate == null ? "—" : `${poll.answerRate}%`;

    // Bars are relative to the most-picked rating, so a small sample still
    // shows its shape instead of five slivers.
    const peak = Math.max(1, ...poll.distribution.map((d) => d.count));
    $("fb-bars").innerHTML = poll.distribution
      .slice()
      .reverse()
      .map((d) => `
        <div class="fb-bar-row">
          <span class="fb-bar-label">${d.rating}</span>
          <span class="fb-bar-track"><span class="fb-bar-fill" style="width:${Math.round((d.count / peak) * 100)}%"></span></span>
          <span class="fb-bar-count">${d.count}</span>
        </div>`).join("");

    const parts = [
      `${poll.asked} asked`,
      `${poll.answered} answered`,
      `${poll.dismissals} said "not now"`,
      `${poll.ratingsWithNote} of the ${poll.ratings} rating${poll.ratings === 1 ? "" : "s"} came with a note`,
      `${poll.letters} letter${poll.letters === 1 ? "" : "s"} from Settings`,
    ];
    $("fb-poll-note").textContent = parts.join(" · ") + ".";
  }

  /* ---- Posts ---- */

  function postCard(p) {
    const author = p.author
      ? `${esc(p.author.name || p.author.email)} <span class="fb-post-email">${esc(p.author.email)}</span>`
      : `<span class="fb-post-gone">deleted account</span>`;
    const tier = p.author && p.author.tier
      ? `<span class="fb-post-tier">${esc(p.author.tier)}</span>` : "";

    const badge = p.kind === "letter"
      ? `<span class="fb-post-badge letter">Letter</span>`
      : `<span class="fb-post-badge rating r${p.rating}">${p.rating}/5</span>`;

    const context = [
      p.mode ? (MODE_LABELS[p.mode] || p.mode) : null,
      Number.isFinite(p.reps) ? `${p.reps} rep${p.reps === 1 ? "" : "s"} in` : null,
    ].filter(Boolean).join(" · ");

    const body = p.message
      ? `<div class="fb-post-body">${esc(p.message)}</div>`
      : `<div class="fb-post-body empty">Rating only — no note.</div>`;

    return `
      <article class="fb-post${p.archived ? " archived" : ""}">
        <div class="fb-post-head">
          ${badge}
          <span class="fb-post-author">${author}${tier}</span>
          <span class="fb-post-when">${when(p.createdAt)}</span>
        </div>
        ${body}
        <div class="fb-post-foot">
          <span class="fb-post-context">${esc(context)}</span>
          <button class="fb-post-action" data-archive="${p.id}" data-to="${p.archived ? "0" : "1"}">
            ${p.archived ? "Un-archive" : "Archive"}
          </button>
        </div>
      </article>`;
  }

  function renderPosts(data) {
    const posts = data.posts || [];
    $("fb-thread").innerHTML = posts.length
      ? posts.map(postCard).join("")
      : `<p class="settings-hint">${showArchived ? "Nothing here yet." : "Nothing waiting — every post is archived."}</p>`;
    $("fb-thread-note").textContent = data.truncated
      ? "Showing the 200 most recent. Archive what you have handled to keep this readable."
      : "";
  }

  async function archive(id, archived) {
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) throw new Error("Could not update that post.");
      load();
    } catch (e) {
      setMsg("fb-admin-msg", e.message, true);
    }
  }

  /* ---- Boot ---- */

  async function load() {
    const t = token();
    if (!t) { setMsg("fb-admin-msg", "Sign in to view this page.", true); return; }
    try {
      const res = await fetch(`/api/admin/feedback${showArchived ? "?archived=1" : ""}`, {
        headers: headers(),
      });
      if (res.status === 403) { location.replace("/home"); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not load the feedback.");
      }
      latest = await res.json();
      for (const el of document.querySelectorAll(".fb-admin-section")) el.hidden = false;
      renderSwitches(latest.settings);
      renderPoll(latest.poll);
      renderPosts(latest);
      setMsg("fb-admin-msg", "");
    } catch (e) {
      setMsg("fb-admin-msg", e.message || "Could not load the feedback.", true);
    }
  }

  function wire() {
    // Delegated, because the posts are re-rendered on every load and the CSP
    // forbids inline handlers.
    document.addEventListener("click", (e) => {
      const setting = e.target.closest("[data-setting] .pdf-opt");
      if (setting) return setSetting(setting.closest("[data-setting]"), setting.dataset.value);

      const view = e.target.closest("#fb-view .pdf-opt");
      if (view) {
        showArchived = view.dataset.view === "all";
        document.querySelectorAll("#fb-view .pdf-opt").forEach((b) =>
          b.classList.toggle("selected", b === view));
        return load();
      }

      const arch = e.target.closest("[data-archive]");
      if (arch) return archive(arch.dataset.archive, arch.dataset.to === "1");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    wire();
    // auth.js restores the session asynchronously; give it a beat so the
    // first paint isn't a spurious "sign in" on a perfectly valid session.
    setTimeout(load, 400);
  });
})();
