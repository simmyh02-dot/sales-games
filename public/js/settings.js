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

    // The session count used to sit here as well. One page, one authoritative
    // number: the Plan section owns it now, with the bar and the definition.
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

  /* ---- Convo download settings ---- */
  function renderDownloadPrefs() {
    const current = SCG_SAVED.prefs();
    document.querySelectorAll(".pdf-opt").forEach((btn) => {
      const pref = btn.dataset.pref;
      btn.classList.toggle("selected", current[pref] === btn.dataset.value);
    });
  }

  function wireDownloadPrefs() {
    document.querySelectorAll(".pdf-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        SCG_SAVED.setPref(btn.dataset.pref, btn.dataset.value);
        renderDownloadPrefs();
      });
    });
    renderDownloadPrefs();
  }

  /* ---- Plan ---- */
  function renderPlan(status) {
    const tier = (status && status.tier) || "free";
    const label = { free: "You're on the Free plan.", pro: "You're on Pro.", power: "You're on Power — unlimited sessions." }[tier] || "";
    $("plan-current").textContent = label;
    if (tier === "power") { $("plan-pro-btn").style.display = "none"; $("plan-power-btn").style.display = "none"; }
    else if (tier === "pro") { $("plan-pro-btn").style.display = "none"; }

    // What's left of the month's allowance. Unlimited plans have no bar to draw.
    const limit = status && status.sessionsLimit;
    if (limit != null) {
      const used = Math.max(0, Number(status.sessionsUsed) || 0);
      $("plan-usage-count").textContent = `${used} of ${limit} sessions used this month`;
      $("plan-usage-fill").style.width = `${Math.min(100, (used / limit) * 100)}%`;
      $("plan-usage").style.display = "";
    }

    // Anyone who has ever paid gets the portal — cancelling has to stay reachable
    // after a downgrade, not just while the subscription is live.
    if (status && status.billable) $("plan-billing-btn").style.display = "";

    if (status && status.paymentStatus === "past_due") {
      const warn = $("plan-warning");
      warn.textContent = "Your last payment failed. Update your card in Manage billing to keep your plan.";
      warn.style.display = "";
    }
  }

  /* ---- Your data: export + account deletion ---- */
  function setDataMsg(id, text, isError) {
    const el = $(id);
    el.textContent = text || "";
    el.className = "settings-msg" + (isError ? " error" : "");
  }

  // Same trick as the saved-call PDF: the route needs the bearer token, so a
  // plain <a href> can't fetch it. Pull the blob, click a temporary link.
  async function exportData(btn) {
    btn.disabled = true;
    setDataMsg("data-msg", "Building your export…");
    try {
      const res = await authFetch("/api/user/export");
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => ({})) : {};
        throw new Error(body.error || "Could not build your export.");
      }
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = match ? match[1] : "sales-camp-ai-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setDataMsg("data-msg", "Downloaded.");
    } catch (err) {
      setDataMsg("data-msg", err.message, true);
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteAccount(btn) {
    if (($("delete-confirm-input").value || "").trim().toUpperCase() !== "DELETE") {
      return setDataMsg("delete-msg", "Type DELETE to confirm.", true);
    }
    btn.disabled = true;
    setDataMsg("delete-msg", "Deleting…");
    try {
      const res = await authFetch("/api/user", { method: "DELETE" });
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => ({})) : {};
        throw new Error(body.error || "Could not delete your account.");
      }
      // The token now points at a user that no longer exists — clear it before
      // anything else on the page tries to use it.
      if (typeof SCG_AUTH !== "undefined") SCG_AUTH.signOut();
      try { localStorage.clear(); } catch {}
      window.location.href = "/?deleted=1";
    } catch (err) {
      setDataMsg("delete-msg", err.message, true);
      btn.disabled = false;
    }
  }

  function wireDataSection() {
    $("data-export-btn").addEventListener("click", (e) => exportData(e.currentTarget));
    $("delete-open-btn").addEventListener("click", () => {
      // Fold the consequences back open at the moment they matter. Collapsed is
      // fine while browsing; it is not fine while typing the confirmation.
      const why = document.querySelector(".danger-details");
      if (why) why.open = true;
      $("delete-open-btn").style.display = "none";
      $("delete-confirm").style.display = "";
      $("delete-confirm-input").focus();
    });
    $("delete-cancel-btn").addEventListener("click", () => {
      $("delete-confirm").style.display = "none";
      $("delete-open-btn").style.display = "";
      $("delete-confirm-input").value = "";
      setDataMsg("delete-msg", "");
    });
    $("delete-confirm-btn").addEventListener("click", (e) => deleteAccount(e.currentTarget));
  }

  /* ---- Boot ---- */
  async function init() {
    // Appearance toggle + language selector
    if (typeof SCG_THEME !== "undefined") SCG_THEME.mountToggle($("theme-toggle-host"));
    if (typeof SCG_LANG !== "undefined") SCG_LANG.mountSelect($("lang-select-host"));
    if (typeof SCG_SAVED !== "undefined") wireDownloadPrefs();
    wireDataSection();

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
