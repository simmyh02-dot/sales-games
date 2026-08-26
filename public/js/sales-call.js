(() => {
  const TARGET_MESSAGES = 30;

  // Background prospect personas live in personas.js (SCG_PERSONAS). Each
  // carries a different TYPE of resistance. "Randomize" is the default so you
  // don't only ever train against your favourite.
  const PERSONAS = (typeof SCG_PERSONAS !== "undefined") ? SCG_PERSONAS : [];

  const els = {
    apiNotice: document.getElementById("api-notice"),
    gameArea:  document.getElementById("game-area"),

    modePanel: document.getElementById("mode-panel"),
    modeGrid:  document.getElementById("mode-grid"),

    offerPanel:      document.getElementById("offer-panel"),
    offerGrid:       document.getElementById("offer-grid"),
    offerCustomInput:document.getElementById("offer-custom-input"),
    offerNextBtn:    document.getElementById("offer-next-btn"),
    backToModeBtn:   document.getElementById("back-to-mode-btn"),

    sectionPanel:      document.getElementById("section-panel"),
    sectionGrid:       document.getElementById("section-grid"),
    backToOfferBtn:    document.getElementById("back-to-offer-btn"),
    confirmSectionBtn: document.getElementById("confirm-section-btn"),

    personalityPanel:     document.getElementById("personality-panel"),
    personalityGrid:      document.getElementById("personality-grid"),
    backToSectionBtn:     document.getElementById("back-to-section-btn"),
    confirmPersonalityBtn:document.getElementById("confirm-personality-btn"),

    callPanel:   document.getElementById("call-panel"),
    mascotRail:  document.getElementById("mascot-rail"),
    clProspect:  document.getElementById("cl-prospect"),
    clOffer:     document.getElementById("cl-offer"),
    clPersonality: document.getElementById("cl-personality"),
    clSituation: document.getElementById("cl-situation"),
    clmSituation:document.getElementById("clm-situation"),
    clmBooking:  document.getElementById("clm-booking"),
    clBooking:   document.getElementById("cl-booking"),
    callProgress:document.getElementById("call-progress"),
    chatWindow:  document.getElementById("chat-window"),
    chatInputRow:document.getElementById("chat-input-row"),
    chatInput:   document.getElementById("chat-input"),
    sendBtn:     document.getElementById("send-btn"),
    callStatus:  document.getElementById("call-status"),
    endCallBtn:  document.getElementById("end-call-btn"),
    quitCallBtn: document.getElementById("quit-call-btn"),
    summaryPanel:document.getElementById("summary-panel"),
  };

  let callMode           = null;    // "closer" | "setter"
  let selectedOffer      = null;    // shared offer/scenario, both modes
  let selectedSection    = null;
  let selectedPersonality = null;   // picker choice: a persona object or "random"
  let activePersona       = null;   // the resolved persona for the live call
  let liveBooking        = "none";  // setter only: highest booking level reached ("none" < "soft" < "confirmed")
  let prospect           = null;
  let history            = [];
  let userMessageCount   = 0;
  let busy               = false;
  let analyzed           = false;
  let userBubbles        = []; // chat bubbles for the salesperson's own lines, in order

  // Resolve the shared offer choice to prompt/display text (Custom → free text).
  function currentOfferText() {
    return selectedOffer === "Custom"
      ? els.offerCustomInput.value.trim()
      : selectedOffer;
  }

  // Thin wrappers so the mascot is optional — no-op if the module didn't load.
  function mascotState(state) {
    if (typeof SCG_MASCOT !== "undefined") SCG_MASCOT.setState(state);
  }
  function mascotTalk(reply) {
    if (typeof SCG_MASCOT !== "undefined") SCG_MASCOT.talkFor(reply, "idle");
  }

  async function checkHealth() {
    try {
      const res  = await fetch("/api/health");
      const data = await res.json();
      if (!data.aiConfigured) {
        els.apiNotice.style.display = "flex";
        els.gameArea.style.display  = "none";
        return false;
      }
      return true;
    } catch {
      els.apiNotice.style.display = "flex";
      els.gameArea.style.display  = "none";
      return false;
    }
  }

  // --- Not-serious / troll input guard (mirrors the server, so no token spend) -
  const TROLL_PHRASES = new Set([
    "asdf","asdfasdf","asdfgh","qwerty","qwert","zxcv","zxcvbn","test","testing","test test",
    "lol","lmao","lmfao","haha","hahaha","hehe","xd","idk","idc","blah","blah blah","meh",
    "yo","sup","wassup","poop","fart","penis","boobs","butt","skip","skip this","whatever",
    "hi hi","aaa","bbb","spam","gibberish","random","abc","abcabc","123","12345","hello hello",
  ]);
  function isLowEffort(raw) {
    const text = (raw || "").trim();
    if (text.length < 2) return true;
    const lower = text.toLowerCase();
    const wordChars = lower.replace(/[^a-z]/g, "");
    if (/(.)\1{4,}/.test(lower)) return true;
    const stripped = lower.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (TROLL_PHRASES.has(stripped)) return true;
    if (/(asdf|sdfg|dfgh|qwer|wert|erty|zxcv|xcvb|cvbn|hjkl|jkl;|uiop|poiu)/.test(lower)) return true;
    if (wordChars.length === 0 && text.length < 8) return true;
    if (wordChars.length >= 5) {
      const vowels = (wordChars.match(/[aeiou]/g) || []).length;
      if (vowels / wordChars.length < 0.18) return true;
    }
    return false;
  }

  // --- Step 0: Mode choice (Setter vs Closer) -----------------------------

  els.modeGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-choice-btn");
    if (!btn) return;
    callMode = btn.dataset.mode;             // "closer" | "setter"
    els.modePanel.style.display  = "none";
    els.offerPanel.style.display = "block";
    // The offer step feeds both modes; Closer then picks a section, Setter
    // jumps straight to the prospect.
    els.offerNextBtn.textContent = callMode === "closer"
      ? "Next: pick a section"
      : "Next: pick a prospect";
    updateOfferButton();
  });

  // --- Step 1: Offer selection (shared by both modes) ---------------------

  els.offerGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".scenario-btn");
    if (!btn) return;
    [...els.offerGrid.children].forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedOffer = btn.dataset.offer;
    els.offerCustomInput.style.display = selectedOffer === "Custom" ? "block" : "none";
    updateOfferButton();
  });

  els.offerCustomInput.addEventListener("input", updateOfferButton);

  function updateOfferButton() {
    els.offerNextBtn.disabled =
      !selectedOffer ||
      (selectedOffer === "Custom" && !els.offerCustomInput.value.trim());
  }

  els.offerNextBtn.addEventListener("click", () => {
    els.offerPanel.style.display = "none";
    // Closer drills a specific section; Setter always runs the full structure.
    if (callMode === "closer") els.sectionPanel.style.display     = "block";
    else                       els.personalityPanel.style.display = "block";
  });

  els.backToModeBtn.addEventListener("click", () => {
    els.offerPanel.style.display = "none";
    els.modePanel.style.display  = "block";
  });

  // --- Step 2: Section selection ------------------------------------------

  els.sectionGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".scenario-btn");
    if (!btn) return;
    [...els.sectionGrid.children].forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedSection = btn.dataset.section;
    els.confirmSectionBtn.disabled = false;
  });

  els.backToOfferBtn.addEventListener("click", () => {
    els.sectionPanel.style.display = "none";
    els.offerPanel.style.display   = "block";
  });

  els.confirmSectionBtn.addEventListener("click", () => {
    els.sectionPanel.style.display     = "none";
    els.personalityPanel.style.display = "block";
  });

  // --- Step 3: Personality selection --------------------------------------

  function renderPersonalities() {
    const randomCard = `
      <button class="scenario-btn personality-btn selected" data-key="random">
        🎲 Randomize
        <small>Draw a random prospect each call so you don't only train against your favourite. Recommended.</small>
      </button>`;
    const personaCards = PERSONAS.map((p) => `
      <button class="scenario-btn personality-btn" data-key="${p.key}">
        ${p.label}
        <small>${p.blurb || p.primaryPain}</small>
      </button>
    `).join("");
    els.personalityGrid.innerHTML = randomCard + personaCards;
  }
  renderPersonalities();

  // Subtle reminder of the conversation language, shown on the last screen
  // before the call starts. The setting itself lives in Settings > Language.
  function renderCallLangNote() {
    const el = document.getElementById("call-lang-note");
    if (!el || typeof SCG_LANG === "undefined") return;
    const name = SCG_LANG.name(SCG_LANG.get()) || "English";
    el.textContent = `This call will be in ${name}.`;
  }
  renderCallLangNote();
  // The account's language arrives just after first paint on a fresh browser.
  document.addEventListener("scg:languagechange", renderCallLangNote);
  // Randomize is selected by default, so the call can start immediately.
  selectedPersonality = "random";
  els.confirmPersonalityBtn.disabled = false;

  els.personalityGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".personality-btn");
    if (!btn) return;
    [...els.personalityGrid.children].forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedPersonality = btn.dataset.key === "random"
      ? "random"
      : PERSONAS.find((p) => p.key === btn.dataset.key);
    els.confirmPersonalityBtn.disabled = false;
  });

  els.backToSectionBtn.addEventListener("click", () => {
    els.personalityPanel.style.display = "none";
    if (callMode === "setter") {
      els.offerPanel.style.display = "block";
    } else {
      els.sectionPanel.style.display = "block";
    }
  });

  els.confirmPersonalityBtn.addEventListener("click", startCall);

  // --- Start call ----------------------------------------------------------

  // Alternate the displayed prospect name between two people, call to call.
  function nextProspectName() {
    const NAMES = ["John", "Sarah"];
    let idx = parseInt(localStorage.getItem("scg_call_name_idx") || "0", 10);
    if (Number.isNaN(idx)) idx = 0;
    const name = NAMES[idx % NAMES.length];
    localStorage.setItem("scg_call_name_idx", String((idx + 1) % NAMES.length));
    return name;
  }

  async function startCall() {
    els.confirmPersonalityBtn.disabled    = true;
    els.confirmPersonalityBtn.textContent = "Connecting...";

    const isSetter = callMode === "setter";
    const isCustom = selectedOffer === "Custom";
    const customText = els.offerCustomInput.value.trim();
    const offerText = currentOfferText();
    const prospectName = nextProspectName();

    // Resolve "Randomize" into a concrete persona now, so the rest of the call
    // (header, server prompt, lessons) works against a real archetype.
    const persona = selectedPersonality === "random"
      ? PERSONAS[Math.floor(Math.random() * PERSONAS.length)]
      : selectedPersonality;

    try {
      const token = localStorage.getItem("scg_auth_token");
      const endpoint = isSetter ? "/api/setter/start" : "/api/call/start";
      const body = isSetter
        ? {
            offer:             selectedOffer,
            customDescription: isCustom ? customText : "",
            personality:       persona,
            prospectName,
          }
        : {
            scenario:          offerText,
            customDescription: "",
            section:           selectedSection,
            personality:       persona,
            prospectName,
          };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        if (d.error === "limit_reached" && typeof SCG_PRICING !== "undefined") SCG_PRICING.showModal();
        els.confirmPersonalityBtn.disabled    = false;
        els.confirmPersonalityBtn.textContent = "Start call";
        return;
      }
      if (!res.ok) throw new Error("request failed");
      prospect         = await res.json();
      prospect.name    = prospectName;
      history          = [];
      userMessageCount = 0;
      analyzed         = false;
      userBubbles      = [];
      liveBooking      = "none";

      // Populate the live call header.
      els.clProspect.textContent    = prospectName;
      els.clOffer.textContent       = offerText;
      els.clPersonality.textContent = persona ? persona.label : "—";
      // Keep the resolved persona around for the message route and the debrief.
      activePersona = persona;
      // Setter has no section but tracks booking; Closer shows the section.
      els.clmSituation.style.display = isSetter ? "none" : "";
      els.clmBooking.style.display   = isSetter ? "" : "none";
      if (isSetter) setBookingIndicator("none");
      else els.clSituation.textContent = selectedSection;

      els.summaryPanel.style.display = "none";
      els.summaryPanel.innerHTML     = "";
      els.chatInputRow.style.display = "flex";
      els.endCallBtn.style.display   = "inline-flex";
      els.endCallBtn.disabled        = false;
      els.endCallBtn.textContent     = "Analyze call";
      if (els.quitCallBtn) {
        els.quitCallBtn.style.display = "inline-flex";
        els.quitCallBtn.disabled      = false;
        els.quitCallBtn.textContent   = "End — no review";
      }
      els.chatInput.disabled         = false;
      els.sendBtn.disabled           = false;
      els.callStatus.textContent     = "";
      els.callStatus.classList.remove("call-status-warn", "call-status-success");

      els.chatWindow.innerHTML = "";
      // Stand the pixel prospect up beside the chat; they open the call talking.
      if (typeof SCG_MASCOT !== "undefined") {
        SCG_MASCOT.mount(els.mascotRail, { name: prospectName });
      }
      addBubble("prospect", prospect.openingMessage);
      history.push({ role: "assistant", content: prospect.openingMessage });
      mascotTalk(prospect.openingMessage);

      updateProgress();
      els.personalityPanel.style.display = "none";
      els.callPanel.style.display        = "block";
      els.chatInput.focus();
    } catch {
      els.confirmPersonalityBtn.disabled    = false;
      els.confirmPersonalityBtn.textContent = "Start call";
      // Stay on the persona panel so they can retry.
      els.personalityPanel.style.display    = "block";
    }
  }

  // Setter booking indicator: none -> soft -> confirmed (never downgrades live).
  const BOOKING_RANK = { none: 0, soft: 1, confirmed: 2 };
  const BOOKING_TEXT = { none: "Not booked", soft: "Warming up", confirmed: "Booked (live)" };
  function setBookingIndicator(level) {
    const lvl = BOOKING_TEXT[level] ? level : "none";
    els.clBooking.textContent = BOOKING_TEXT[lvl];
    els.clBooking.className = `clm-val booking-${lvl}`;
  }

  // --- Chat ----------------------------------------------------------------

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className   = `chat-bubble ${role}`;
    bubble.textContent = text;
    els.chatWindow.appendChild(bubble);
    els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
    if (role === "user") userBubbles.push(bubble);
    return bubble;
  }

  function updateProgress() {
    els.callProgress.textContent = `MSG ${userMessageCount} / ${TARGET_MESSAGES}`;
  }

  function flagNotSerious(message) {
    els.callStatus.textContent = message;
    els.callStatus.classList.add("call-status-warn");
    els.chatInput.classList.add("input-shake");
    setTimeout(() => els.chatInput.classList.remove("input-shake"), 500);
  }

  async function sendMessage() {
    if (analyzed) return;
    let autoSuccess = false;   // set when the reply confirms a booking/close
    const text = els.chatInput.value.trim();
    if (!text || busy) return;

    // Token-free guard: stop trolling / messing around before it hits the API.
    if (isLowEffort(text)) {
      flagNotSerious("Take the call seriously - type a real line you'd say to a prospect. (This one wasn't sent.)");
      return;
    }
    els.callStatus.classList.remove("call-status-warn");

    busy = true;
    addBubble("user", text);
    history.push({ role: "user", content: text });
    userMessageCount += 1;
    updateProgress();
    const isSetter = callMode === "setter";
    els.chatInput.value    = "";
    els.chatInput.disabled = true;
    els.sendBtn.disabled   = true;
    els.callStatus.textContent = isSetter ? "Lead is responding..." : "Prospect is responding...";
    mascotState("thinking");   // the prospect is weighing your line

    try {
      const endpoint = isSetter ? "/api/setter/message" : "/api/call/message";
      const body = isSetter
        ? {
            offer:             selectedOffer,
            customDescription: selectedOffer === "Custom" ? els.offerCustomInput.value.trim() : "",
            prospect, history, userMessage: text, personality: activePersona,
          }
        : { scenario: currentOfferText(), prospect, history, userMessage: text, section: selectedSection, personality: activePersona };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();

      // Server-side guard tripped (defense in depth): roll back the sent line.
      if (data.blocked) {
        const last = userBubbles.pop();
        if (last) last.remove();
        history.pop();
        userMessageCount -= 1;
        updateProgress();
        mascotState("listening");
        flagNotSerious(data.reason || "That wasn't a serious message. Try again.");
        return;
      }

      addBubble("prospect", data.reply);
      history.push({ role: "assistant", content: data.reply });
      mascotTalk(data.reply);   // the prospect speaks, then settles to idle

      // Setter: escalate the live booking indicator, never downgrade.
      if (isSetter && data.booking && BOOKING_RANK[data.booking] > BOOKING_RANK[liveBooking]) {
        liveBooking = data.booking;
        setBookingIndicator(liveBooking);
      }

      // Success trigger: a confirmed booking (setter) or a firm close (closer)
      // ends the call the way real life does — stop the back-and-forth and roll
      // straight into the debrief.
      if (isSetter ? data.booking === "confirmed" : data.closed === true) {
        autoSuccess = true;
      }

      els.callStatus.textContent = userMessageCount >= TARGET_MESSAGES
        ? "You've hit the suggested call length - wrap it up and analyze when ready."
        : "";
    } catch {
      els.callStatus.textContent = "Something went wrong reaching the prospect.";
      mascotState("idle");
    } finally {
      els.chatInput.disabled = false;
      els.sendBtn.disabled   = false;
      els.chatInput.focus();
      busy = false;
    }

    // Only auto-close once the call is long enough for endCall to accept it,
    // so a fluke early "yes" can't disable the input with no way to analyze.
    if (autoSuccess && !analyzed && userMessageCount >= 2) autoCloseCall(callMode === "setter");
  }

  // Show a brief win beat, then auto-run the debrief. A small delay lets the
  // prospect's closing line land before the analysis overlay takes over.
  function autoCloseCall(isSetter) {
    els.callStatus.classList.remove("call-status-warn");
    els.callStatus.classList.add("call-status-success");
    els.callStatus.textContent = isSetter
      ? "Call booked — wrapping up and analyzing..."
      : "Deal closed — wrapping up and analyzing...";
    els.chatInput.disabled = true;
    els.sendBtn.disabled   = true;
    setTimeout(() => endCall(), 1300);
  }

  els.sendBtn.addEventListener("click", sendMessage);
  els.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
  // The prospect "listens" while you compose your next line.
  els.chatInput.addEventListener("input", () => {
    if (!busy && !analyzed && els.chatInput.value.trim()) mascotState("listening");
  });

  // --- Analyze call: highlights in chat + summary under it -----------------

  els.endCallBtn.addEventListener("click", endCall);

  async function endCall() {
    if (busy || analyzed) return;
    if (userMessageCount < 2) {
      flagNotSerious("Send at least a couple of messages before analyzing the call.");
      return;
    }
    busy = true;
    els.endCallBtn.disabled    = true;
    els.endCallBtn.textContent = "Analyzing...";
    els.chatInput.disabled     = true;
    els.sendBtn.disabled       = true;
    els.callStatus.classList.remove("call-status-warn");
    els.callStatus.textContent = "Reading back through the call...";
    mascotState("thinking");   // reviewing the call

    try {
      const isSetter = callMode === "setter";
      const endpoint = isSetter ? "/api/setter/end" : "/api/call/end";
      const body = isSetter
        ? {
            offer:             selectedOffer,
            customDescription: selectedOffer === "Custom" ? els.offerCustomInput.value.trim() : "",
            prospect, history, personality: activePersona, liveBooking,
          }
        : { scenario: currentOfferText(), prospect, history, section: selectedSection, personality: activePersona };
      // Send the auth token so the server can persist the review: lessons, call
      // history and skill unlocks all key off req.userId (optionalAuth). Without
      // this header they were silently dropped for signed-in users.
      const token = localStorage.getItem("scg_auth_token");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      analyzed = true;
      mascotState("idle");
      applyHighlights(data.highlights || []);
      if (isSetter) renderSetterSummary(data);
      else renderSummary(data);
      els.chatInputRow.style.display = "none";
      els.endCallBtn.style.display   = "none";
      els.callStatus.textContent     = "";
    } catch {
      els.callStatus.textContent = "Couldn't analyze the call. Try again.";
      els.endCallBtn.disabled    = false;
      els.endCallBtn.textContent = "Analyze call";
      els.chatInput.disabled     = false;
      els.sendBtn.disabled       = false;
    } finally {
      busy = false;
    }
  }

  // --- End without a review: quit and move on, no debrief, minimal tokens ---

  els.quitCallBtn.addEventListener("click", quitCall);

  async function quitCall() {
    if (busy || analyzed) return;
    busy = true;
    analyzed = true;                       // lock the call from further input
    els.quitCallBtn.disabled   = true;
    els.endCallBtn.disabled    = true;
    els.quitCallBtn.textContent = "Ending...";
    els.chatInput.disabled     = true;
    els.sendBtn.disabled       = true;
    els.callStatus.classList.remove("call-status-warn");
    els.callStatus.textContent = "Wrapping up (no review)...";

    let touched = 0;
    try {
      const isSetter = callMode === "setter";
      const endpoint = isSetter ? "/api/setter/quit" : "/api/call/quit";
      const token = localStorage.getItem("scg_auth_token");
      const body = isSetter
        ? {
            offer:             selectedOffer,
            customDescription: selectedOffer === "Custom" ? els.offerCustomInput.value.trim() : "",
            prospect, history, personality: activePersona,
          }
        : { scenario: currentOfferText(), prospect, history, section: selectedSection, personality: activePersona };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        touched = (data.discovered_skills || []).length;
      }
    } catch { /* still show the ended card */ }
    finally {
      busy = false;
      renderQuitCard(touched);
    }
  }

  function renderQuitCard(touched) {
    const skillLine = touched
      ? `The ${touched} skill${touched === 1 ? "" : "s"} you touched ${touched === 1 ? "was" : "were"} saved to your Skill Tree.`
      : "It's saved to your Skill Tree.";
    els.summaryPanel.innerHTML = `
      <div class="panel summary-card panel-accent">
        <div class="panel-label">// Call ended - no review</div>
        <p class="summary-headline-p">You ended the call without a debrief. ${esc(skillLine)} No tokens spent on a review.</p>
        <div class="actions-row">
          <a class="objection-context" href="/pages/skill-map.html" style="text-decoration:underline;color:var(--text-1);">View your Skill Tree →</a>
          <button class="btn btn-primary" id="new-call-btn">Run another call</button>
        </div>
      </div>`;
    els.summaryPanel.style.display = "block";
    els.chatInputRow.style.display = "none";
    els.endCallBtn.style.display   = "none";
    els.quitCallBtn.style.display  = "none";
    els.callStatus.textContent     = "";
    const newBtn = document.getElementById("new-call-btn");
    if (newBtn) newBtn.addEventListener("click", resetAll);
    els.summaryPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Paint each tagged salesperson line with a green/amber/red highlight + note.
  function applyHighlights(highlights) {
    highlights.forEach((h) => {
      const bubble = userBubbles[h.index];
      if (!bubble) return;
      const verdict = ["good", "improve", "bad"].includes(h.verdict) ? h.verdict : "improve";
      bubble.classList.add(`hl-${verdict}`);
      if (h.note) {
        const note = document.createElement("div");
        note.className   = `hl-note hl-note-${verdict}`;
        note.textContent = h.note;
        bubble.insertAdjacentElement("afterend", note);
      }
    });
    els.chatWindow.scrollTop = 0;
  }

  // The "+N points" pill for the debrief, with the server's plain-English
  // breakdown underneath so the number is always explainable.
  function pointsBadge(points, breakdown) {
    const n = Number.isFinite(points) ? points : 0;
    const pill = `<div class="points-badge">+${n} point${n === 1 ? "" : "s"}</div>`;
    const why  = breakdown ? `<div class="points-why">${esc(breakdown)}</div>` : "";
    return pill + why;
  }

  function renderSummary(data) {
    // Award points (scaled server-side by callScore) and meter the session.
    const points = Number.isFinite(data.pointsAwarded) ? data.pointsAwarded : 0;
    SCG.addScore(points, "sales-call");

    els.summaryPanel.innerHTML = `
      <div class="panel summary-card">
        <div class="panel-label">// Debrief - what to take into your next call</div>
        <div class="summary-top">
          <div class="summary-score">
            <div class="summary-score-val">${data.callScore ?? "—"}</div>
            <div class="summary-score-sub">/ 10</div>
          </div>
          <div class="summary-headline">
            <p>${esc(data.headline || "")}</p>
            ${pointsBadge(points, data.pointsBreakdown)}
          </div>
        </div>

        ${data.rememberThis ? `
        <div class="remember-block">
          <div class="remember-label">Remember this</div>
          <div class="remember-text">${esc(data.rememberThis)}</div>
        </div>` : ""}

        <div class="feedback-block info">
          <h4><span class="tag"></span>Think about this next time</h4>
          <ul>${listItems(data.thinkAboutNextTime)}</ul>
        </div>

        <div class="feedback-block good">
          <h4><span class="tag"></span>What you did well</h4>
          <ul>${listItems(data.whatYouDidWell)}</ul>
        </div>

        ${data.principle && data.principle.name ? `
        <div class="quote-block"><strong>${esc(data.principle.name)}</strong>: ${esc(data.principle.note || "")}</div>` : ""}

        <div class="actions-row">
          <span class="objection-context">Green, amber and red marks above show your strongest and weakest moves.</span>
          <button class="btn btn-primary" id="new-call-btn">Run another call</button>
        </div>
      </div>`;

    els.summaryPanel.style.display = "block";
    const newBtn = document.getElementById("new-call-btn");
    if (newBtn) newBtn.addEventListener("click", resetAll);
    els.summaryPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderSetterSummary(data) {
    // Award points (scaled server-side, floored high for an earned booking).
    const points = Number.isFinite(data.pointsAwarded) ? data.pointsAwarded : 0;
    SCG.addScore(points, "setter");

    const qualified = data.outcome === "Qualified";
    const outcomeClass = qualified ? "outcome-qualified" : "outcome-notqualified";
    const outcomeLabel = data.outcome || (qualified ? "Qualified" : "Not Qualified");

    const bookingLine = data.booked
      ? (data.unearned
          ? `Closer call booked — but unearned. ${esc(data.bookingRationale || "")}`
          : `Closer call booked. ${esc(data.bookingRationale || "")}`)
      : `No closer call booked. ${esc(data.bookingRationale || "")}`;
    const bookingClass = data.booked ? (data.unearned ? "booking-soft" : "booking-confirmed") : "booking-none";

    const obj = data.objectives || {};
    const objRow = (ok, label) =>
      `<div class="setter-obj ${ok ? "ok" : "miss"}"><span class="setter-obj-mark">${ok ? "✓" : "✗"}</span>${label}</div>`;

    const STATUS_LABEL = { hit: "Hit", partial: "Partial", missed: "Missed" };
    const structureRows = (data.structure || []).map((s) => {
      const st = ["hit", "partial", "missed"].includes(s.status) ? s.status : "partial";
      return `
        <div class="setter-stage stage-${st}">
          <div class="setter-stage-head">
            <span class="setter-stage-name">${esc(s.label || s.key || "")}</span>
            <span class="setter-stage-badge stage-${st}">${STATUS_LABEL[st]}</span>
          </div>
          ${s.note ? `<div class="setter-stage-note">${esc(s.note)}</div>` : ""}
        </div>`;
    }).join("");

    els.summaryPanel.innerHTML = `
      <div class="panel summary-card">
        <div class="panel-label">// Setter debrief - did you qualify and book the lead?</div>

        <div class="setter-outcome ${outcomeClass}">
          <div class="setter-outcome-badge">${esc(outcomeLabel)}</div>
          <div class="setter-outcome-side">
            <div class="summary-score-val">${data.callScore ?? "—"}<span class="summary-score-sub">/ 10</span></div>
          </div>
        </div>

        <div class="setter-booking-line ${bookingClass}">${bookingLine}</div>

        ${pointsBadge(points, data.pointsBreakdown)}

        ${data.headline ? `<p class="summary-headline-p">${esc(data.headline)}</p>` : ""}

        <div class="setter-objectives">
          ${objRow(!!obj.understoodPain, "Understood the pain")}
          ${objRow(!!obj.positionedCloserCall, "Positioned the closer call")}
        </div>

        ${structureRows ? `
        <div class="feedback-block info">
          <h4><span class="tag"></span>How you followed the structure</h4>
          <div class="setter-stages">${structureRows}</div>
        </div>` : ""}

        ${data.rememberThis ? `
        <div class="remember-block">
          <div class="remember-label">Remember this</div>
          <div class="remember-text">${esc(data.rememberThis)}</div>
        </div>` : ""}

        <div class="feedback-block info">
          <h4><span class="tag"></span>Think about this next time</h4>
          <ul>${listItems(data.thinkAboutNextTime)}</ul>
        </div>

        <div class="feedback-block good">
          <h4><span class="tag"></span>What you did well</h4>
          <ul>${listItems(data.whatYouDidWell)}</ul>
        </div>

        ${data.principle && data.principle.name ? `
        <div class="quote-block"><strong>${esc(data.principle.name)}</strong>: ${esc(data.principle.note || "")}</div>` : ""}

        <div class="actions-row">
          <span class="objection-context">Green, amber and red marks above show your strongest and weakest moves.</span>
          <button class="btn btn-primary" id="new-call-btn">Run another call</button>
        </div>
      </div>`;

    els.summaryPanel.style.display = "block";
    const newBtn = document.getElementById("new-call-btn");
    if (newBtn) newBtn.addEventListener("click", resetAll);
    els.summaryPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function listItems(items) {
    if (!items || !items.length) return "<li>Nothing notable.</li>";
    return items.map((x) => `<li>${esc(x)}</li>`).join("");
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  // --- Reset ---------------------------------------------------------------

  function resetAll() {
    els.callPanel.style.display     = "none";
    els.summaryPanel.style.display  = "none";
    els.summaryPanel.innerHTML      = "";
    // Back to the very first step: the mode choice.
    els.offerPanel.style.display       = "none";
    els.sectionPanel.style.display     = "none";
    els.personalityPanel.style.display = "none";
    els.modePanel.style.display        = "block";

    els.callStatus.textContent        = "";
    els.callStatus.classList.remove("call-status-warn", "call-status-success");
    els.offerNextBtn.textContent      = "Next";
    els.confirmSectionBtn.disabled    = true;
    els.confirmSectionBtn.textContent = "Next: pick a prospect";
    els.confirmPersonalityBtn.textContent = "Start call";

    [...els.offerGrid.children].forEach((b)   => b.classList.remove("selected"));
    [...els.sectionGrid.children].forEach((b)  => b.classList.remove("selected"));
    [...els.personalityGrid.children].forEach((b, i) => b.classList.toggle("selected", i === 0));
    els.offerCustomInput.style.display = "none";
    els.offerCustomInput.value         = "";
    callMode            = null;
    selectedOffer       = null;
    selectedSection     = null;
    selectedPersonality = "random";   // back to the Randomize default
    activePersona       = null;
    liveBooking         = "none";
    els.confirmPersonalityBtn.disabled = false;
    els.offerNextBtn.disabled          = true;
  }

  checkHealth();
})();
