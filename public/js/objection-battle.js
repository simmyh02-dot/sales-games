(() => {
  const CIRC = 2 * Math.PI * 28;

  function t(key, vars) { return (typeof SCG_I18N !== "undefined") ? SCG_I18N.t(key, vars) : key; }

  // Labels are i18n keys, resolved when the badge is written.
  const DIFFICULTY_CONFIG = {
    1: { label: "ob.easy",   seconds: 30,  color: "1" },
    2: { label: "ob.medium", seconds: 60,  color: "2" },
    3: { label: "ob.hard",   seconds: 90,  color: "3" },
  };

  let roundCount = 0;
  let timerHandle = null;
  let remaining = 30;
  let currentObjection = null;
  let submitted = false;
  let timerEnabled = localStorage.getItem("scg_timer_enabled") !== "off";
  let roundStartTime = 0;
  let chosenDifficulty = 2;   // set on the pre-start screen

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
        <span class="round-number">${escapeHtml(t("ob.round", { n }))}</span>
        <span class="difficulty-badge">${escapeHtml(t("common.loading"))}</span>
      </div>
      <div class="objection-card-header">
        <div class="objection-card-text">
          <div class="panel-label">${escapeHtml(t("ob.incoming"))}</div>
          <div class="objection-context card-context">${escapeHtml(t("ob.loadingScenario"))}</div>
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
      <textarea class="response-input" placeholder="${escapeHtml(t("ob.placeholder"))}"></textarea>
      <div class="actions-row">
        <span class="objection-context status-line"></span>
        <button class="btn btn-primary submit-btn">${escapeHtml(t("ob.send"))}</button>
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
        body: JSON.stringify({ difficulty: chosenDifficulty }),
      });
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        if (d.error === "limit_reached" && typeof SCG_PRICING !== "undefined") SCG_PRICING.showModal();
        card.classList.remove("loading");
        card.querySelector(".card-context").textContent = t("common.limitReached");
        card.querySelector(".card-quote").textContent   = t("common.limitUpgrade");
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
      badge.textContent = timerEnabled
        ? `${t(cfg.label)} · ${cfg.seconds}s`
        : `${t(cfg.label)} · ${t("ob.noTimer")}`;
      badge.dataset.difficulty = cfg.color;

      roundStartTime = Date.now();
      startTimer(card, cfg.seconds);
    } catch {
      card.classList.remove("loading");
      card.querySelector(".card-context").textContent = t("common.aiUnreachable");
      card.querySelector(".card-quote").textContent = t("common.tryAgainMoment");
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
    submitBtn.textContent = t("ob.analyzing");
    card.querySelector(".response-input").disabled = true;
    statusLine.textContent = t("ob.reviewing");

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
      statusLine.textContent = t("common.somethingWrong");
      submitBtn.disabled = false;
      submitBtn.textContent = t("ob.send");
      card.querySelector(".response-input").disabled = false;
      submitted = false;
    }
  }

  function renderFeedbackInCard(card, data) {
    // Award the round's points (your 0-10 grade) and meter the session.
    const points = Math.max(0, Number.isFinite(data.pointsAwarded) ? data.pointsAwarded
      : (Number.isFinite(data.score) ? data.score : 0));
    SCG.addScore(points, "objection-battle");
    const pointsPill = `<div class="points-badge">${escapeHtml(t(points === 1 ? "common.pointPill" : "common.pointsPill", { n: points }))}</div>`
      + (data.pointsBreakdown ? `<div class="points-why">${escapeHtml(data.pointsBreakdown)}</div>` : "");

    const nothing     = `<li>${escapeHtml(t("common.nothingNotable"))}</li>`;
    const wellItems   = (data.whatYouDidWell || []).map(b => `<li>${escapeHtml(b)}</li>`).join("") || nothing;
    const missedItems = (data.whatYouMissed  || []).map(b => `<li>${escapeHtml(b)}</li>`).join("") || nothing;

    // betterAlternative is now an array of lines
    const altItems = Array.isArray(data.betterAlternative)
      ? data.betterAlternative.map(b => `<li>${escapeHtml(b)}</li>`).join("")
      : `<li>${escapeHtml(data.betterAlternative)}</li>`;

    const feedbackEl = card.querySelector(".feedback-inline");
    feedbackEl.innerHTML = `
      ${pointsPill}
      <div class="feedback-block good">
        <h4><span class="tag"></span>${escapeHtml(t("ob.didWell"))}</h4>
        <ul>${wellItems}</ul>
      </div>
      <div class="feedback-block bad">
        <h4><span class="tag"></span>${escapeHtml(t("ob.missed"))}</h4>
        <ul>${missedItems}</ul>
      </div>
      <div class="feedback-block info">
        <h4><span class="tag"></span>${escapeHtml(t("ob.reallyGoingOn"))}</h4>
        <p>${escapeHtml(data.whatIsReallyGoingOn)}</p>
      </div>
      <div class="feedback-block info">
        <h4><span class="tag"></span>${escapeHtml(t("ob.betterAlt"))}</h4>
        <ul class="alt-lines">${altItems}</ul>
      </div>
      <div class="feedback-block info">
        <h4><span class="tag"></span>${escapeHtml(t("common.principle"))}</h4>
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

  // Pre-start setup: pick difficulty + timer, then begin the drill.
  const startPanel = document.getElementById("ob-start");
  const gameArea   = document.getElementById("game-area");
  const diffOpts   = document.getElementById("ob-difficulty");
  const timerOpts  = document.getElementById("ob-timer");
  const startBtn   = document.getElementById("ob-start-btn");

  function syncStartTimerUI() {
    timerOpts.querySelectorAll(".prestart-btn").forEach((b) =>
      b.classList.toggle("active", (b.dataset.timer === "on") === timerEnabled));
  }
  diffOpts.querySelectorAll(".prestart-btn").forEach((b) => {
    b.addEventListener("click", () => {
      diffOpts.querySelectorAll(".prestart-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      chosenDifficulty = parseInt(b.dataset.level, 10) || 2;
    });
  });
  timerOpts.querySelectorAll(".prestart-btn").forEach((b) => {
    b.addEventListener("click", () => {
      timerEnabled = b.dataset.timer === "on";
      localStorage.setItem("scg_timer_enabled", timerEnabled ? "on" : "off");
      syncStartTimerUI();
      syncTimerToggleUI();
    });
  });
  startBtn.addEventListener("click", () => {
    startPanel.style.display = "none";
    gameArea.style.display = "block";
    loadNewObjection();
  });

  (async () => {
    const ok = await checkHealth();
    if (ok) { syncStartTimerUI(); startPanel.style.display = "block"; }
  })();
})();
