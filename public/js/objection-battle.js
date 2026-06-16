(() => {
  const TOTAL_TIME = 30;
  const CIRC = 2 * Math.PI * 28; // ~175.93

  const els = {
    context: document.getElementById("objection-context"),
    quote: document.getElementById("objection-quote"),
    input: document.getElementById("response-input"),
    submitBtn: document.getElementById("submit-btn"),
    nextBtn: document.getElementById("next-btn"),
    statusLine: document.getElementById("status-line"),
    objectionPanel: document.getElementById("objection-panel"),
    feedbackPanel: document.getElementById("feedback-panel"),
    timerValue: document.getElementById("timer-value"),
    timerProgress: document.getElementById("timer-progress"),
    apiNotice: document.getElementById("api-notice"),
    gameArea: document.getElementById("game-area"),
  };

  let current = null; // { objection, context }
  let remaining = TOTAL_TIME;
  let timerHandle = null;
  let submitted = false;

  els.timerProgress.setAttribute("stroke-dasharray", CIRC.toFixed(2));

  function setTimerDisplay() {
    els.timerValue.textContent = remaining;
    const offset = CIRC * (1 - remaining / TOTAL_TIME);
    els.timerProgress.setAttribute("stroke-dashoffset", offset.toFixed(2));
    els.timerProgress.classList.remove("warn", "bad");
    if (remaining <= 5) els.timerProgress.classList.add("bad");
    else if (remaining <= 12) els.timerProgress.classList.add("warn");
  }

  function startTimer() {
    remaining = TOTAL_TIME;
    setTimerDisplay();
    clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      remaining -= 1;
      setTimerDisplay();
      if (remaining <= 0) {
        clearInterval(timerHandle);
        if (!submitted) submitResponse();
      }
    }, 1000);
  }

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

  async function loadNewObjection() {
    submitted = false;
    els.feedbackPanel.style.display = "none";
    els.objectionPanel.style.display = "block";
    els.input.value = "";
    els.input.disabled = false;
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = "Send response";
    els.context.textContent = "Loading scenario...";
    els.quote.textContent = " ";
    els.statusLine.textContent = "";
    clearInterval(timerHandle);
    els.timerValue.textContent = TOTAL_TIME;

    try {
      const res = await fetch("/api/objection/new", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      current = data;
      els.context.textContent = data.context;
      els.quote.textContent = `"${data.objection}"`;
      startTimer();
    } catch (err) {
      els.context.textContent = "Couldn't reach the AI.";
      els.quote.textContent = "Try again in a moment.";
    }
  }

  async function submitResponse() {
    if (submitted) return;
    submitted = true;
    clearInterval(timerHandle);

    const userResponse = els.input.value.trim() || "(no response — time ran out)";
    const timeTakenSeconds = TOTAL_TIME - remaining;

    els.input.disabled = true;
    els.submitBtn.disabled = true;
    els.submitBtn.textContent = "Analyzing...";
    els.statusLine.textContent = "AI is reviewing your response...";

    try {
      const res = await fetch("/api/objection/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objection: current.objection,
          context: current.context,
          userResponse,
          timeTakenSeconds,
        }),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      renderFeedback(data);
    } catch (err) {
      els.statusLine.textContent = "Something went wrong analyzing your response. Try again.";
      els.input.disabled = false;
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = "Send response";
      submitted = false;
    }
  }

  function renderFeedback(data) {
    SCG.addScore(typeof data.score === "number" ? data.score : 0);

    const scoreEl = document.getElementById("score-result-value");
    const score = data.score || 0;
    scoreEl.textContent = score > 0 ? `+${score}` : `${score}`;
    scoreEl.classList.remove("positive", "negative", "neutral");
    if (score > 0) scoreEl.classList.add("positive");
    else if (score < 0) scoreEl.classList.add("negative");
    else scoreEl.classList.add("neutral");

    fillList("fb-well", data.whatYouDidWell);
    fillList("fb-missed", data.whatYouMissed);
    document.getElementById("fb-reality").textContent = data.whatIsReallyGoingOn || "";
    document.getElementById("fb-alternative").textContent = data.betterAlternative || "";
    document.getElementById("fb-principle").textContent = data.principle || "";

    els.objectionPanel.style.display = "none";
    els.feedbackPanel.style.display = "block";
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

  els.submitBtn.addEventListener("click", submitResponse);
  els.nextBtn.addEventListener("click", loadNewObjection);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitResponse();
    }
  });

  (async () => {
    const ok = await checkHealth();
    if (ok) loadNewObjection();
  })();
})();
