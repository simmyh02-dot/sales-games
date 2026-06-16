(() => {
  const els = {
    statement: document.getElementById("statement-text"),
    question: document.getElementById("question-text"),
    optionGrid: document.getElementById("option-grid"),
    exercisePanel: document.getElementById("exercise-panel"),
    feedbackPanel: document.getElementById("feedback-panel"),
    nextBtn: document.getElementById("next-btn"),
    apiNotice: document.getElementById("api-notice"),
    gameArea: document.getElementById("game-area"),
  };

  let current = null; // { statement, question, options, correctAnswer }
  let answered = false;

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

  async function loadNewExercise() {
    answered = false;
    els.feedbackPanel.style.display = "none";
    els.exercisePanel.style.display = "block";
    els.statement.textContent = "Loading scenario...";
    els.question.textContent = "";
    els.optionGrid.innerHTML = "";

    try {
      const res = await fetch("/api/pattern/new", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      current = data;
      els.statement.textContent = `"${data.statement}"`;
      els.question.textContent = data.question;
      renderOptions(data.options);
    } catch {
      els.statement.textContent = "Couldn't reach the AI.";
      els.question.textContent = "Try again in a moment.";
    }
  }

  function renderOptions(options) {
    els.optionGrid.innerHTML = "";
    Object.entries(options).forEach(([key, text]) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.dataset.key = key;
      btn.innerHTML = `<span class="option-key">${key}</span><span>${text}</span>`;
      btn.addEventListener("click", () => selectOption(key));
      els.optionGrid.appendChild(btn);
    });
  }

  async function selectOption(key) {
    if (answered) return;
    answered = true;

    // lock + highlight
    [...els.optionGrid.children].forEach((btn) => {
      btn.disabled = true;
      if (btn.dataset.key === current.correctAnswer) btn.classList.add("correct");
      if (btn.dataset.key === key && key !== current.correctAnswer) btn.classList.add("incorrect");
    });

    try {
      const res = await fetch("/api/pattern/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: current.statement,
          question: current.question,
          options: current.options,
          correctAnswer: current.correctAnswer,
          userAnswer: key,
        }),
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      renderFeedback(data);
    } catch {
      answered = false;
    }
  }

  function renderFeedback(data) {
    SCG.addScore(typeof data.score === "number" ? data.score : 0);

    const scoreEl = document.getElementById("score-result-value");
    const labelEl = document.getElementById("score-result-label");
    const score = data.score || 0;
    scoreEl.textContent = score > 0 ? `+${score}` : `${score}`;
    scoreEl.classList.remove("positive", "negative", "neutral");
    if (score > 0) scoreEl.classList.add("positive");
    else if (score < 0) scoreEl.classList.add("negative");
    else scoreEl.classList.add("neutral");
    labelEl.textContent = data.correct ? "Correct — points this round" : "Incorrect — points this round";

    document.getElementById("fb-explanation").textContent = data.explanation || "";
    document.getElementById("fb-buying").textContent = data.howItAffectsBuying || "";
    document.getElementById("fb-handle").textContent = data.howToHandleIt || "";
    document.getElementById("fb-principle").textContent = data.principle || "";

    setTimeout(() => {
      els.feedbackPanel.style.display = "block";
    }, 500);
  }

  els.nextBtn.addEventListener("click", loadNewExercise);

  (async () => {
    const ok = await checkHealth();
    if (ok) loadNewExercise();
  })();
})();
