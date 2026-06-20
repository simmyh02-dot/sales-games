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
        <span class="round-number">Exercise ${n}</span>
        <span class="difficulty-badge" data-difficulty="${currentDifficulty}">Level ${currentDifficulty}</span>
      </div>
      <div class="panel-label">// Prospect says</div>
      <div class="objection-quote card-statement">Loading...</div>
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
        card.querySelector(".card-statement").textContent = "Monthly session limit reached.";
        card.querySelector(".card-question").textContent  = "Upgrade to keep training.";
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
      card.querySelector(".card-statement").textContent = "Couldn't reach the AI.";
      card.querySelector(".card-question").textContent  = "Try again in a moment.";
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
    SCG.addScore(typeof data.score === "number" ? data.score : 0, "pattern-recognition");

    const score      = typeof data.score === "number" ? data.score : 0;
    const isCorrect  = data.correct;
    const scoreClass = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
    const scoreLabel = isCorrect ? "Correct" : "Incorrect";

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
        <div class="score-result-value ${scoreClass}">${score > 0 ? "+" : ""}${score}</div>
        <div class="score-result-label">${scoreLabel}</div>
      </div>
      ${twoCorrectNote}
      <div class="feedback-block ${resultClass}">
        <h4><span class="tag"></span>Why</h4>
        <p>${escapeHtml(data.explanation)}</p>
      </div>
      <div class="feedback-block ${resultClass}">
        <h4><span class="tag"></span>How it affects buying</h4>
        <p>${escapeHtml(data.howItAffectsBuying)}</p>
      </div>
      <div class="feedback-block ${resultClass}">
        <h4><span class="tag"></span>How to handle it</h4>
        <ul>${handleItems}</ul>
      </div>
      <div class="feedback-block ${resultClass}">
        <h4><span class="tag"></span>Principle</h4>
        <p>${escapeHtml(data.principle)}</p>
      </div>
    `;
    feedbackEl.style.display = "block";

    nextBar.style.display = "flex";
    nextBar.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  nextBtn.addEventListener("click", loadNewExercise);

  (async () => {
    const ok = await checkHealth();
    if (ok) loadNewExercise();
  })();
})();
