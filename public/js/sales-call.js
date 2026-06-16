(() => {
  const TARGET_MESSAGES = 14;

  const els = {
    apiNotice: document.getElementById("api-notice"),
    gameArea: document.getElementById("game-area"),

    scenarioPanel: document.getElementById("scenario-panel"),
    scenarioGrid: document.getElementById("scenario-grid"),
    customInput: document.getElementById("custom-input"),
    startBtn: document.getElementById("start-call-btn"),
    scenarioStatus: document.getElementById("scenario-status"),

    callPanel: document.getElementById("call-panel"),
    prospectAvatar: document.getElementById("prospect-avatar"),
    prospectName: document.getElementById("prospect-name"),
    prospectScenario: document.getElementById("prospect-scenario"),
    callProgress: document.getElementById("call-progress"),
    chatWindow: document.getElementById("chat-window"),
    chatInput: document.getElementById("chat-input"),
    sendBtn: document.getElementById("send-btn"),
    callStatus: document.getElementById("call-status"),
    endCallBtn: document.getElementById("end-call-btn"),

    reportPanel: document.getElementById("report-panel"),
    newCallBtn: document.getElementById("new-call-btn"),
  };

  let selectedScenario = null;
  let prospect = null;
  let history = [];
  let userMessageCount = 0;
  let busy = false;

  async function checkHealth() {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (!data.aiConfigured) {
        els.apiNotice.style.display = "flex";
        els.gameArea.style.display = "none";
        return false;
      }
      return true;
    } catch {
      els.apiNotice.style.display = "flex";
      els.gameArea.style.display = "none";
      return false;
    }
  }

  // --- Scenario selection ---------------------------------------------

  els.scenarioGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".scenario-btn");
    if (!btn) return;
    [...els.scenarioGrid.children].forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedScenario = btn.dataset.scenario;

    if (selectedScenario === "Custom Scenario") {
      els.customInput.style.display = "block";
    } else {
      els.customInput.style.display = "none";
    }
    updateStartButton();
  });

  els.customInput.addEventListener("input", updateStartButton);

  function updateStartButton() {
    if (!selectedScenario) {
      els.startBtn.disabled = true;
      return;
    }
    if (selectedScenario === "Custom Scenario" && !els.customInput.value.trim()) {
      els.startBtn.disabled = true;
      return;
    }
    els.startBtn.disabled = false;
  }

  els.startBtn.addEventListener("click", startCall);

  async function startCall() {
    els.startBtn.disabled = true;
    els.startBtn.textContent = "Connecting...";
    els.scenarioStatus.textContent = "Generating prospect...";

    try {
      const res = await fetch("/api/call/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: selectedScenario,
          customDescription: selectedScenario === "Custom Scenario" ? els.customInput.value.trim() : "",
        }),
      });
      if (!res.ok) throw new Error("request failed");
      prospect = await res.json();
      history = [];
      userMessageCount = 0;

      els.prospectName.textContent = prospect.name;
      els.prospectAvatar.textContent = (prospect.name || "?").charAt(0).toUpperCase();
      els.prospectScenario.textContent = selectedScenario === "Custom Scenario"
        ? els.customInput.value.trim()
        : selectedScenario;

      els.chatWindow.innerHTML = "";
      addBubble("prospect", prospect.openingMessage);
      history.push({ role: "assistant", content: prospect.openingMessage });

      updateProgress();
      els.scenarioPanel.style.display = "none";
      els.callPanel.style.display = "block";
      els.chatInput.focus();
    } catch {
      els.scenarioStatus.textContent = "Couldn't reach the AI. Try again.";
      els.startBtn.disabled = false;
      els.startBtn.textContent = "Start call";
    }
  }

  // --- Chat ---------------------------------------------------------------

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;
    els.chatWindow.appendChild(bubble);
    els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
  }

  function updateProgress() {
    els.callProgress.textContent = `MSG ${userMessageCount} / ${TARGET_MESSAGES}`;
  }

  async function sendMessage() {
    const text = els.chatInput.value.trim();
    if (!text || busy) return;
    busy = true;

    addBubble("user", text);
    history.push({ role: "user", content: text });
    userMessageCount += 1;
    updateProgress();
    els.chatInput.value = "";
    els.chatInput.disabled = true;
    els.sendBtn.disabled = true;
    els.callStatus.textContent = "Prospect is responding...";

    try {
      const res = await fetch("/api/call/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: selectedScenario,
          prospect,
          history,
          userMessage: text,
        }),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      addBubble("prospect", data.reply);
      history.push({ role: "assistant", content: data.reply });
      els.callStatus.textContent = userMessageCount >= TARGET_MESSAGES
        ? "You've hit the suggested call length — wrap it up when ready."
        : "";
    } catch {
      els.callStatus.textContent = "Something went wrong reaching the prospect.";
    } finally {
      els.chatInput.disabled = false;
      els.sendBtn.disabled = false;
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

  // --- End call & report ---------------------------------------------------

  els.endCallBtn.addEventListener("click", endCall);

  async function endCall() {
    if (busy) return;
    if (userMessageCount < 2) {
      els.callStatus.textContent = "Send at least a couple of messages before ending the call.";
      return;
    }
    busy = true;
    els.endCallBtn.disabled = true;
    els.endCallBtn.textContent = "Analyzing call...";
    els.chatInput.disabled = true;
    els.sendBtn.disabled = true;

    try {
      const res = await fetch("/api/call/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: selectedScenario, prospect, history }),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      renderReport(data);
    } catch {
      els.callStatus.textContent = "Couldn't generate the feedback report. Try ending again.";
      els.endCallBtn.disabled = false;
      els.endCallBtn.textContent = "End call & get feedback";
      els.chatInput.disabled = false;
      els.sendBtn.disabled = false;
    } finally {
      busy = false;
    }
  }

  function renderReport(data) {
    SCG.addScore(typeof data.scoreDelta === "number" ? data.scoreDelta : 0);

    document.getElementById("call-score-value").textContent = data.callScore ?? "—";

    const delta = data.scoreDelta || 0;
    document.getElementById("score-delta-label").textContent =
      `${delta > 0 ? "+" : ""}${delta} points added to today's score`;

    fillList("rep-well", data.whatYouDidWell);
    fillList("rep-mistakes", data.biggestMistakes);
    fillList("rep-topcloser", data.whatATopCloserWouldHaveDone);

    const missedWrap = document.getElementById("rep-missed");
    missedWrap.innerHTML = "";
    (data.missedOpportunities || []).forEach((m) => {
      const block = document.createElement("div");
      block.className = "feedback-block info";
      block.innerHTML = `
        <div class="quote-block">"${escapeHtml(m.prospectSaid || "")}"</div>
        <p><strong>You treated it as:</strong> ${escapeHtml(m.youTreatedItAs || "")}</p>
        <p><strong>It was actually:</strong> ${escapeHtml(m.itWasActually || "")}</p>
      `;
      missedWrap.appendChild(block);
    });
    if (!data.missedOpportunities || data.missedOpportunities.length === 0) {
      missedWrap.innerHTML = "<p style=\"color: var(--text-1); margin:0;\">None identified — solid read of the conversation.</p>";
    }

    const principlesWrap = document.getElementById("rep-principles");
    principlesWrap.innerHTML = "";
    (data.principles || []).forEach((p) => {
      const block = document.createElement("div");
      block.className = "quote-block";
      block.innerHTML = `<strong>${escapeHtml(p.name || "")}</strong> — ${escapeHtml(p.note || "")}`;
      block.style.marginBottom = "8px";
      principlesWrap.appendChild(block);
    });

    els.callPanel.style.display = "none";
    els.reportPanel.style.display = "block";
  }

  function fillList(id, items) {
    const ul = document.getElementById(id);
    ul.innerHTML = "";
    (items || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });
    if (!items || items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Nothing notable.";
      ul.appendChild(li);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Reset ---------------------------------------------------------------

  els.newCallBtn.addEventListener("click", () => {
    els.reportPanel.style.display = "none";
    els.scenarioPanel.style.display = "block";
    els.callStatus.textContent = "";
    els.endCallBtn.disabled = false;
    els.endCallBtn.textContent = "End call & get feedback";
    els.startBtn.textContent = "Start call";
    [...els.scenarioGrid.children].forEach((b) => b.classList.remove("selected"));
    els.customInput.style.display = "none";
    els.customInput.value = "";
    selectedScenario = null;
    updateStartButton();
  });

  checkHealth();
})();
