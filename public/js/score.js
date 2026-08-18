/* ==========================================================================
   score.js — Sales Camp Games silent session meter
   The user-facing points system has been removed. This module now only
   records one row per completed session (delta 0) so the server-side
   monthly session limit keeps counting. No UI is rendered.
   ========================================================================== */

const SCG = (() => {
  // Records one completed session as a billing/limit meter row. The numeric
  // score is intentionally discarded (delta 0) — points are no longer shown.
  async function addScore(_delta, mode) {
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
        body: JSON.stringify({ delta: 0, mode: mode || "unknown" }),
      });
    } catch { /* fire-and-forget, silent fail */ }
  }

  // No-op stubs kept so callers (auth.js) don't need to change.
  function syncFromServer() {}
  function renderAll() {}

  return { addScore, syncFromServer, renderAll };
})();
