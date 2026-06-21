(() => {
  const CIRC = 2 * Math.PI * 28;

  const DIFFICULTY_CONFIG = {
    1: { label: "Easy",   seconds: 30,  color: "1" },
    2: { label: "Medium", seconds: 60,  color: "2" },
    3: { label: "Hard",   seconds: 90,  color: "3" },
  };

  let roundCount = 0;
  let timerHandle = null;
  let remaining = 30;
  let currentObjection = null;
  let submitted = false;
  let timerEnabled = localStorage.getItem("scg_timer_enabled") !== "off";
  let roundStartTime = 0;

  const feed    = document.getElementById("rounds-feed");
  const nextBar = document.getElementById("next-bar");
  const nextBtn = document.getElementById("next-btn");
  const timerOnBtn  = document.getElementById("timer-on-btn");
  const timerOffBtn = document.getElementById("timer-off-btn");

  function syncTimerToggleUI() {
    timerOnBtn.classList.toggle("active", timerEnabled);
    timerOffBtn.classList.toggle("active", !timerEnabled);
  }

  timerOnBtn.addEventListener("click", () => {
    timerEnabled = true;
    localStorage.setItem("scg_timer_enabled", "on");
    syncTimerToggleUI();
  });
  timerOffBtn.addEventListener("click", () => {
    timerEnabled = false;
    localStorage.setItem("scg_timer_enabled", "off");
    syncTimerToggleUI();
  });
  syncTimerToggleUI();

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function buildCardHTML(n) {
    return `
      <div class="round-card-meta">
        <span class="round-number">Round ${n}</span>
        <span class="difficulty-badge">Loading...</span>
      </div>
      <div class="objection-card-header">
        <div class="objection-card-text">
          <div class="panel-label">// Incoming objection</div>
          <div class="objection-context card-context">Loading scenario...</div>
          <div class="objection-quote card-quote">&nbsp;</div>
        </div>
        <div class="timer-ring">
          <svg viewBox="0 0 64 64">
            <circle class="track" cx="32" cy="32" r="28"></circle>
            <circle class="progress" cx="32" cy="32" r="28"
              stroke-dasharray="${CIRC.toFixed(2)}" stroke-dashoffset="0"></circle>
          </svg>
          <div class="timer-value">--</div>
        </div>
      </div>
      <textarea class="response-input" placeholder="Type how you'd respond, live, as if you're on the call right now..."></textarea>
      <div class="actions-row">
        <span class="objection-context status-line"></span>
        <button class="btn btn-primary submit-btn">Send response</button>
      </div>
      <div class="feedback-inline" style="display:none;"></div>
    `;
  }

  function startTimer(card, totalSeconds) {
    remaining = totalSeconds;
    clearInterval(timerHandle);

    if (!timerEnabled) {
      const ring = card.querySelector(".timer-ring");
      if (ring) ring.style.opacity = "0.3";
      card.querySelector(".timer-value").textContent = "∞";
      return;
    }

    const progressEl = card.querySelector(".progress");
    const valueEl    = card.querySelector(".timer-value");

    function tick() {
      valueEl.textContent = remaining;
      const offset = CIRC * (1 - remaining / totalSeconds);
      progressEl.setAttribute("stroke-dashoffset", offset.toFixed(2));
      progressEl.classList.remove("warn", "bad");
      if (remaining <= 5) progressEl.classList.add("bad");
      else if (remaining <= Math.floor(totalSeconds * 0.4)) progressEl.classList.add("warn");

      if (remaining <= 0) {
        clearInterval(timerHandle);
        if (!submitted) submitResponse(card);
        return;
      }
      remaining--;
    }

    tick();
    timerHandle = setInterval(tick, 1000);
  }

  function freezeCard(card) {
    card.querySelector(".response-input").disabled = true;
    card.querySelector(".submit-btn").disabled = true;
    clearInterval(timerHandle);
    const ring = card.querySelector(".timer-ring");
    if (ring) ring.style.opacity = "0.3";
  }

  async function loadNewObjection() {
    nextBar.style.display = "none";
    roundCount++;
    submitted = false;

    const card = document.createElement("div");
    card.className = "round-card loading";
    card.id = `round-${roundCount}`;
    card.innerHTML = buildCardHTML(roundCount);
    feed.appendChild(card);
    card.scrollIntoView({ behavior: "smooth", block: "start" });

    const submitBtn = card.querySelector(".submit-btn");
    const textarea  = card.querySelector(".response-input");
    submitBtn.addEventListener("click", () => submitResponse(card));
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitResponse(card);
      }
    });

    try {
      const token = localStorage.getItem("scg_auth_token");
      const res = await fetch("/api/objection/new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: "{}",
      });
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        if (d.error === "limit_reached" && typeof SCG_PRICING !== "undefined") SCG_PRICING.showModal();
        card.classList.remove("loading");
        card.querySelector(".card-context").textContent = "Monthly session limit reached.";
        card.querySelector(".card-quote").textContent   = "Upgrade to keep training.";
        return;
      }
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      currentObjection = data;

      card.classList.remove("loading");
      card.querySelector(".card-context").textContent = data.context;
      card.querySelector(".card-quote").textContent = `"${data.objection}"`;

      const cfg = DIFFICULTY_CONFIG[data.difficulty] || DIFFICULTY_CONFIG[2];
      const badge = card.querySelector(".difficulty-badge");
      badge.textContent = timerEnabled ? `${cfg.label} · ${cfg.seconds}s` : `${cfg.label} · no timer`;
      badge.dataset.difficulty = cfg.color;

      roundStartTime = Date.now();
      startTimer(card, cfg.seconds);
    } catch {
      card.classList.remove("loading");
      card.querySelector(".card-context").textContent = "Couldn't reach the AI.";
      card.querySelector(".card-quote").textContent = "Try again in a moment.";
    }
  }

  async function submitResponse(card) {
    if (submitted) return;
    submitted = true;
    clearInterval(timerHandle);

    const userResponse = card.querySelector(".response-input").value.trim() || "(no response, time ran out)";
    const timeTakenSeconds = Math.round((Date.now() - roundStartTime) / 1000);

    const submitBtn  = card.querySelector(".submit-btn");
    const statusLine = card.querySelector(".status-line");
    submitBtn.disabled = true;
    submitBtn.textContent = "Analyzing...";
    card.querySelector(".response-input").disabled = true;
    statusLine.textContent = "AI is reviewing your response...";

    try {
      const res = await fetch("/api/objection/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objection:        currentObjection.objection,
          context:          currentObjection.context,
          userResponse,
          timeTakenSeconds,
          difficulty:       currentObjection.difficulty,
        }),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      renderFeedbackInCard(card, data);
      freezeCard(card);
      nextBar.style.display = "flex";
      nextBar.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      statusLine.textContent = "Something went wrong. Try again.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Send response";
      card.querySelector(".response-input").disabled = false;
      submitted = false;
    }
  }

  function renderFeedbackInCard(card, data) {
    SCG.addScore(typeof data.score === "number" ? data.score : 0, "objection-battle");

    const score = typeof data.score === "number" ? data.score : 0;
    const scoreClass = score >= 7 ? "positive" : score >= 4 ? "neutral" : "negative";

    const wellItems   = (data.whatYouDidWell || []).map(b => `<li>${escapeHtml(b)}</li>`).join("") || "<li>Nothing notable.</li>";
    const missedItems = (data.whatYouMissed  || []).map(b => `<li>${escapeHtml(b)}</li>`).join("") || "<li>Nothing notable.</li>";

    // betterAlternative is now an array of lines
    const altItems = Array.isArray(data.betterAlternative)
      ? data.betterAlternative.map(b => `<li>${escapeHtml(b)}</li>`).join("")
      : `<li>${escapeHtml(data.betterAlternative)}</li>`;

    const feedbackEl = card.querySelector(".feedback-inline");
    feedbackEl.innerHTML = `
      <div class="score-result">
        <div class="score-result-value ${scoreClass}">${score}/10</div>
        <div class="score-result-label">this round</div>
      </div>
      <div class="feedback-block good">
        <h4><span class="tag"></span>What you did well</h4>
        <ul>${wellItems}</ul>
      </div>
      <div class="feedback-block bad">
        <h4><span class="tag"></span>What you missed</h4>
        <ul>${missedItems}</ul>
      </div>
      <div class="feedback-block info">
        <h4><span class="tag"></span>What's really going on</h4>
        <p>${escapeHtml(data.whatIsReallyGoingOn)}</p>
      </div>
      <div class="feedback-block info">
        <h4><span class="tag"></span>Better alternative</h4>
        <ul class="alt-lines">${altItems}</ul>
      </div>
      <div class="feedback-block info">
        <h4><span class="tag"></span>Principle</h4>
        <p>${escapeHtml(data.principle)}</p>
      </div>
    `;
    feedbackEl.style.display = "block";
  }

  async function checkHealth() {
    try {
      const res  = await fetch("/api/health");
      const data = await res.json();
      if (!data.aiConfigured) {
        document.getElementById("api-notice").style.display = "flex";
        document.getElementById("game-area").style.display  = "none";
        return false;
      }
      return true;
    } catch {
      document.getElementById("api-notice").style.display = "flex";
      document.getElementById("game-area").style.display  = "none";
      return false;
    }
  }

  nextBtn.addEventListener("click", loadNewObjection);

  (async () => {
    const ok = await checkHealth();
    if (ok) loadNewObjection();
  })();
})();
