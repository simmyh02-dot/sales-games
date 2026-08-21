/* ==========================================================================
   settings.js — profile, progress, appearance, friends/leaderboard, plan.
   Everything here needs a signed-in session (the page is behind auth-guard).
   Friends + live plan need the database, so they degrade gracefully when the
   server has no DB configured (local dev).
   ========================================================================== */

(() => {
  function $(id) { return document.getElementById(id); }
  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function levelOf(total) { return Math.floor(Math.max(0, total) / 100) + 1; }

  function token() { return (typeof SCG_AUTH !== "undefined") ? SCG_AUTH.getToken() : null; }
  async function authFetch(url, opts = {}) {
    const t = token();
    if (!t) return null;
    return fetch(url, { ...opts, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${t}`, ...(opts.headers || {}) } });
  }

  /* ---- Profile ---- */
  function renderProfile(user, status) {
    const avatar = $("profile-avatar");
    if (user && user.picture) {
      avatar.outerHTML = `<img id="profile-avatar" class="profile-avatar" src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer" />`;
    } else {
      avatar.className = "profile-avatar profile-avatar-initials";
      avatar.textContent = ((user && (user.name || user.email)) || "?").charAt(0).toUpperCase();
    }
    $("profile-name").textContent  = (user && user.name)  || "You";
    $("profile-email").textContent = (user && user.email) || (status && status.email) || "";

    const tier = (status && status.tier) || "free";
    $("profile-plan-badge").textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
    $("profile-plan-badge").dataset.tier = tier;

    if (status && typeof status.sessionsUsed === "number") {
      const limit = status.sessionsLimit == null ? "∞" : status.sessionsLimit;
      $("profile-sessions").textContent = `${status.sessionsUsed} / ${limit} sessions this month`;
    }
  }

  /* ---- Progress / points ---- */
  function renderProgress(summary) {
    const total  = Number(summary && summary.total)  || 0;
    const rounds = Number(summary && summary.rounds) || 0;
    const level  = levelOf(total);
    const intoLevel = total % 100;
    $("stat-total").textContent  = total.toLocaleString();
    $("stat-level").textContent  = level;
    $("stat-rounds").textContent = rounds.toLocaleString();
    $("level-fill").style.width  = intoLevel + "%";
    $("level-note").textContent  = `${100 - intoLevel} pts to Level ${level + 1}`;
  }

  /* ---- Friends / leaderboard ---- */
  let friendsLoading = false;
  function setFriendsMsg(text, isError) {
    const el = $("friends-msg");
    el.textContent = text || "";
    el.className = "settings-msg" + (isError ? " error" : "");
  }
  function renderLeaderboard(entries) {
    const lb = $("leaderboard");
    if (!entries || !entries.length) {
      lb.innerHTML = `<div class="leaderboard-empty">No competitors yet — invite a friend above.</div>`;
      return;
    }
    lb.innerHTML = entries.map((e, i) => {
      const right = e.pending
        ? `<span class="lb-pending">Hasn't joined yet</span>`
        : `<span class="lb-points">${Number(e.total).toLocaleString()} pts</span><span class="lb-level">Lv ${levelOf(e.total)}</span>`;
      const remove = e.you ? "" : `<button class="lb-remove" title="Remove" data-email="${esc(e.email)}">✕</button>`;
      return `<div class="lb-row${e.you ? " you" : ""}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${esc(e.name)}${e.you ? ' <span class="lb-you">you</span>' : ""}</span>
          <span class="lb-stats">${right}</span>${remove}
        </div>`;
    }).join("");
    lb.querySelectorAll(".lb-remove").forEach((btn) => btn.addEventListener("click", () => removeFriend(btn.dataset.email)));
  }
  async function loadFriends() {
    if (friendsLoading) return;
    friendsLoading = true;
    try {
      const res = await authFetch("/api/rivals");
      if (!res || !res.ok) { $("leaderboard").innerHTML = `<div class="leaderboard-empty">Sign in to compete.</div>`; friendsLoading = false; return; }
      const data = await res.json();
      if (data.dbDisabled) {
        $("leaderboard").innerHTML = `<div class="leaderboard-empty">Competing needs the database — available on the live site.</div>`;
        $("add-friend-form").style.display = "none";
        friendsLoading = false; return;
      }
      renderLeaderboard(data.leaderboard || []);
    } catch { $("leaderboard").innerHTML = `<div class="leaderboard-empty">Couldn't load the leaderboard.</div>`; }
    friendsLoading = false;
  }
  async function addFriend(email) {
    setFriendsMsg("");
    const res = await authFetch("/api/rivals", { method: "POST", body: JSON.stringify({ email }) });
    if (!res) return;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setFriendsMsg(data.error || "Couldn't add that person.", true); return; }
    $("friend-email").value = "";
    setFriendsMsg(`Invited ${email}.`);
    renderLeaderboard(data.leaderboard || []);
  }
  async function removeFriend(email) {
    const res = await authFetch("/api/rivals", { method: "DELETE", body: JSON.stringify({ email }) });
    if (!res) return;
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setFriendsMsg(""); renderLeaderboard(data.leaderboard || []); }
  }

  /* ---- Plan ---- */
  function renderPlan(status) {
    const tier = (status && status.tier) || "free";
    const label = { free: "You're on the Free plan.", pro: "You're on Pro.", power: "You're on Power — unlimited sessions." }[tier] || "";
    $("plan-current").textContent = label;
    if (tier === "power") { $("plan-pro-btn").style.display = "none"; $("plan-power-btn").style.display = "none"; }
    else if (tier === "pro") { $("plan-pro-btn").style.display = "none"; }
  }

  /* ---- Boot ---- */
  async function init() {
    // Appearance toggle
    if (typeof SCG_THEME !== "undefined") SCG_THEME.mountToggle($("theme-toggle-host"));

    // Friends form
    $("add-friend-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const email = ($("friend-email").value || "").trim();
      if (email) addFriend(email);
    });

    // Sign out
    $("settings-signout").addEventListener("click", () => {
      if (typeof SCG_AUTH !== "undefined") SCG_AUTH.signOut();
      window.location.href = "/";
    });

    // Data — validate session (also gives us name/picture), then fill sections.
    const user = (typeof SCG_AUTH !== "undefined") ? (await SCG_AUTH.validateSession()) || SCG_AUTH.getUser() : null;
    let status = null, summary = null;
    try { const r = await authFetch("/api/user/status"); if (r && r.ok) status = await r.json(); } catch {}
    try { const r = await authFetch("/api/scores/summary"); if (r && r.ok) summary = await r.json(); } catch {}

    renderProfile(user, status);
    renderProgress(summary);
    renderPlan(status);
    loadFriends();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
