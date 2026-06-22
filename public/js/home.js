/* ==========================================================================
   home.js — progress hero "Compete" leaderboard for Sales Camp Games
   Lets a signed-in user add friends by email and compare total points.
   Requires auth + a configured database on the server; degrades to a
   sign-in prompt otherwise.
   ========================================================================== */

const SCG_HOME = (() => {
  const els = {};
  let loading = false;

  function $(id) { return document.getElementById(id); }

  function levelOf(total) { return Math.floor(Math.max(0, total) / 100) + 1; }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  function setMsg(text, isError) {
    if (!els.msg) return;
    els.msg.textContent = text || "";
    els.msg.className = "ph-compete-msg" + (isError ? " error" : "");
  }

  function signedOutState() {
    els.leaderboard.innerHTML = `
      <div class="leaderboard-empty">
        Sign in to add friends and compete on total points.
      </div>`;
    if (els.form) els.form.style.display = "none";
  }

  function renderLeaderboard(entries) {
    if (els.form) els.form.style.display = "flex";
    if (!entries.length) {
      els.leaderboard.innerHTML = `<div class="leaderboard-empty">No competitors yet - add a friend below.</div>`;
      return;
    }
    els.leaderboard.innerHTML = entries.map((e, i) => {
      const rank = i + 1;
      const right = e.pending
        ? `<span class="lb-pending">Hasn't joined yet</span>`
        : `<span class="lb-points">${e.total} pts</span><span class="lb-level">Lv ${levelOf(e.total)}</span>`;
      const remove = e.you
        ? ""
        : `<button class="lb-remove" title="Remove" data-email="${esc(e.email)}">✕</button>`;
      return `
        <div class="lb-row${e.you ? " you" : ""}">
          <span class="lb-rank">${rank}</span>
          <span class="lb-name">${esc(e.name)}${e.you ? " <span class=\"lb-you\">you</span>" : ""}</span>
          <span class="lb-stats">${right}</span>
          ${remove}
        </div>`;
    }).join("");

    els.leaderboard.querySelectorAll(".lb-remove").forEach((btn) => {
      btn.addEventListener("click", () => removeRival(btn.dataset.email));
    });
  }

  async function authFetch(url, opts = {}) {
    const token = (typeof SCG_AUTH !== "undefined") ? SCG_AUTH.getToken() : null;
    if (!token) return null;
    return fetch(url, {
      ...opts,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...(opts.headers || {}) },
    });
  }

  async function load() {
    if (loading) return;
    loading = true;
    const token = (typeof SCG_AUTH !== "undefined") ? SCG_AUTH.getToken() : null;
    if (!token) { signedOutState(); loading = false; return; }

    try {
      const res = await authFetch("/api/rivals");
      if (!res || res.status === 401) { signedOutState(); loading = false; return; }
      const data = await res.json();
      if (data.dbDisabled) {
        els.leaderboard.innerHTML = `<div class="leaderboard-empty">Competing needs the database to be configured.</div>`;
        if (els.form) els.form.style.display = "none";
        loading = false;
        return;
      }
      renderLeaderboard(data.leaderboard || []);
    } catch {
      els.leaderboard.innerHTML = `<div class="leaderboard-empty">Couldn't load the leaderboard.</div>`;
    }
    loading = false;
  }

  async function addRival(email) {
    setMsg("");
    const res = await authFetch("/api/rivals", { method: "POST", body: JSON.stringify({ email }) });
    if (!res) { signedOutState(); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(data.error || "Couldn't add that person.", true); return; }
    els.email.value = "";
    setMsg(`Added ${email}.`);
    renderLeaderboard(data.leaderboard || []);
  }

  async function removeRival(email) {
    const res = await authFetch("/api/rivals", { method: "DELETE", body: JSON.stringify({ email }) });
    if (!res) { signedOutState(); return; }
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setMsg(""); renderLeaderboard(data.leaderboard || []); }
  }

  function init() {
    els.leaderboard = $("leaderboard");
    els.form        = $("add-rival-form");
    els.email       = $("rival-email");
    els.msg         = $("compete-msg");
    if (!els.leaderboard) return;

    if (els.form) {
      els.form.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = (els.email.value || "").trim();
        if (email) addRival(email);
      });
    }
    load();
  }

  document.addEventListener("DOMContentLoaded", init);

  // Called by auth.js when the signed-in user changes.
  return { refresh: load };
})();
