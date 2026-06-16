require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";

const SALES_NOTES = fs.readFileSync(
  path.join(__dirname, "knowledge", "sales_notes.md"),
  "utf-8"
);

let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function requireAI(res) {
  if (!anthropic) {
    res.status(503).json({
      error:
        "No Claude API key configured. Add ANTHROPIC_API_KEY to your .env file and restart the server.",
    });
    return false;
  }
  return true;
}

const BASE_SYSTEM = `You are the AI engine behind "Sales Camp Games", a sales training app.
Every piece of coaching, feedback, generated objection, scenario, and explanation you produce
MUST be grounded in the sales study notes below. Reference the underlying principles by name
where relevant (e.g. Authority, Language Fixing, Limiting Beliefs, Tonality, Identity Shift,
Certainty Building, Objection Handling, Selling to Identity, The One Call Close, Structure).
Do not invent generic sales advice that contradicts these notes.

Always respond with ONLY valid JSON matching the schema described in the user message.
No markdown, no commentary, no code fences.

=== SALES STUDY NOTES ===
${SALES_NOTES}
=== END OF NOTES ===`;

async function askClaude(userPrompt, maxTokens = 1500) {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: BASE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return extractJSON(text);
}

function extractJSON(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in AI response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ---------------------------------------------------------------------
// 1. Objection Battle
// ---------------------------------------------------------------------

app.post("/api/objection/new", async (req, res) => {
  if (!requireAI(res)) return;
  try {
    const data = await askClaude(
      `Generate ONE realistic sales objection a prospect would say during a sales call,
based on the objection patterns found in the sales study notes.
Vary the objection each time (price, time, trust, spouse, "need to think about it",
"send me info", "I've tried this before", etc).

Respond with JSON:
{
  "objection": "the exact line the prospect says, in quotes",
  "context": "one sentence describing the situation/scenario this came up in"
}`,
      400
    );
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate objection." });
  }
});

app.post("/api/objection/feedback", async (req, res) => {
  if (!requireAI(res)) return;
  const { objection, context, userResponse, timeTakenSeconds } = req.body;
  try {
    const data = await askClaude(
      `The prospect raised this objection during a sales call:
Context: ${context}
Objection: "${objection}"

The user had 30 seconds to respond and answered (took ${timeTakenSeconds}s):
"${userResponse}"

Analyze the response and return JSON with this exact schema:
{
  "whatYouDidWell": ["short bullet", "..."],
  "whatYouMissed": ["short bullet", "..."],
  "betterAlternative": "how someone with more experience would likely have responded, written as an example reply",
  "whatIsReallyGoingOn": "the underlying belief/emotion/situation behind the objection",
  "principle": "the single sales principle from the notes this situation was really about",
  "score": <integer between -10 and 10, reflecting how good the response was. Be honest, not generous; a generic or surface-level response that takes the objection at face value should score 0 or negative. A response that explores the real belief and reframes it should score positive>
}`,
      900
    );
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze response." });
  }
});

// ---------------------------------------------------------------------
// 2. Pattern Recognition
// ---------------------------------------------------------------------

app.post("/api/pattern/new", async (req, res) => {
  if (!requireAI(res)) return;
  try {
    const data = await askClaude(
      `Generate ONE "pattern recognition" exercise for buyer psychology training, based on
the sales study notes. Pick a realistic statement a prospect might say that hints at a
limiting belief, emotion, identity issue, hidden objection, or decision pattern.
Then create a multiple-choice question asking what is REALLY going on underneath the statement.

Respond with JSON:
{
  "statement": "the prospect's exact line, in quotes",
  "question": "What is the central issue here? (or similar phrasing)",
  "options": {
    "A": "option text",
    "B": "option text",
    "C": "option text",
    "D": "option text"
  },
  "correctAnswer": "A" | "B" | "C" | "D"
}

Make sure exactly one option is clearly the best/correct answer grounded in the notes, and the
others are plausible but wrong (e.g. surface-level reads like money/timing when the real issue
is identity/certainty/trust).`,
      500
    );
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate exercise." });
  }
});

app.post("/api/pattern/feedback", async (req, res) => {
  if (!requireAI(res)) return;
  const { statement, question, options, correctAnswer, userAnswer } = req.body;
  try {
    const data = await askClaude(
      `Pattern recognition exercise:
Prospect said: "${statement}"
Question: ${question}
Options: ${JSON.stringify(options)}
Correct answer: ${correctAnswer}
User chose: ${userAnswer}

Explain the reasoning. Return JSON:
{
  "correct": ${userAnswer === correctAnswer ? "true" : "false"},
  "explanation": "why the correct answer is right, tied to buyer psychology",
  "howItAffectsBuying": "how this issue affects the prospect's buying behavior",
  "howToHandleIt": "how the user could help the prospect think differently about it",
  "principle": "the single sales principle from the notes this relates to",
  "score": <integer, +5 if correct, -3 if incorrect>
}`,
      700
    );
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to analyze answer." });
  }
});

// ---------------------------------------------------------------------
// 3. Sales Call Mode
// ---------------------------------------------------------------------

app.post("/api/call/start", async (req, res) => {
  if (!requireAI(res)) return;
  const { scenario, customDescription } = req.body;
  try {
    const data = await askClaude(
      `Generate a prospect profile for a sales call roleplay simulation.
Scenario: ${scenario}${customDescription ? ` - custom details: ${customDescription}` : ""}

Return JSON:
{
  "name": "first name",
  "age": <number>,
  "goal": "their main goal",
  "currentSituation": "their current situation",
  "problem": "their core problem",
  "hiddenBelief": "a limiting belief they hold, in quotes, that they would never say out loud",
  "buyingReadiness": "Low" | "Medium" | "High",
  "openingMessage": "the prospect's opening line to start the call - casual, like a real person picking up, NOT a sales pitch from them"
}`,
      600
    );
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start call." });
  }
});

app.post("/api/call/message", async (req, res) => {
  if (!requireAI(res)) return;
  const { scenario, prospect, history, userMessage } = req.body;
  try {
    const historyText = (history || [])
      .map((m) => `${m.role === "user" ? "Salesperson" : "Prospect"}: ${m.content}`)
      .join("\n");

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: `You are roleplaying as a sales prospect named ${prospect.name} in a "${scenario}" sales call simulation.

Profile:
- Age: ${prospect.age}
- Goal: ${prospect.goal}
- Current situation: ${prospect.currentSituation}
- Problem: ${prospect.problem}
- Hidden belief (never say this explicitly, but let it leak through your resistance/objections): ${prospect.hiddenBelief}
- Buying readiness: ${prospect.buyingReadiness}

Stay completely in character as a real human prospect on a call. Speak naturally and conversationally,
like a normal person texting/talking - not like a teacher, not like an AI assistant, not overly formal.
React realistically to the salesperson based on how well they build rapport, ask questions,
uncover your real problem, and handle your objections. Be a little guarded at first.
If the salesperson does a good job (per the principles in the sales notes: Authority, Tonality,
Identity Shift, Certainty Building, Objection Handling, etc), gradually open up and become more
receptive. If they pitch too early, get vague, or ignore your objections, stay resistant or
push back realistically. Keep responses short (1-4 sentences), like a real conversation.
Never break character. Never mention you are an AI.`,
      messages: [
        {
          role: "user",
          content: `Conversation so far:\n${historyText}\n\nSalesperson: ${userMessage}\n\nRespond only as ${prospect.name}, in character. Output just the spoken reply, nothing else.`,
        },
      ],
    });

    const reply = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get prospect reply." });
  }
});

