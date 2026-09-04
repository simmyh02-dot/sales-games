/* =====================================================================
   Sales Camp AI — saved calls
   Keeping a conversation, listing what was kept, and pulling one down as
   a PDF. Shared by the call screen (which saves) and the Previous Calls
   page (which lists, opens and downloads).

   Only calls someone explicitly saved live here. The Skill Tree's own
   automatic call memory is a different table and is never shown here.
   ===================================================================== */

const SCG_SAVED = (() => {

  /* ---- Download preferences (Settings → Convo Download Setting) ----
     Kept in localStorage and sent as query params, because the PDF is built
     server-side. Per-device on purpose: it is a preference about the file you
     are pulling down right now, not about the account. ---- */

  const PREF_THEME = "scg_pdf_theme";   // "light" | "dark"
  const PREF_SCORE = "scg_pdf_score";   // "1" | "0"

  function prefs() {
    let theme = "light", score = "1";
    try {
      theme = localStorage.getItem(PREF_THEME) === "dark" ? "dark" : "light";
      score = localStorage.getItem(PREF_SCORE) === "0" ? "0" : "1";
    } catch { /* private mode - fall back to the defaults */ }
    return { theme, score };
  }

  function setPref(key, value) {
    try { localStorage.setItem(key === "theme" ? PREF_THEME : PREF_SCORE, value); } catch {}
  }

  function authHeaders(extra) {
    const token = localStorage.getItem("scg_auth_token");
    return Object.assign(
      { "Content-Type": "application/json" },
      token ? { "Authorization": `Bearer ${token}` } : {},
      extra || {}
    );
  }

  /* ---- API ---- */

  async function save(payload) {
    const res  = await fetch("/api/calls/save", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not save this conversation.");
    return data;
  }

  async function list() {
    const res  = await fetch("/api/calls/saved", { headers: authHeaders() });
    const data = await res.json().catch(() => ({ calls: [] }));
    return data.calls || [];
  }

  async function get(id) {
    const res  = await fetch(`/api/calls/saved/${id}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Could not load that conversation.");
    return res.json();
  }

  async function remove(id) {
    const res = await fetch(`/api/calls/saved/${id}`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) throw new Error("Could not delete that conversation.");
    return res.json().catch(() => ({ ok: true }));
  }

  // The PDF route needs the bearer token, so a plain <a href> can't fetch it.
  // Pull it as a blob, click a temporary link, then release the object URL.
  async function downloadPdf(id) {
    const p = prefs();
    const res = await fetch(`/api/calls/saved/${id}/pdf?theme=${p.theme}&score=${p.score}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Could not build the PDF.");

    const disposition = res.headers.get("Content-Disposition") || "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = match ? match[1] : `sales-camp-call-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---- Transcript shape ---- */

  // The call screen keeps history as {role: "user" | "assistant"}; saved calls
  // store the prospect's side under its own name so the PDF reads correctly.
  function toTranscript(history) {
    return (history || [])
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role === "user" ? "user" : "prospect", content: m.content }));
  }

  /* ---- "Save this conversation?" prompt ---- */

  function ask(payload, opts) {
    const options = opts || {};
    const overlay = document.createElement("div");
    overlay.className = "save-modal-overlay";
    overlay.innerHTML = `
      <div class="save-modal" role="dialog" aria-modal="true" aria-labelledby="save-modal-title">
        <h3 id="save-modal-title">Save this conversation?</h3>
        <p>Keep it in Previous Calls, where you can read it back or download it as a PDF to send to a coach.</p>
        <div class="save-modal-actions">
          <button class="btn btn-ghost" data-save-action="no">No thanks</button>
          <button class="btn btn-primary" data-save-action="yes">Save it</button>
        </div>
        <div class="save-modal-msg" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(overlay);

    const msg   = overlay.querySelector(".save-modal-msg");
    const close = () => overlay.remove();

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
      const action = e.target.getAttribute && e.target.getAttribute("data-save-action");
      if (action === "no") close();
      if (action === "yes") {
        const btn = e.target;
        btn.disabled = true;
        btn.textContent = "Saving...";
        save(payload)
          .then((data) => {
            close();
            if (options.onSaved) options.onSaved(data);
          })
          .catch((err) => {
            btn.disabled = false;
            btn.textContent = "Save it";
            msg.textContent = err.message;
          });
      }
    });

    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
    });
  }

  // Turns any "Save this conversation" button into a one-shot saver that
  // reports its own state, so both summary cards behave identically.
  function bindSaveButton(btn, buildPayload) {
    if (!btn) return;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "Saving...";
      try {
        await save(buildPayload());
        btn.textContent = "Saved to Previous Calls";
        btn.classList.add("btn-saved");
      } catch (err) {
        btn.disabled = false;
        btn.textContent = original;
        alert(err.message);
      }
    });
  }

  return { save, list, get, remove, downloadPdf, toTranscript, ask, bindSaveButton, prefs, setPref };
})();
