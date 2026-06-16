/* ==========================================================================
   Shared score engine — Sales Camp Games
   Stores points in localStorage. "Today" resets the daily counter but keeps
   the all-time total. Every mode calls SCG.addScore(delta) when a round ends.
   ========================================================================== */

const SCG = (() => {
  const STORAGE_KEY = "scg_score_v1";

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { total: 0, daily: {}, rounds: 0 };
      const parsed = JSON.parse(raw);
      return {
        total: parsed.total || 0,
        daily: parsed.daily || {},
        rounds: parsed.rounds || 0,
      };
    } catch {
      return { total: 0, daily: {}, rounds: 0 };
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function addScore(delta) {
    const data = load();
    const key = todayKey();
    data.total += delta;
    data.daily[key] = (data.daily[key] || 0) + delta;
    data.rounds += 1;
    save(data);
    renderAll();
    return data;
  }

  function getToday() {
    const data = load();
    return data.daily[todayKey()] || 0;
  }

  function getTotal() {
    return load().total;
  }

  function getRounds() {
    return load().rounds;
  }

  function fmtSigned(n) {
    if (n > 0) return `+${n}`;
    return `${n}`;
  }

  function renderPill() {
    const todayEl = document.querySelector("[data-scg-today]");
    const totalEl = document.querySelector("[data-scg-total]");
    if (!todayEl && !totalEl) return;

    const today = getToday();
    const total = getTotal();

    if (todayEl) {
      todayEl.textContent = fmtSigned(today);
      todayEl.classList.remove("positive", "negative");
      if (today > 0) todayEl.classList.add("positive");
      if (today < 0) todayEl.classList.add("negative");
    }
    if (totalEl) {
      totalEl.textContent = total;
    }
  }

  function renderDashboard() {
    const todayCard = document.querySelector("[data-scg-today-card]");
    const totalCard = document.querySelector("[data-scg-total-card]");
    const roundsCard = document.querySelector("[data-scg-rounds-card]");
    if (!todayCard && !totalCard && !roundsCard) return;

    const today = getToday();
    const total = getTotal();
    const rounds = getRounds();

    if (todayCard) {
      todayCard.textContent = fmtSigned(today);
      todayCard.classList.remove("positive", "negative");
      if (today > 0) todayCard.classList.add("positive");
      if (today < 0) todayCard.classList.add("negative");
    }
    if (totalCard) totalCard.textContent = total;
    if (roundsCard) roundsCard.textContent = rounds;
  }

  function renderAll() {
    renderPill();
    renderDashboard();
  }

  document.addEventListener("DOMContentLoaded", renderAll);

  return { addScore, getToday, getTotal, getRounds, renderAll };
})();
