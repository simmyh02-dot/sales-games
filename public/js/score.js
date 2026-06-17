/* ==========================================================================
   score.js — Sales Camp Games score engine
   When the user is signed in, scores are posted to the server and totals
   are fetched from there. Falls back to localStorage when not signed in.
   ========================================================================== */

const SCG = (() => {
  const STORAGE_KEY = "scg_score_v1";

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // --- localStorage helpers ------------------------------------------------

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { total: 0, daily: {}, rounds: 0 };
      const parsed = JSON.parse(raw);
      return { total: parsed.total || 0, daily: parsed.daily || {}, rounds: parsed.rounds || 0 };
    } catch {
      return { total: 0, daily: {}, rounds: 0 };
    }
  }

  function saveLocal(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function addLocal(delta) {
    const data = loadLocal();
    const key  = todayKey();
    data.total        += delta;
    data.daily[key]    = (data.daily[key] || 0) + delta;
    data.rounds       += 1;
    saveLocal(data);
    return data;
  }

  // --- Server helpers (when signed in) ------------------------------------

  async function postScoreToServer(delta, mode) {
    if (typeof SCG_AUTH === "undefined") return;
    const token = SCG_AUTH.getToken();
    if (!token) return;
    try {
      await fetch("/api/scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ delta, mode }),
      });
    } catch { /* fire-and-forget, silent fail */ }
  }

  async function fetchSummaryFromServer() {
    if (typeof SCG_AUTH === "undefined") return null;
    const token = SCG_AUTH.getToken();
    if (!token) return null;
    try {
      const res = await fetch("/api/scores/summary", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // Sync localStorage totals from server (called after sign-in)
  async function syncFromServer() {
    const summary = await fetchSummaryFromServer();
    if (!summary) return;
    const data = loadLocal();
    data.total  = summary.total;
    data.rounds = summary.rounds;
    data.daily[todayKey()] = summary.today;
    saveLocal(data);
    renderAll();
  }

  // --- Public addScore ------------------------------------------------------

  function addScore(delta, mode) {
    // Always update localStorage immediately for instant UI feedback
    addLocal(delta);
    renderAll();
    // Also post to server in the background
    postScoreToServer(delta, mode || "unknown");
    // After server post, re-fetch to get accurate server total
    fetchSummaryFromServer().then((summary) => {
      if (!summary) return;
      const data = loadLocal();
      data.total  = summary.total;
      data.rounds = summary.rounds;
      data.daily[todayKey()] = summary.today;
      saveLocal(data);
      renderAll();
    });
  }

  // --- Render ---------------------------------------------------------------

  function fmtSigned(n) {
    if (n > 0) return `+${n}`;
    return `${n}`;
  }

  function getLocal() {
    const data = loadLocal();
    return {
      today:  data.daily[todayKey()] || 0,
      total:  data.total,
      rounds: data.rounds,
    };
  }

  function renderPill() {
    const todayEl = document.querySelector("[data-scg-today]");
    const totalEl = document.querySelector("[data-scg-total]");
    if (!todayEl && !totalEl) return;

    const { today, total } = getLocal();

    if (todayEl) {
      todayEl.textContent = fmtSigned(today);
      todayEl.classList.remove("positive", "negative");
      if (today > 0) todayEl.classList.add("positive");
      if (today < 0) todayEl.classList.add("negative");
    }
    if (totalEl) totalEl.textContent = total;
  }

  function renderDashboard() {
    const todayCard  = document.querySelector("[data-scg-today-card]");
    const totalCard  = document.querySelector("[data-scg-total-card]");
    const roundsCard = document.querySelector("[data-scg-rounds-card]");
    if (!todayCard && !totalCard && !roundsCard) return;

    const { today, total, rounds } = getLocal();

    if (todayCard) {
      todayCard.textContent = fmtSigned(today);
      todayCard.classList.remove("positive", "negative");
      if (today > 0) todayCard.classList.add("positive");
      if (today < 0) todayCard.classList.add("negative");
    }
    if (totalCard)  totalCard.textContent  = total;
    if (roundsCard) roundsCard.textContent = rounds;
  }

  function renderAll() {
    renderPill();
    renderDashboard();
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderAll();
    // If already signed in, sync from server on page load
    syncFromServer();
  });

  return { addScore, syncFromServer, renderAll, getLocal };
})();
