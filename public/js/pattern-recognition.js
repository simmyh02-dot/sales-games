(() => {
  let exerciseCount = 0;
  let currentExercise = null;
  let currentDifficulty = 1;

  const feed    = document.getElementById("exercises-feed");
  const nextBar = document.getElementById("next-bar");
  const nextBtn = document.getElementById("next-btn");

  // Difficulty toggle
  document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentDifficulty = parseInt(btn.dataset.level);
    });
  });

  function t(key, vars) { return (typeof SCG_I18N !== "undefined") ? SCG_I18N.t(key, vars) : key; }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
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

  async function loadNewExercise() {
    nextBar.style.display = "none";
    exerciseCount++;

    const card = document.createElement("div");
    card.className = "round-card loading";
    card.id = `exercise-${exerciseCount}`;

    const n = exerciseCount;
    card.innerHTML = `
      <div class="round-card-meta">
        <span class="round-number">${escapeHtml(t("pr.exercise", { n }))}</span>
        <span class="difficulty-badge" data-difficulty="${currentDifficulty}">${escapeHtml(t("pr.level", { n: currentDifficulty }))}</span>
      </div>
      <div class="panel-label">${escapeHtml(t("pr.prospectSays"))}</div>
      <div class="objection-quote card-statement">${escapeHtml(t("common.loading"))}</div>
      <div class="objection-context card-question" style="margin-top:22px;"></div>
      <div class="option-grid card-options"></div>
      <div class="feedback-inline" style="display:none;"></div>
    `;

    feed.appendChild(card);
    card.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const token = localStorage.getItem("scg_auth_token");
      const res = await fetch("/api/pattern/new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ difficulty: currentDifficulty }),
      });
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        if (d.error === "limit_reached" && typeof SCG_PRICING !== "undefined") SCG_PRICING.showModal();
        card.classList.remove("loading");
        card.querySelector(".card-statement").textContent = t("common.limitReached");
        card.querySelector(".card-question").textContent  = t("common.limitUpgrade");
        return;
      }
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();

      card.classList.remove("loading");
      card.querySelector(".card-statement").textContent = `"${data.statement}"`;
      card.querySelector(".card-question").textContent  = data.question;

      renderOptions(card, data);
      currentExercise = data;
    } catch {
      card.classList.remove("loading");
      card.querySelector(".card-statement").textContent = t("common.aiUnreachable");
      card.querySelector(".card-question").textContent  = t("common.tryAgainMoment");
    }
  }

  function renderOptions(card, exercise) {
    const grid = card.querySelector(".card-options");
    grid.innerHTML = "";
    let answered = false;

    Object.entries(exercise.options).forEach(([key, text]) => {
      const btn = document.createElement("button");
      btn.className   = "option-btn";
      btn.dataset.key = key;
      btn.innerHTML   = `<span class="option-key">${key}</span><span>${escapeHtml(text)}</span>`;
      btn.addEventListener("click", () => selectOption(card, key, exercise, answered, (v) => { answered = v; }));
      grid.appendChild(btn);
    });
  }

  async function selectOption(card, key, exercise, answered, setAnswered) {
    if (answered) return;
    setAnswered(true);

    // Lock + highlight immediately
    const buttons = [...card.querySelectorAll(".option-btn")];
    buttons.forEach((btn) => {
      btn.disabled = true;
      const isBest     = btn.dataset.key === exercise.correctAnswer;
      const isUserPick = btn.dataset.key === key;
      const isAlsoOk   = exercise.twoCorrect && btn.dataset.key === exercise.secondCorrect;
      if (isBest) btn.classList.add("correct");
      else if (isUserPick && isAlsoOk) btn.classList.add("second-correct");
      else if (isUserPick) btn.classList.add("incorrect");
    });

    // Also reveal second correct after user picks, even if they picked the primary
    if (exercise.twoCorrect && exercise.secondCorrect) {
      buttons.forEach(btn => {
        if (btn.dataset.key === exercise.secondCorrect && !btn.classList.contains("correct") && !btn.classList.contains("second-correct")) {
          btn.classList.add("second-correct");
        }
      });
    }

    try {
      const res = await fetch("/api/pattern/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement:     exercise.statement,
          question:      exercise.question,
          options:       exercise.options,
          correctAnswer: exercise.correctAnswer,
          userAnswer:    key,
          difficulty:    exercise.difficulty || 2,
          twoCorrect:    exercise.twoCorrect || false,
          secondCorrect: exercise.secondCorrect || null,
        }),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      renderFeedbackInCard(card, data);
    } catch {
      // On failure, still show next bar so user isn't stuck
      nextBar.style.display = "flex";
    }
  }

  function renderFeedbackInCard(card, data) {
    // Award the round's points (3/5/7 by level, only if correct) and meter the session.
    const points = Math.max(0, Number.isFinite(data.pointsAwarded) ? data.pointsAwarded : 0);
    SCG.addScore(points, "pattern-recognition");

    const isCorrect   = data.correct;
    const verdictClass = isCorrect ? "positive" : "negative";
    const verdictLabel = escapeHtml(t(isCorrect ? "pr.correct" : "pr.incorrect"));
    const pointsPill = `<div class="points-badge">${escapeHtml(t(points === 1 ? "common.pointPill" : "common.pointsPill", { n: points }))}</div>`
      + (data.pointsBreakdown ? `<div class="points-why">${escapeHtml(data.pointsBreakdown)}</div>` : "");

    // howToHandleIt is now an array of steps
    const handleItems = Array.isArray(data.howToHandleIt)
      ? data.howToHandleIt.map(b => `<li>${escapeHtml(b)}</li>`).join("")
      : `<li>${escapeHtml(data.howToHandleIt)}</li>`;

    const resultClass = data.correct ? "good" : "bad";
    const twoCorrectNote = data.twoCorrectNote
      ? `<p style="color:var(--good);font-size:13px;margin-top:8px;">${escapeHtml(data.twoCorrectNote)}</p>`
      : "";

    const feedbackEl = card.querySelector(".feedback-inline");
    feedbackEl.innerHTML = `
      <div class="score-result">
        <div class="score-result-value ${verdictClass}">${verdictLabel}</div>
        ${pointsPill}
      </div>
      ${twoCorrectNote}
      <div class="feedback-block ${resultClass}">
        <h4><span class="tag"></span>${escapeHtml(t("pr.why"))}</h4>
        <p>${escapeHtml(data.explanation)}</p>
      </div>
      <div class="feedback-block ${resultClass}">
        <h4><span class="tag"></span>${escapeHtml(t("pr.affectsBuying"))}</h4>
        <p>${escapeHtml(data.howItAffectsBuying)}</p>
      </div>
      <div class="feedback-block ${resultClass}">
        <h4><span class="tag"></span>${escapeHtml(t("pr.howToHandle"))}</h4>
        <ul>${handleItems}</ul>
      </div>
      <div class="feedback-block ${resultClass}">
        <h4><span class="tag"></span>${escapeHtml(t("common.principle"))}</h4>
        <p>${escapeHtml(data.principle)}</p>
      </div>
    `;
    feedbackEl.style.display = "block";

    nextBar.style.display = "flex";
    nextBar.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  nextBtn.addEventListener("click", loadNewExercise);

  // Pre-start setup: choose a level, then begin reading.
  const prStart    = document.getElementById("pr-start");
  const prDiffbar  = document.getElementById("pr-diffbar");
  const gameArea   = document.getElementById("game-area");
  const prLevels   = document.getElementById("pr-levels");
  const prStartBtn = document.getElementById("pr-start-btn");

  function setLevel(lvl) {
    currentDifficulty = lvl;
    prLevels.querySelectorAll(".prestart-btn").forEach((b) =>
      b.classList.toggle("active", parseInt(b.dataset.level, 10) === lvl));
    document.querySelectorAll(".diff-btn").forEach((b) =>
      b.classList.toggle("active", parseInt(b.dataset.level, 10) === lvl));
  }
  prLevels.querySelectorAll(".prestart-btn").forEach((b) =>
    b.addEventListener("click", () => setLevel(parseInt(b.dataset.level, 10) || 1)));
  prStartBtn.addEventListener("click", () => {
    prStart.style.display = "none";
    prDiffbar.style.display = "flex";
    gameArea.style.display = "block";
    loadNewExercise();
  });

  (async () => {
    const ok = await checkHealth();
    if (ok) prStart.style.display = "block";
  })();
})();