app.post("/api/call/end", async (req, res) => {
  if (!requireAI(res)) return;
  const { scenario, prospect, history } = req.body;
  try {
    const historyText = (history || [])
      .map((m) => `${m.role === "user" ? "Salesperson" : "Prospect"}: ${m.content}`)
      .join("\n");

    const data = await askClaude(
      `A sales call roleplay simulation just ended.
Scenario: ${scenario}
Prospect profile: ${JSON.stringify(prospect)}

Full transcript:
${historyText}

Analyze the salesperson's (the "Salesperson" lines) performance in depth, grounded in the
sales study notes. Return JSON with this exact schema:
{
  "callScore": <integer 0-100>,
  "whatYouDidWell": ["bullet", "..."],
  "biggestMistakes": ["bullet", "..."],
  "missedOpportunities": [
    { "prospectSaid": "quote from transcript", "youTreatedItAs": "...", "itWasActually": "..." }
  ],
  "whatATopCloserWouldHaveDone": ["bullet", "..."],
  "principles": [
    { "name": "principle name from notes (e.g. Authority, Identity Shift, Certainty Building, Tonality, Language Fixing, Limiting Beliefs, Objection Handling)", "note": "how it applied to a specific moment in this call" }
  ],
  "scoreDelta": <integer between -15 and 15, how this performance should affect the user's daily score - roughly (callScore-50)/4 rounded>
}`,
      1500
    );
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate feedback report." });
  }
});

// ---------------------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({ ok: true, aiConfigured: !!anthropic, model: MODEL });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sales Camp Games running at http://localhost:${PORT}`);
    if (!anthropic) {
      console.log("WARNING: ANTHROPIC_API_KEY not set. AI features are disabled until you add it to .env");
    }
  });
}

module.exports = app;
