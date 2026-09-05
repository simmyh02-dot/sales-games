/* =====================================================================
   admin-funnel.js — renders /api/admin/funnel.

   Read-only, and the server is the thing that enforces access: this file
   is served to anyone who asks for it, so it must never be the gate. A
   non-admin gets a 403 from the API and sees nothing but the message.
   ===================================================================== */

(() => {
  const $ = (id) => document.getElementById(id);

  const token = () =>
    (typeof SCG_AUTH !== "undefined" && SCG_AUTH.getToken())
      ? SCG_AUTH.getToken()
      : localStorage.getItem("scg_auth_token");

  function setMsg(text, isError) {
    const el = $("funnel-msg");
    el.textContent = text || "";
    el.className = "settings-msg" + (isError ? " error" : "");
  }

  // A rate is null whenever its denominator is zero. Showing "0%" there would
  // read as "nobody finishes" when it actually means "nobody has started".
  const rate = (v) => (v == null ? "—" : `${v}%`);
  const num  = (v) => (v == null ? "—" : Number(v).toLocaleString());

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

  function render(data) {
    // The sections ship hidden. auth-guard only requires *a* session, not
    // this account's, so without this any signed-in user who guessed the URL
    // would read the metric names off an empty page. The API is still the
    // thing that protects the numbers; this just stops the shell leaking.
    for (const el of document.querySelectorAll(".funnel-section")) el.hidden = false;

    $("f-first-rate").textContent   = rate(data.firstRep.completionRate);
    $("f-first-cohort").textContent = num(data.firstRep.cohort);
    $("f-first-done").textContent   = num(data.firstRep.completed);

    $("f-accounts").textContent   = num(data.accounts);
    $("f-started").textContent    = num(data.startedAny);
    $("f-activation").textContent = rate(data.activationRate);

    $("f-30-starts").textContent = num(data.last30Days.starts);
    $("f-30-done").textContent   = num(data.last30Days.completions);
    $("f-30-rate").textContent   = rate(data.last30Days.completionRate);

    const modes = data.startsByMode || [];
    $("f-modes").innerHTML = modes.length
      ? modes.map((m) => `
          <div class="lb-row">
            <span class="lb-name">${esc(MODE_LABELS[m.mode] || m.mode)}</span>
            <span class="lb-points">${num(m.starts)}</span>
          </div>`).join("")
      : `<p class="settings-hint">No reps started yet.</p>`;

    $("f-note").textContent = data.note || "";
  }

  async function load() {
    const t = token();
    if (!t) { setMsg("Sign in to view this page.", true); return; }
    setMsg("Loading…");
    try {
      const res = await fetch("/api/admin/funnel", {
        headers: { "Authorization": `Bearer ${t}` },
      });
      // Not the owner — bounce, the same way auth-guard bounces a signed-out
      // visitor. Nothing here is theirs to look at, not even the labels.
      if (res.status === 403) { location.replace("/home"); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not load the funnel.");
      }
      render(await res.json());
      setMsg("");
    } catch (e) {
      setMsg(e.message || "Could not load the funnel.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // auth.js restores the session asynchronously; give it a beat so the
    // first paint isn't a spurious "sign in" on a perfectly valid session.
    setTimeout(load, 400);
  });
})();
