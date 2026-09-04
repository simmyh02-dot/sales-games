/* ==========================================================================
   score.js — Sales Camp AI points + session meter
   Each completed session/round posts ONE row to /api/scores. The row doubles
   as the monthly session-limit meter (the server counts rows, not the delta),
   so there must be exactly one insert per result — never insert server-side too.
   `delta` now carries the real points earned (calls scale by callScore, the
   mini-games award their small per-round score).
   ========================================================================== */

const SCG = (() => {
  // Post one completed session/round as a scores row carrying the points earned.
  async function addScore(delta, mode) {
    if (typeof SCG_AUTH === "undefined") return;
    const token = SCG_AUTH.getToken();
    if (!token) return;
    const points = Number.isFinite(delta) ? Math.round(delta) : 0;
    try {
      await fetch("/api/scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ delta: points, mode: mode || "unknown" }),
      });
      // Keep the app-bar points/level chip in sync with what was just earned.
      if (typeof SCG_SHELL !== "undefined") SCG_SHELL.refreshPoints();
    } catch { /* fire-and-forget, silent fail */ }
  }

  // No-op stubs kept so callers (auth.js) don't need to change.
  function syncFromServer() {}
  function renderAll() {}

  return { addScore, syncFromServer, renderAll };
})();
