(() => {
  const TARGET_MESSAGES = 30;

  // Prospect personalities. Difficulty: 1 easy, 2 medium, 3 hard to close.
  const PERSONALITIES = [
    { key: "friendly",    label: "Friendly & Open",         difficulty: 1,
      behavior: "Warm and talkative, shares freely, warms up fast and raises only light objections." },
    { key: "busy",        label: "Busy & Impatient",        difficulty: 2,
      behavior: "Short on time, wants the point fast, gives clipped answers and has no patience for waffle." },
    { key: "noncommittal",label: "Polite but Non-committal", difficulty: 2,
      behavior: "Agreeable on the surface but dodges commitment, hides the real objection behind smoke screens." },
    { key: "analytical",  label: "Analytical & Skeptical",  difficulty: 3,
      behavior: "Wants proof, numbers and guarantees, questions every claim and is slow to trust." },
    { key: "guarded",     label: "Guarded & Closed-off",    difficulty: 3,
      behavior: "Suspicious and gives little away. You have to earn every answer before they open up." },
    { key: "dismissive",  label: "Dismissive & Combative",  difficulty: 3,
      behavior: "Challenges your frame, pushes back hard and stays dismissive until you show real authority." },
  ];
  const DIFFICULTY_TEXT = { 1: "Easy to close", 2: "Medium", 3: "Harder to close" };

  const els = {
    apiNotice: document.getElementById("api-notice"),
    gameArea:  document.getElementById("game-area"),

    scenarioPanel: document.getElementById("scenario-panel"),
    scenarioGrid:  document.getElementById("scenario-grid"),
    customInput:   document.getElementById("custom-input"),
    startBtn:      document.getElementById("start-call-btn"),
    scenarioStatus: document.getElementById("scenario-status"),

    sectionPanel:      document.getElementById("section-panel"),
    sectionGrid:       document.getElementById("section-grid"),
    backToScenarioBtn: document.getElementById("back-to-scenario-btn"),
    confirmSectionBtn: document.getElementById("confirm-section-btn"),

    personalityPanel:     document.getElementById("personality-panel"),
    personalityGrid:      document.getElementById("personality-grid"),
    backToSectionBtn:     document.getElementById("back-to-section-btn"),
    confirmPersonalityBtn:document.getElementById("confirm-personality-btn"),

    callPanel:   document.getElementById("call-panel"),
    clProspect:  document.getElementById("cl-prospect"),
    clOffer:     document.getElementById("cl-offer"),
    clPersonality: document.getElementById("cl-personality"),
    clSituation: document.getElementById("cl-situation"),
    callProgress:document.getElementById("call-progress"),
    chatWindow:  document.getElementById("chat-window"),
    chatInputRow:document.getElementById("chat-input-row"),
    chatInput:   document.getElementById("chat-input"),
    sendBtn:     document.getElementById("send-btn"),
    callStatus:  document.getElementById("call-status"),
    endCallBtn:  document.getElementById("end-call-btn"),
    summaryPanel:document.getElementById("summary-panel"),
  };

  let selectedScenario   = null;
  let selectedSection    = null;
  let selectedPersonality = null;
  let prospect           = null;
  let history            = [];
  let userMessageCount   = 0;
  let busy               = false;
  let analyzed           = false;
  let userBubbles        = []; // chat bubbles for the salesperson's own lines, in order

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

  // --- Step 1: Scenario selection -----------------------------------------

  els.scenarioGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".scenario-btn");
    if (!btn) return;
    [...els.scenarioGrid.children].forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedScenario = btn.dataset.scenario;
    els.customInput.style.display = selectedScenario === "Custom Scenario" ? "block" : "none";
    updateStartButton();
  });

  els.customInput.addEventListener("input", updateStartButton);

  function updateStartButton() {
    els.startBtn.disabled =
      !selectedScenario ||
      (selectedScenario === "Custom Scenario" && !els.customInput.value.trim());
  }

  els.startBtn.addEventListener("click", () => {
    els.scenarioPanel.style.display = "none";
    els.sectionPanel.style.display  = "block";
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

  els.backToScenarioBtn.addEventListener("click", () => {
    els.sectionPanel.style.display  = "none";
    els.scenarioPanel.style.display = "block";
  });

  els.confirmSectionBtn.addEventListener("click", () => {
    els.sectionPanel.style.display     = "none";
    els.personalityPanel.style.display = "block";
  });

  // --- Step 3: Personality selection --------------------------------------

  function renderPersonalities() {
    els.personalityGrid.innerHTML = PERSONALITIES.map((p) => `
      <button class="scenario-btn personality-btn" data-key="${p.key}">
        ${p.label}
        <span class="difficulty-badge" data-difficulty="${p.difficulty}">${DIFFICULTY_TEXT[p.difficulty]}</span>
        <small>${p.behavior}</small>
      </button>
    `).join("");
  }
  renderPersonalities();

  els.personalityGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".personality-btn");
    if (!btn) return;
    [...els.personalityGrid.children].forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedPersonality = PERSONALITIES.find((p) => p.key === btn.dataset.key);
    els.confirmPersonalityBtn.disabled = false;
  });

  els.backToSectionBtn.addEventListener("click", () => {
    els.personalityPanel.style.display = "none";
    els.sectionPanel.style.display     = "block";
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

    const offerText = selectedScenario === "Custom Scenario"
      ? els.customInput.value.trim()
      : selectedScenario;
    const prospectName = nextProspectName();

    try {
      const token = localStorage.getItem("scg_auth_token");
      const res = await fetch("/api/call/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          scenario:          selectedScenario,
          customDescription: selectedScenario === "Custom Scenario" ? offerText : "",
          section:           selectedSection,
          personality:       selectedPersonality,
          prospectName,
        }),
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

      // Populate the live call header.
      els.clProspect.textContent    = prospectName;
      els.clOffer.textContent       = offerText;
      els.clPersonality.textContent = selectedPersonality ? selectedPersonality.label : "—";
      els.clSituation.textContent   = selectedSection;

      els.summaryPanel.style.display = "none";
      els.summaryPanel.innerHTML     = "";
      els.chatInputRow.style.display = "flex";
      els.endCallBtn.style.display   = "inline-flex";
      els.endCallBtn.disabled        = false;
      els.endCallBtn.textContent     = "Analyze call";
      els.chatInput.disabled         = false;
      els.sendBtn.disabled           = false;
      els.callStatus.textContent     = "";

      els.chatWindow.innerHTML = "";
      addBubble("prospect", prospect.openingMessage);
      history.push({ role: "assistant", content: prospect.openingMessage });

      updateProgress();
      els.personalityPanel.style.display = "none";
      els.callPanel.style.display        = "block";
      els.chatInput.focus();
    } catch {
      els.scenarioStatus.textContent        = "Couldn't reach the AI. Try again.";
      els.confirmPersonalityBtn.disabled    = false;
      els.confirmPersonalityBtn.textContent = "Start call";
      els.personalityPanel.style.display    = "none";
      els.scenarioPanel.style.display       = "block";
    }
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
    els.chatInput.value    = "";
    els.chatInput.disabled = true;
    els.sendBtn.disabled   = true;
    els.callStatus.textContent = "Prospect is responding...";

    try {
      const res = await fetch("/api/call/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario:    selectedScenario,
          prospect,
          history,
          userMessage: text,
          section:     selectedSection,
          personality: selectedPersonality,
        }),
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
        flagNotSerious(data.reason || "That wasn't a serious message. Try again.");
        return;
      }

      addBubble("prospect", data.reply);
      history.push({ role: "assistant", content: data.reply });
      els.callStatus.textContent = userMessageCount >= TARGET_MESSAGES
        ? "You've hit the suggested call length - wrap it up and analyze when ready."
        : "";
    } catch {
      els.callStatus.textContent = "Something went wrong reaching the prospect.";
    } finally {
      els.chatInput.disabled = false;
      els.sendBtn.disabled   = false;
      els.chatInput.focus();
      busy = false;
    }
  }

  els.sendBtn.addEventListener("click", sendMessage);
  els.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
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

    try {
      const res = await fetch("/api/call/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: selectedScenario, prospect, history,
          section: selectedSection, personality: selectedPersonality,
        }),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      analyzed = true;
      applyHighlights(data.highlights || []);
      renderSummary(data);
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

  function renderSummary(data) {
    SCG.addScore(typeof data.scoreDelta === "number" ? data.scoreDelta : 0, "sales-call");
    const delta = data.scoreDelta || 0;

    els.summaryPanel.innerHTML = `
      <div class="panel summary-card">
        <div class="panel-label">// Debrief - what to take into your next call</div>
        <div class="summary-top">
          <div class="summary-score">
            <div class="summary-score-val">${data.callScore ?? "—"}</div>
            <div class="summary-score-sub">/ 100</div>
          </div>
          <div class="summary-headline">
            <p>${esc(data.headline || "")}</p>
            <div class="summary-delta">${delta > 0 ? "+" : ""}${delta} points added to your score</div>
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
    els.scenarioPanel.style.display = "block";

    els.callStatus.textContent        = "";
    els.callStatus.classList.remove("call-status-warn");
    els.startBtn.textContent          = "Next: pick a section";
    els.confirmSectionBtn.disabled    = true;
    els.confirmSectionBtn.textContent = "Next: pick a personality";
    els.confirmPersonalityBtn.disabled    = true;
    els.confirmPersonalityBtn.textContent = "Start call";

    [...els.scenarioGrid.children].forEach((b) => b.classList.remove("selected"));
    [...els.sectionGrid.children].forEach((b)  => b.classList.remove("selected"));
    [...els.personalityGrid.children].forEach((b) => b.classList.remove("selected"));
    els.customInput.style.display = "none";
    els.customInput.value         = "";
    selectedScenario    = null;
    selectedSection     = null;
    selectedPersonality = null;
    updateStartButton();
  }

  checkHealth();
})();
