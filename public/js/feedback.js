/* =====================================================================
   feedback.js — the two ways someone can tell us how this is going.

   1. A pop-up after a finished rep, asking for 1-5 and an optional note.
      score.js calls maybePrompt() once a rep has been recorded, so every
      mode gets it without knowing this file exists. The server decides
      whether it is due; this file only decides when it is polite (after
      the debrief has had a moment to land).
   2. The box at the bottom of Settings, for a letter at any time.

   Both channels can be switched off from the admin panel, and both check
   that with the server rather than trusting anything held locally.
   ===================================================================== */

const SCG_FEEDBACK = (() => {
  // Long enough for the debrief to paint and be read for a beat. Any shorter
  // and the pop-up covers the thing they just worked for.
  const PROMPT_DELAY_MS = 3000;

  const SCALE = [
    { value: 1, label: "Not working for me" },
    { value: 2, label: "Needs a lot of work" },
    { value: 3, label: "It's okay" },
    { value: 4, label: "Good" },
    { value: 5, label: "Love it" },
  ];

  let open = false;   // one dialog at a time, whatever asks for it

  function authHeaders() {
    const token = (typeof SCG_AUTH !== "undefined" && SCG_AUTH.getToken())
      ? SCG_AUTH.getToken()
      : localStorage.getItem("scg_auth_token");
    return Object.assign(
      { "Content-Type": "application/json" },
      token ? { "Authorization": `Bearer ${token}` } : {}
    );
  }

  function signedIn() {
    return !!((typeof SCG_AUTH !== "undefined" && SCG_AUTH.getToken()) ||
              localStorage.getItem("scg_auth_token"));
  }

  async function state() {
    if (!signedIn()) return null;
    try {
      const res = await fetch("/api/feedback/state", { headers: authHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function ping(path) {
    // Fire and forget: none of these are worth blocking or reporting on.
    fetch(path, { method: "POST", headers: authHeaders() }).catch(() => {});
  }

  async function send(payload) {
    const res  = await fetch("/api/feedback", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    // The rate limiter answers with {error:"rate_limited", detail:"..."} —
    // the detail is the sentence written for a person to read.
    if (!res.ok) throw new Error(data.detail || data.error || "Could not send that.");
    return data;
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  /* ---- The pop-up ---- */

  function buildDialog() {
    const overlay = document.createElement("div");
    overlay.className = "fb-modal-overlay";
    const scale = SCALE.map((s) => `
            <button type="button" class="fb-rate" data-rating="${s.value}"
                    aria-pressed="false" aria-label="${s.value} out of 5 — ${esc(s.label)}">${s.value}</button>`).join("");
    overlay.innerHTML = `
      <div class="fb-modal" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <h3 id="fb-title">How is it going so far?</h3>
        <p>You have run a couple of reps. We are new, and we build this around what
           people tell us — so how has it been?</p>
        <div class="fb-scale" role="group" aria-label="Rate your experience from 1 to 5">${scale}</div>
        <div class="fb-scale-ends"><span>Not working for me</span><span>Love it</span></div>
        <div class="fb-scale-picked" id="fb-picked" aria-live="polite"></div>
        <label class="sr-only" for="fb-note">Anything you would like to add</label>
        <textarea class="fb-textarea" id="fb-note" rows="3" maxlength="2000"
                  placeholder="What would you change? (optional)"></textarea>
        <div class="fb-modal-actions">
          <button type="button" class="btn btn-ghost" data-fb="dismiss">Not now</button>
          <button type="button" class="btn btn-primary" data-fb="send" disabled>Send</button>
        </div>
        <div class="fb-modal-msg" aria-live="polite"></div>
      </div>`;
    return overlay;
  }

  function openPrompt(mode) {
    if (open) return;
    open = true;

    const overlay = buildDialog();
    document.body.appendChild(overlay);
    ping("/api/feedback/prompt/shown");

    const sendBtn = overlay.querySelector('[data-fb="send"]');
    const msg     = overlay.querySelector(".fb-modal-msg");
    const picked  = overlay.querySelector("#fb-picked");
    let rating    = null;

    function close() {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      open = false;
    }
    function dismiss() {
      ping("/api/feedback/prompt/dismiss");
      close();
    }
    function onKey(e) { if (e.key === "Escape") dismiss(); }

    overlay.addEventListener("click", (e) => {
      // Clicking the backdrop is a "not now", same as the button.
      if (e.target === overlay) return dismiss();

      const rateBtn = e.target.closest(".fb-rate");
      if (rateBtn) {
        rating = Number(rateBtn.dataset.rating);
        overlay.querySelectorAll(".fb-rate").forEach((b) => {
          const on = b === rateBtn;
          b.classList.toggle("picked", on);
          b.setAttribute("aria-pressed", String(on));
        });
        const chosen = SCALE.find((s) => s.value === rating);
        picked.textContent = chosen ? chosen.label : "";
        sendBtn.disabled = false;
        return;
      }

      const action = e.target.closest("[data-fb]");
      if (!action) return;
      if (action.dataset.fb === "dismiss") return dismiss();
      if (action.dataset.fb !== "send" || rating == null) return;

      action.disabled = true;
      action.textContent = "Sending...";
      msg.textContent = "";
      send({
        kind: "rep",
        rating,
        message: overlay.querySelector("#fb-note").value,
        mode: mode || null,
      })
        .then(() => {
          // Say thank you in place rather than vanishing — a dialog that
          // disappears the instant you press Send reads as a failure.
          overlay.querySelector(".fb-modal").innerHTML =
            `<h3>Thank you.</h3>
             <p>That goes straight to the person building this. If you ever want to
                say more, there is a feedback box at the bottom of Settings.</p>`;
          setTimeout(close, 2400);
        })
        .catch((err) => {
          action.disabled = false;
          action.textContent = "Send";
          msg.textContent = err.message;
        });
    });

    document.addEventListener("keydown", onKey);
    const first = overlay.querySelector(".fb-rate");
    if (first) first.focus();
  }

  // Called by score.js once a rep has been recorded. Everything that decides
  // whether this is due lives on the server; the delay lives here.
  async function maybePrompt(mode) {
    if (open) return;
    const s = await state();
    if (!s || !s.shouldPrompt) return;
    setTimeout(() => openPrompt(mode), PROMPT_DELAY_MS);
  }

  /* ---- The Settings box ---- */

  // The section ships hidden and only appears once the server says the channel
  // is open, so switching it off in admin removes it rather than greying it out.
  async function mountLetterbox(section) {
    if (!section) return;
    const s = await state();
    if (!s || !s.letterboxEnabled) return;
    section.hidden = false;

    const input = section.querySelector("#fb-letter");
    const btn   = section.querySelector("#fb-letter-send");
    const msg   = section.querySelector("#fb-letter-msg");
    if (!input || !btn || !msg) return;

    function setMsg(text, isError) {
      msg.textContent = text || "";
      msg.className = "settings-msg" + (isError ? " error" : "");
    }

    btn.addEventListener("click", async () => {
      const message = (input.value || "").trim();
      if (!message) return setMsg("Write something first.", true);
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "Sending...";
      setMsg("");
      try {
        await send({ kind: "letter", message });
        input.value = "";
        setMsg("Sent — thank you. It goes straight to the person building this.");
      } catch (err) {
        setMsg(err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  }

  return { maybePrompt, mountLetterbox, state };
})();
