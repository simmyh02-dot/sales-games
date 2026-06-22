require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { OAuth2Client } = require("google-auth-library");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try { stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); } catch (e) { console.warn("Stripe load failed:", e.message); }
}

const app = express();
const PORT = process.env.PORT || 3000;

const HAIKU  = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";

const SALES_NOTES = fs.readFileSync(
  path.join(__dirname, "knowledge", "sales_notes.md"),
  "utf-8"
);

// ---------------------------------------------------------------------
// AI client
// ---------------------------------------------------------------------

let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ---------------------------------------------------------------------
// Database (Neon / Postgres — optional; auth degrades gracefully if absent)
// ---------------------------------------------------------------------

let db = null;
if (process.env.DATABASE_URL) {
  db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE,
      email TEXT,
      name TEXT,
      picture TEXT,
      created_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      delta INTEGER,
      mode TEXT,
      date TEXT,
      created_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS unlocked_skills (
      user_id TEXT,
      skill_id TEXT,
      unlocked_at BIGINT,
      PRIMARY KEY (user_id, skill_id)
    );
    CREATE TABLE IF NOT EXISTS rivals (
      user_id TEXT,
      rival_email TEXT,
      created_at BIGINT,
      PRIMARY KEY (user_id, rival_email)
    );
  `).catch((e) => console.error("DB init error:", e.message));
  db.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
  `).catch(() => {});
}

// ---------------------------------------------------------------------
// Google auth client
// ---------------------------------------------------------------------

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });
  req.userId = payload.sub;
  next();
}

// ---------------------------------------------------------------------
// Skill unlock system
// ---------------------------------------------------------------------

const PRE_UNLOCKED = new Set([
  "tonality","t_confused","t_curious","t_concerned","t_challenging",
  "t_playful","whatfeel","piv","tempo"
]);

const SKILL_ID_PROMPT = `Unlockable skill IDs (use exact ID strings in discovered_skills):
spine(One-Call Close), opening(Opening), setframe(Set Frame), situation(Situation), problem(Problem), eliminate(Eliminate Solutions), buying(Buying Decision), futurepacing(Future Pacing), consequences(Consequences), presentation(Presentation), objections_phase(Objections Phase), sixneeds(6 Human Needs), maslow(Maslow's Pyramid), problemvssymptom(Problem vs Symptom), probingladder(Probing Ladder), improvementoffer(Improvement Offer), newopp(New Opportunity), pb_justtellme(Pushback-Just Tell Me), pb_allgood(Pushback-Everything Fine), limitingbeliefs(Limiting Beliefs), reframe4(4-Step Reframe), belief_types(Belief Types), reframeladder(Reframe Steps), prehandle_q(Pre-Handle Question), b_tried(Tried Before), b_companies(Talking to Others), b_youtube(Tried It Alone), b_nothing(Done Nothing), ex_time(Excuse-Time), ex_money(Excuse-Money), ex_didntknow(Excuse-DidntKnow), ex_research(Excuse-Just Looking), realbeliefs(Real Beliefs), identityframe(Identity Frame), roimath(ROI Math), rf_restaurant(Restaurant Reframe), rf_beach(Beach Reframe), rf_medal(Medal Reframe), rf_lion(Lion Reframe), rf_boats(Burn the Boats), rf_nicekind(Nice vs Kind), objections(Objections), smoke_vs_real(Smoke Screen vs Real), slowdown(Slow Down), o_think(Need to Think), o_partner(Need Partner), niche_smoke(Niche Smoke Screens), o_money(Money Objection), cdr(CDR), twofold(Two-Fold Choice), o_time(Time Objection), dmp(Decision-Making Process), dmp_partner(DMP-Partner), dmp_scale(DMP-Scale), rf_airplane(Airplane Reframe), fear(Fear Objection), abc(ABC), bossvoice(Boss Voice), identity(Identity), logiclevels(Logical Levels), identitygap(Identity Gap), desiredidentity(Desired Identity), identitybridge(Identity Bridge), realurgency(Real Urgency), straightline(Straight Line), talkmirror(Language=Self-Talk), l_wishful(Wishful Language), l_minimize(Minimizing Language), l_external(Victim Language), l_ambiguous(Ambiguous Language), authority(Authority), funnel(Funnel), theirwords(Use Their Words), selleridentity(Seller Identity), discovery(Discovery), openq(Open Questions), dozenq(A Dozen Questions), threefour(3-4 Problem Rule), talklisten(Talk-Listen Ratio), seqq(Sequence Questions), objframework(5-Step Framework), rootcauses(3 Root Causes), feelfeltfound(Feel-Felt-Found), proactive(Pre-empt Objections), fundamentals(Fundamentals), remote(Remote High-Ticket), cameraon(Camera On), framecontrol(Frame Control), remoteopen(Remote Opening), derisk(De-Risk not Discount)`;

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    const payload = verifyToken(token);
    if (payload) req.userId = payload.sub;
  }
  next();
}

async function autoUnlock(userId, discoveredSkills) {
  if (!db || !userId || !Array.isArray(discoveredSkills) || discoveredSkills.length === 0) return;
  const validIds = discoveredSkills.filter(id => id && !PRE_UNLOCKED.has(id));
  const now = Date.now();
  for (const skillId of validIds) {
    await db.query(
      `INSERT INTO unlocked_skills (user_id, skill_id, unlocked_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [userId, skillId, now]
    ).catch(e => console.error("autoUnlock error:", e.message));
  }
}

// ---------------------------------------------------------------------
// Session gating
// ---------------------------------------------------------------------

const ADMIN_EMAILS = ["simmyh02@gmail.com"];
const TIER_LIMITS  = { free: 5, pro: 60, power: Infinity };

async function getMonthlySessionCount(userId) {
  if (!db) return 0;
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const dateStr = firstOfMonth.toISOString().slice(0, 10);
  try {
    const result = await db.query(
      "SELECT COUNT(*) AS cnt FROM scores WHERE user_id=$1 AND date >= $2",
      [userId, dateStr]
    );
    return parseInt(result.rows[0].cnt) || 0;
  } catch { return 0; }
}

async function checkSessionLimit(req, res, next) {
  if (!req.userId || !db) return next();
  try {
    const row = await db.query("SELECT email, tier FROM users WHERE id=$1", [req.userId]);
    if (!row.rows.length) return next();
    const { email, tier } = row.rows[0];
    if (ADMIN_EMAILS.includes(email)) return next();
    const limit = TIER_LIMITS[tier || "free"];
    if (!limit || limit === Infinity) return next();
    const count = await getMonthlySessionCount(req.userId);
    if (count >= limit) {
      return res.status(403).json({ error: "limit_reached", tier: tier || "free", sessionsUsed: count, sessionsLimit: limit });
    }
    next();
  } catch { next(); }
}

// ---------------------------------------------------------------------
// Cache — Postgres-backed when DATABASE_URL is set (so generated
// exercises survive serverless cold starts and are shared across
// instances), falls back to a local file when there's no DB.
// ---------------------------------------------------------------------

const CACHE_DIR      = process.env.VERCEL ? "/tmp/scg-cache" : path.join(__dirname, "cache");
const OBJ_CACHE_FILE = path.join(CACHE_DIR, "objections.json");
const PAT_CACHE_FILE = path.join(CACHE_DIR, "patterns.json");
const CACHE_LOAD_LIMIT = 200;
const CACHE_MEMORY_LIMIT = 300;

let objectionCache = [];
let patternCache   = [];
const recentlyServedObjections = [];
const recentlyServedPatterns   = [];
const RECENT_WINDOW = 5;

if (db) {
  db.query(`
    CREATE TABLE IF NOT EXISTS generated_cache (
      id SERIAL PRIMARY KEY,
      kind TEXT,
      payload JSONB,
      created_at BIGINT
    );
  `).catch((e) => console.error("DB init error (generated_cache):", e.message));
}

async function loadCaches() {
  if (db) {
    try {
      const objRows = await db.query(
        `SELECT payload FROM generated_cache WHERE kind = 'objection' ORDER BY id DESC LIMIT $1`,
        [CACHE_LOAD_LIMIT]
      );
      objectionCache = objRows.rows.map((r) => r.payload);
      const patRows = await db.query(
        `SELECT payload FROM generated_cache WHERE kind = 'pattern' ORDER BY id DESC LIMIT $1`,
        [CACHE_LOAD_LIMIT]
      );
      patternCache = patRows.rows.map((r) => r.payload);
      console.log(`Cache loaded from DB: ${objectionCache.length} objections, ${patternCache.length} patterns`);
    } catch (e) {
      console.error("Cache load from DB failed:", e.message);
    }
    return;
  }
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (fs.existsSync(OBJ_CACHE_FILE))
      objectionCache = JSON.parse(fs.readFileSync(OBJ_CACHE_FILE, "utf-8"));
  } catch { objectionCache = []; }
  try {
    if (fs.existsSync(PAT_CACHE_FILE))
      patternCache = JSON.parse(fs.readFileSync(PAT_CACHE_FILE, "utf-8"));
  } catch { patternCache = []; }
  console.log(`Cache loaded from file: ${objectionCache.length} objections, ${patternCache.length} patterns`);
}

function saveCache(kind, item, filePath, arr) {
  if (arr.length > CACHE_MEMORY_LIMIT) arr.shift();
  if (db) {
    db.query(
      `INSERT INTO generated_cache (kind, payload, created_at) VALUES ($1, $2, $3)`,
      [kind, JSON.stringify(item), Date.now()]
    ).catch((e) => console.error("Cache write failed:", e.message));
    return;
  }
  fs.promises.writeFile(filePath, JSON.stringify(arr, null, 2), "utf-8")
    .catch((e) => console.error("Cache write failed:", e.message));
}

function pickFromCache(cache, recentKeys, keyField) {
  const eligible = cache.filter((item) => !recentKeys.includes(item[keyField]));
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

function trackRecent(arr, key) {
  arr.push(key);
  if (arr.length > RECENT_WINDOW) arr.shift();
}

loadCaches();

// ---------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------

function requireAI(res) {
  if (!anthropic) {
    res.status(503).json({
      error: "No Claude API key configured. Add ANTHROPIC_API_KEY to your environment variables.",
    });
    return false;
  }
  return true;
}

const STYLE_RULES = `
RESPONSE STYLE (follow strictly):
- Write in plain, everyday English. No unnecessary jargon.
- Keep each bullet point under 15 words.
- Be direct and specific. No vague praise or vague criticism.
- Name the exact mistake or the exact thing they did right.
- Never use em-dashes (—). Use hyphens (-), colons (:), or restructure the sentence.`;

const BASE_SYSTEM = `You are the AI engine behind "Sales Camp Games", a sales training app.
Every piece of coaching, feedback, generated objection, scenario, and explanation you produce
MUST be grounded in the sales study notes below. Reference the underlying principles by name
where relevant (e.g. Authority, Language Fixing, Limiting Beliefs, Tonality, Identity Shift,
Certainty Building, Objection Handling, Selling to Identity, The One Call Close, Structure).
Do not invent generic sales advice that contradicts these notes.

Always respond with ONLY valid JSON matching the schema described in the user message.
No markdown, no commentary, no code fences.
Never use em-dashes (—) in any text field. Use hyphens (-) or colons (:) instead.

=== SALES STUDY NOTES ===
${SALES_NOTES}
=== END OF NOTES ===`;

async function askClaude(userPrompt, maxTokens = 1500, model = SONNET) {
  const msg = await anthropic.messages.create({
    model,
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
// Low-effort / not-serious input guard for Sales Call mode.
// Catches obvious trolling and keyboard-mashing so we never spend tokens
// roleplaying against someone who isn't actually practicing. Deliberately
// conservative: terse but real replies ("Yes.", "Tell me more", "Why?")
// must pass; only clear junk is blocked. Mirrored client-side so the
// request is never even sent.
// ---------------------------------------------------------------------

const TROLL_PHRASES = new Set([
  "asdf","asdfasdf","asdfgh","qwerty","qwert","zxcv","zxcvbn","test","testing","test test",
  "lol","lmao","lmfao","haha","hahaha","hehe","xd","idk","idc","blah","blah blah","meh",
  "yo","sup","wassup","poop","fart","penis","boobs","butt","skip","skip this","whatever",
  "hi hi","aaa","bbb","spam","gibberish","random","abc","abcabc","123","12345","hello hello",
]);

function isLowEffortMessage(raw) {
  const text = (raw || "").trim();
  if (text.length < 2) return true;

  const lower = text.toLowerCase();
  const wordChars = lower.replace(/[^a-z]/g, "");

  // Long run of one repeated character: "aaaaa", "!!!!!", "hahahaha".
  if (/(.)\1{4,}/.test(lower)) return true;

  // Curated junk phrases (only when the whole message is the phrase).
  const stripped = lower.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  if (TROLL_PHRASES.has(stripped)) return true;

  // Adjacent keyboard-row mashing.
  if (/(asdf|sdfg|dfgh|qwer|wert|erty|zxcv|xcvb|cvbn|hjkl|jkl;|uiop|poiu)/.test(lower)) return true;

  // No letters at all and short ("123", "...", "!!!", ":)").
  if (wordChars.length === 0 && text.length < 8) return true;

  // Gibberish: a reasonably long alphabetic blob with almost no vowels.
  if (wordChars.length >= 5) {
    const vowels = (wordChars.match(/[aeiou]/g) || []).length;
    if (vowels / wordChars.length < 0.18) return true;
  }

  return false;
}

// Stripe webhook — must be before express.json()
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }
  try {
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const priceId = sub.items?.data?.[0]?.price?.id;
      let tier = "free";
      if (priceId === process.env.STRIPE_PRO_PRICE_ID)   tier = "pro";
      if (priceId === process.env.STRIPE_POWER_PRICE_ID) tier = "power";
      if (db && sub.customer) {
        await db.query(
          "UPDATE users SET tier=$1, stripe_subscription_id=$2 WHERE stripe_customer_id=$3",
          [tier, sub.id, sub.customer]
        );
      }
    }
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      if (db && sub.customer) {
        await db.query(
          "UPDATE users SET tier='free', stripe_subscription_id=NULL WHERE stripe_customer_id=$1",
          [sub.customer]
        );
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

app.use(express.json());

// Explicit page routes (must be before express.static so they take priority)
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "landing.html")));
app.get("/home", (req, res) => res.sendFile(path.join(__dirname, "public", "home.html")));

app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------

app.post("/api/auth/google", async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: "Google auth not configured. Set GOOGLE_CLIENT_ID." });
  if (!db) return res.status(503).json({ error: "Database not configured. Set DATABASE_URL." });

  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: "Missing credential" });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email    = payload.email;
    const name     = payload.name;
    const picture  = payload.picture;
    const userId   = `g_${googleId}`;

    await db.query(
      `INSERT INTO users (id, google_id, email, name, picture, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (google_id) DO UPDATE SET name=$4, picture=$5`,
      [userId, googleId, email, name, picture, Date.now()]
    );

    const token = signToken(userId);
    res.json({ token, user: { id: userId, name, email, picture } });
  } catch (err) {
    console.error("Google auth error:", err.message);
    res.status(401).json({ error: "Failed to verify Google token" });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired token" });

  if (!db) return res.json({ id: payload.sub, name: "User", email: "", picture: "" });

  try {
    const result = await db.query("SELECT id, name, email, picture FROM users WHERE id=$1", [payload.sub]);
    if (!result.rows.length) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Auth me error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// ---------------------------------------------------------------------
// Score routes (authenticated)
// ---------------------------------------------------------------------

app.post("/api/scores", authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const { delta, mode } = req.body;
  if (typeof delta !== "number") return res.status(400).json({ error: "delta must be a number" });

  const today = new Date().toISOString().slice(0, 10);
  try {
    await db.query(
      "INSERT INTO scores (user_id, delta, mode, date, created_at) VALUES ($1,$2,$3,$4,$5)",
      [req.userId, delta, mode || "unknown", today, Date.now()]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Score insert error:", err.message);
    res.status(500).json({ error: "Failed to save score" });
  }
});

app.get("/api/scores/summary", authMiddleware, async (req, res) => {
  if (!db) return res.json({ today: 0, total: 0, rounds: 0 });

  const today = new Date().toISOString().slice(0, 10);
  try {
    const [todayRow, totalRow, roundsRow] = await Promise.all([
      db.query("SELECT COALESCE(SUM(delta),0) AS val FROM scores WHERE user_id=$1 AND date=$2", [req.userId, today]),
      db.query("SELECT COALESCE(SUM(delta),0) AS val FROM scores WHERE user_id=$1", [req.userId]),
      db.query("SELECT COUNT(*) AS val FROM scores WHERE user_id=$1", [req.userId]),
    ]);
    res.json({
      today:  parseInt(todayRow.rows[0].val),
      total:  parseInt(totalRow.rows[0].val),
      rounds: parseInt(roundsRow.rows[0].val),
    });
  } catch (err) {
    console.error("Score summary error:", err.message);
    res.status(500).json({ error: "Failed to fetch scores" });
  }
});

// ---------------------------------------------------------------------
// Rivals / compete — add friends by email and compare progress
// ---------------------------------------------------------------------

async function scoreSummaryForUserId(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const [todayRow, totalRow, roundsRow] = await Promise.all([
    db.query("SELECT COALESCE(SUM(delta),0) AS val FROM scores WHERE user_id=$1 AND date=$2", [userId, today]),
    db.query("SELECT COALESCE(SUM(delta),0) AS val FROM scores WHERE user_id=$1", [userId]),
    db.query("SELECT COUNT(*) AS val FROM scores WHERE user_id=$1", [userId]),
  ]);
  return {
    today:  parseInt(todayRow.rows[0].val),
    total:  parseInt(totalRow.rows[0].val),
    rounds: parseInt(roundsRow.rows[0].val),
  };
}

// Build the leaderboard: the signed-in user plus everyone they've added.
// A rival who has not created an account yet shows up as "pending".
async function buildLeaderboard(userId) {
  const meRow = await db.query("SELECT email, name FROM users WHERE id=$1", [userId]);
  const me = meRow.rows[0] || { email: "", name: "You" };
  const entries = [];

  const mine = await scoreSummaryForUserId(userId);
  entries.push({ email: me.email, name: me.name || "You", ...mine, you: true, pending: false });

  const rivalRows = await db.query("SELECT rival_email FROM rivals WHERE user_id=$1 ORDER BY created_at ASC", [userId]);
  for (const { rival_email } of rivalRows.rows) {
    const u = await db.query("SELECT id, name FROM users WHERE LOWER(email)=LOWER($1)", [rival_email]);
    if (!u.rows.length) {
      entries.push({ email: rival_email, name: rival_email.split("@")[0], today: 0, total: 0, rounds: 0, you: false, pending: true });
      continue;
    }
    const s = await scoreSummaryForUserId(u.rows[0].id);
    entries.push({ email: rival_email, name: u.rows[0].name || rival_email.split("@")[0], ...s, you: false, pending: false });
  }

  entries.sort((a, b) => b.total - a.total);
  return entries;
}

app.get("/api/rivals", authMiddleware, async (req, res) => {
  if (!db) return res.json({ leaderboard: [], dbDisabled: true });
  try {
    res.json({ leaderboard: await buildLeaderboard(req.userId) });
  } catch (err) {
    console.error("rivals list error:", err.message);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

app.post("/api/rivals", authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const email = (req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  try {
    const meRow = await db.query("SELECT email FROM users WHERE id=$1", [req.userId]);
    if (meRow.rows.length && (meRow.rows[0].email || "").toLowerCase() === email) {
      return res.status(400).json({ error: "That's you. Add someone else to compete with." });
    }
    const existing = await db.query("SELECT 1 FROM rivals WHERE user_id=$1 AND rival_email=$2", [req.userId, email]);
    if (existing.rows.length) return res.status(400).json({ error: "You've already added that person." });
    const count = await db.query("SELECT COUNT(*) AS c FROM rivals WHERE user_id=$1", [req.userId]);
    if (parseInt(count.rows[0].c) >= 10) return res.status(400).json({ error: "You can compete with up to 10 people." });
    await db.query("INSERT INTO rivals (user_id, rival_email, created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [req.userId, email, Date.now()]);
    res.json({ leaderboard: await buildLeaderboard(req.userId) });
  } catch (err) {
    console.error("rivals add error:", err.message);
    res.status(500).json({ error: "Failed to add competitor" });
  }
});

app.delete("/api/rivals", authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const email = (req.body.email || "").trim().toLowerCase();
  try {
    await db.query("DELETE FROM rivals WHERE user_id=$1 AND rival_email=$2", [req.userId, email]);
    res.json({ leaderboard: await buildLeaderboard(req.userId) });
  } catch (err) {
    console.error("rivals remove error:", err.message);
    res.status(500).json({ error: "Failed to remove competitor" });
  }
});

// ---------------------------------------------------------------------
// Skill unlock endpoints
// ---------------------------------------------------------------------

app.get("/api/skills/unlocked", authMiddleware, async (req, res) => {
  if (!db) return res.json({ unlockedIds: [...PRE_UNLOCKED] });
  try {
    const result = await db.query(
      "SELECT skill_id FROM unlocked_skills WHERE user_id=$1",
      [req.userId]
    );
    const unlockedIds = [...PRE_UNLOCKED, ...result.rows.map(r => r.skill_id)];
    res.json({ unlockedIds });
  } catch (err) {
    console.error("skills/unlocked error:", err.message);
    res.json({ unlockedIds: [...PRE_UNLOCKED] });
  }
});

app.post("/api/skills/unlock", authMiddleware, async (req, res) => {
  if (!db) return res.json({ ok: true });
  const { skill_ids } = req.body;
  if (!Array.isArray(skill_ids)) return res.status(400).json({ error: "skill_ids must be an array" });
  await autoUnlock(req.userId, skill_ids);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// 1. Objection Battle
// ---------------------------------------------------------------------

const OBJECTION_TYPES = [
  'price / affordability ("it\'s too expensive", "I can\'t afford it", "what\'s the ROI?")',
  'time ("I\'m too busy right now", "maybe next quarter", "bad timing")',
  'partner / spouse ("I need to talk to my partner", "my husband/wife has to be involved")',
  'think about it ("I need to think about it", "let me sleep on it", "I\'ll get back to you")',
  'send me info ("send me some info", "can you send me a proposal?", "email me something")',
  'already tried it ("I tried something like this before and it didn\'t work")',
  'not ready ("I\'m not ready", "I\'m not 100% sure yet", "I need more time")',
  'trust / credibility ("how do I know this will work?", "do you have case studies?")',
  'contract / commitment ("I don\'t do contracts", "I don\'t want to be locked in")',
  'DIY / self-reliant ("I can figure this out myself", "I don\'t need help with this")',
  'competition ("I\'m already working with someone else", "I\'ve seen cheaper options")',
  'hidden identity objection (surface = money/time, real = fear of failure, fear of judgment, impostor syndrome)',
  'authority ("I need board/boss approval first", "this isn\'t just my decision to make")',
  'certainty ("can you guarantee results?", "I need to know for sure before I commit")',
];

const DIFFICULTY_LABELS = {
  1: "easy surface-level objection (price or timing — straightforward to address)",
  2: "medium-complexity objection (trust, partner, or needing to think)",
  3: "hard layered objection (requires deep identity or certainty work, or a hidden belief beneath the surface excuse)",
};

app.post("/api/objection/new", optionalAuth, checkSessionLimit, async (req, res) => {
  if (!requireAI(res)) return;

  const difficulty = Math.ceil(Math.random() * 3);

  if (objectionCache.length >= 20 && Math.random() < 0.70) {
    const cached = pickFromCache(objectionCache, recentlyServedObjections, "objection");
    if (cached) {
      trackRecent(recentlyServedObjections, cached.objection);
      return res.json({ ...cached, difficulty });
    }
  }

  const randomType = OBJECTION_TYPES[Math.floor(Math.random() * OBJECTION_TYPES.length)];

  try {
    const data = await askClaude(
      `Generate ONE realistic sales objection a prospect would say during a high-ticket sales call.

Use this objection type: ${randomType}
Make it a "${DIFFICULTY_LABELS[difficulty]}" objection.
Sound natural and conversational — like a real person on a phone call, not a textbook example.

Respond with ONLY valid JSON:
{
  "objection": "the exact line the prospect says",
  "context": "one sentence describing the situation this came up in"
}`,
      300,
      HAIKU
    );

    const result = { ...data, difficulty };
    objectionCache.push(result);
    saveCache("objection", result, OBJ_CACHE_FILE, objectionCache);
    trackRecent(recentlyServedObjections, data.objection);
    res.json(result);
  } catch (err) {
    console.error("objection/new error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to generate objection." });
  }
});

app.post("/api/objection/feedback", optionalAuth, async (req, res) => {
  if (!requireAI(res)) return;
  const { objection, context, userResponse, timeTakenSeconds, difficulty } = req.body;

  const timeAllowed = difficulty === 1 ? 30 : difficulty === 2 ? 60 : 90;
  const difficultyLabel = difficulty === 1 ? "easy" : difficulty === 2 ? "medium" : "hard";

  try {
    const data = await askClaude(
      `Sales objection training — give feedback on this response.

Prospect's objection: "${objection}"
Context: ${context}
Difficulty: ${difficultyLabel} (${timeAllowed}s allowed, user took ${timeTakenSeconds}s)
User's response: "${userResponse}"

SCORING (0-10):
- Reward understanding of principles shown in the user's own words — don't require exact phrasing
- Conceptually correct response in simple language = 4-6
- Response that explicitly reframes the real belief behind the objection = 7-9
- Generic response that takes the objection at face value = 1-2
- No response or empty = 0
- Calibrate for difficulty: more lenient at level 1, stricter at level 3
- Do NOT include any physical, environmental, or wellness advice

${STYLE_RULES}

${SKILL_ID_PROMPT}

Return ONLY valid JSON:
{
  "whatYouDidWell": ["short bullet under 15 words", "..."],
  "whatYouMissed": ["short bullet under 15 words", "..."],
  "betterAlternative": ["line a skilled closer would say", "follow-up line if needed"],
  "whatIsReallyGoingOn": "the real belief or fear behind this objection, 1 sentence",
  "principle": "the single most relevant principle from the sales notes",
  "score": <integer 0-10>,
  "discovered_skills": ["skill_id1", "skill_id2"]
}`,
      800,
      HAIKU
    );
    if (req.userId && data.discovered_skills) {
      autoUnlock(req.userId, data.discovered_skills);
    }
    res.json(data);
  } catch (err) {
    console.error("objection/feedback error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to analyze response." });
  }
});

// ---------------------------------------------------------------------
// 2. Pattern Recognition
// ---------------------------------------------------------------------

const PATTERN_TYPES = [
  "limiting belief (the prospect believes something false about themselves or their ability)",
  "identity conflict (the offer conflicts with how they currently see themselves)",
  "certainty gap (they want proof or guarantees before they can believe the outcome is possible)",
  "authority / external approval (spouse, partner, boss, or board must approve before they can decide)",
  "hidden objection (surface reason is money or time; real reason is fear of failure or judgment)",
  "limiting language pattern (they use words like 'I'll try', 'maybe', 'I guess', 'I should be able to')",
  "tonal cue (their energy, pace, or enthusiasm reveals something their words don't say)",
  "trust deficit (skeptical not of the offer itself but of you or the process personally)",
  "decision-making pattern (they are analytical, consensus-seeking, or unusually slow to decide)",
  "fear of visibility or judgment (worried what others will think if they invest and it doesn't work)",
  "past failure anchoring (a previous bad experience is shaping their current resistance)",
  "scarcity / loss aversion (reasoning from fear of losing rather than hope of gaining)",
];

app.post("/api/pattern/new", optionalAuth, checkSessionLimit, async (req, res) => {
  if (!requireAI(res)) return;
  const difficulty = parseInt(req.body.difficulty) || 2;

  // Only use cache for level 2 (default difficulty)
  if (difficulty === 2 && patternCache.length >= 20 && Math.random() < 0.70) {
    const cached = pickFromCache(patternCache, recentlyServedPatterns, "statement");
    if (cached) {
      trackRecent(recentlyServedPatterns, cached.statement);
      return res.json({ ...cached, difficulty });
    }
  }

  const randomType = PATTERN_TYPES[Math.floor(Math.random() * PATTERN_TYPES.length)];
  const correctSlot = ["A", "B", "C", "D"][Math.floor(Math.random() * 4)];

  const level1Extra = difficulty === 1 ? `
The prospect statement must be a SINGLE short sentence — direct and conversational.
Randomly decide (independently each time): about 30% of the time, make TWO of the four options defensibly correct (but one is the primary best answer). If you do, set "twoCorrect": true and "secondCorrect" to the letter of the second valid option. Otherwise set "twoCorrect": false and omit "secondCorrect".` : `
The prospect statement can be 1-3 sentences, and should be subtly layered.`;

  try {
    const data = await askClaude(
      `Generate ONE pattern recognition exercise for buyer psychology training.

Pattern type to use: ${randomType}
${level1Extra}

Write a realistic prospect statement that SUBTLY demonstrates this pattern — not obviously. Make the student think. Sound like a real person on a sales call.

Create a 4-option multiple choice question where:
- Option "${correctSlot}" must hold the primary correct answer, grounded in buyer psychology. The other three letters hold plausible-but-wrong options (surface reads, wrong principle, or close-but-not-quite).
- All four options must be nearly identical in length (word count) and tone — count words if you have to. None should be noticeably longer, more detailed, or more jargon-heavy than the others. A test-taker must NOT be able to spot the correct answer just because it sounds more "textbook" or packs in more psychology keywords than the rest.

Return ONLY valid JSON. "correctAnswer" MUST be "${correctSlot}":
{
  "statement": "the prospect's exact line",
  "question": "What is the central issue here?",
  "options": {
    "A": "option text",
    "B": "option text",
    "C": "option text",
    "D": "option text"
  },
  "correctAnswer": "${correctSlot}",
  "twoCorrect": false
}`,
      450,
      HAIKU
    );

    if (difficulty === 2) {
      patternCache.push(data);
      saveCache("pattern", data, PAT_CACHE_FILE, patternCache);
    }
    trackRecent(recentlyServedPatterns, data.statement);
    res.json({ ...data, difficulty });
  } catch (err) {
    console.error("pattern/new error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to generate exercise." });
  }
});

app.post("/api/pattern/feedback", optionalAuth, async (req, res) => {
  if (!requireAI(res)) return;
  const { statement, question, options, correctAnswer, userAnswer, twoCorrect, secondCorrect } = req.body;
  const pickedBest   = userAnswer === correctAnswer;
  const pickedSecond = twoCorrect && secondCorrect && userAnswer === secondCorrect;
  const isCorrect    = pickedBest || pickedSecond;
  const score        = pickedBest ? 5 : pickedSecond ? 3 : -3;
  const twoCorrectNote = pickedSecond
    ? "Two valid answers this round. Yours also works, but the primary answer is the stronger read."
    : null;

  try {
    const data = await askClaude(
      `Pattern recognition feedback.
Prospect said: "${statement}"
Best answer: ${correctAnswer} - "${options[correctAnswer]}"${twoCorrect && secondCorrect ? `\nAlso valid: ${secondCorrect} - "${options[secondCorrect]}"` : ""}
User chose: ${userAnswer} - "${options[userAnswer]}"

${STYLE_RULES}

Each item in "howToHandleIt" must end with a specific action the salesperson should take, phrased as "...so you should [concrete action]."

${SKILL_ID_PROMPT}

Return ONLY valid JSON:
{
  "correct": ${isCorrect},
  "explanation": "why ${correctAnswer} is the best answer, 1 sentence, plain English",
  "howItAffectsBuying": "how this pattern affects the buying decision, 1 sentence",
  "howToHandleIt": ["insight about the pattern, so you should [take specific action]", "second step if needed, so you should [action]"],
  "principle": "the single most relevant principle from the sales notes",
  "score": ${score},
  "discovered_skills": ["skill_id1"]
}`,
      600,
      HAIKU
    );
    if (req.userId && data.discovered_skills) {
      autoUnlock(req.userId, data.discovered_skills);
    }
    res.json({ ...data, score, correct: isCorrect, ...(twoCorrectNote ? { twoCorrectNote } : {}) });
  } catch (err) {
    console.error("pattern/feedback error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to analyze answer." });
  }
});

// ---------------------------------------------------------------------
// 3. Sales Call Mode
// ---------------------------------------------------------------------

app.post("/api/call/start", optionalAuth, checkSessionLimit, async (req, res) => {
  if (!requireAI(res)) return;
  const { scenario, customDescription, section, personality, prospectName } = req.body;

  const sectionContext = section
    ? `The roleplay focuses on the "${section}" phase of the One Call Close. If the section is not "Opening", the prospect's opening message should reflect that the call is already mid-flow (rapport has been built, earlier phases are done).`
    : "";

  const personalityContext = personality && personality.label
    ? `The prospect's personality is "${personality.label}": ${personality.behavior || ""} Shape their goal, openness, opening line and especially their buyingReadiness around this personality.`
    : "";

  const nameInstruction = prospectName
    ? `Use exactly "${prospectName}" as the prospect's name.`
    : `Give the prospect a realistic first name.`;

  try {
    const data = await askClaude(
      `Generate a prospect profile for a sales call roleplay simulation.
Scenario: ${scenario}${customDescription ? ` — ${customDescription}` : ""}
${sectionContext}
${personalityContext}
${nameInstruction}

The "limitingBeliefs" array is a small BANK of 3-5 distinct objections / limiting beliefs this specific
prospect holds (surface excuses AND deeper fears), ordered from the one most likely to come up first to last.
These are what the prospect will work through during the call. Keep each to one short sentence in the
prospect's own voice.

Return JSON:
{
  "name": "${prospectName || "first name"}",
  "age": <number>,
  "goal": "their main goal",
  "currentSituation": "their current situation",
  "problem": "their core problem",
  "hiddenBelief": "the single deepest limiting belief they would never say out loud",
  "limitingBeliefs": ["short belief/objection 1", "2", "3"],
  "buyingReadiness": "Low" | "Medium" | "High",
  "openingMessage": "the prospect's opening line — if practicing a mid-call section, they should respond as if earlier phases already happened"
}`,
      700,
      SONNET
    );
    if (prospectName) data.name = prospectName;
    res.json(data);
  } catch (err) {
    console.error("call/start error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to start call." });
  }
});

app.post("/api/call/message", async (req, res) => {
  if (!requireAI(res)) return;
  const { scenario, prospect, history, userMessage, section, personality } = req.body;

  // Token-free guard: never spend tokens on trolling / keyboard-mashing.
  if (isLowEffortMessage(userMessage)) {
    return res.json({
      blocked: true,
      reason: "That doesn't read like something you'd actually say on a live call. Type a real line and the prospect will respond.",
    });
  }

  try {
    const historyText = (history || [])
      .map((m) => `${m.role === "user" ? "Salesperson" : "Prospect"}: ${m.content}`)
      .join("\n");

    const sectionInstruction = section
      ? `\nThis roleplay starts at the "${section}" phase of the One Call Close. Behave as if earlier phases already happened. Your reactions, objections, and openness should be calibrated for where you are at this stage.`
      : "";

    const personalityInstruction = personality && personality.label
      ? `\nYour personality: ${personality.label} - ${personality.behavior || ""}`
      : "";

    const beliefBank = Array.isArray(prospect.limitingBeliefs) && prospect.limitingBeliefs.length
      ? prospect.limitingBeliefs.map((b, i) => `${i + 1}. ${b}`).join("\n")
      : "(none specified — improvise realistic ones from your hidden belief)";

    const msg = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 300,
      system: `You are roleplaying as a sales prospect named ${prospect.name} in a "${scenario}" sales call simulation.
${sectionInstruction}${personalityInstruction}

Profile:
- Age: ${prospect.age}
- Goal: ${prospect.goal}
- Current situation: ${prospect.currentSituation}
- Problem: ${prospect.problem}
- Hidden belief (never say this explicitly, but let it leak through your resistance/objections): ${prospect.hiddenBelief}
- Buying readiness: ${prospect.buyingReadiness}

Your limiting beliefs / objections bank (work through these like a real person):
${beliefBank}

MEMORY AND PROGRESSION (act like a conscious, real human, not a loop):
- Remember everything the salesperson has already said in this conversation. Track which of your beliefs
  and objections they have already addressed.
- When the salesperson genuinely handles or reframes one of your beliefs convincingly, accept it, drop it,
  and MOVE ON to the next thing on your mind. Do not raise a belief again once it has been broken.
- Never repeat an objection or point you've already made. Never restate the same concern in new words.
- If they have handled most of your beliefs well, soften and move toward a decision like a real person would.
- If they handle something poorly or dodge it, stay on it - don't let them off the hook.

STYLE:
- Be straightforward and concise. Say what a real busy human would say, no filler, no monologuing,
  no repeating yourself. 1-3 sentences unless your personality is explicitly talkative.
- React realistically based on how well they apply Authority, Tonality, Identity, Certainty,
  Objection Handling and Closing principles.
- Stay completely in character. Never mention you are an AI. Never use em-dashes (-). Use plain punctuation.`,
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
    console.error("call/message error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to get prospect reply." });
  }
});

app.post("/api/call/end", optionalAuth, async (req, res) => {
  if (!requireAI(res)) return;
  const { scenario, prospect, history, section } = req.body;
  try {
    const turns = history || [];
    const historyText = turns
      .map((m) => `${m.role === "user" ? "Salesperson" : "Prospect"}: ${m.content}`)
      .join("\n");

    // The salesperson's own lines, numbered, so highlights can map back to chat bubbles.
    const userLines = turns.filter((m) => m.role === "user");
    const numberedUserLines = userLines
      .map((m, i) => `[#${i}] Salesperson: ${m.content}`)
      .join("\n");

    const sectionFocus = section
      ? `\nThis session focused on the "${section}" phase. Weight your feedback heavily on skills specific to that phase.`
      : "";

    // 1) HAIKU — fast per-message highlights to paint directly onto the chat.
    const highlightsPromise = askClaude(
      `A sales call roleplay just ended. Below are ONLY the salesperson's own lines, each tagged [#index].
Pick the lines that most matter for learning and tag each one. Highlight the genuinely strong moves AND
the clear mistakes / missed reads. Do not tag every line - choose the 4 to 8 most instructive ones.

Verdicts:
- "good"    = a strong, skillful move (mark these green)
- "improve" = workable but a better option existed
- "bad"     = a clear mistake or missed read (mark these red)

Salesperson lines:
${numberedUserLines}

${STYLE_RULES}

Return ONLY valid JSON. Each note is the lesson for that exact line, under 14 words, action-focused:
{
  "highlights": [
    { "index": <integer matching [#index]>, "verdict": "good" | "improve" | "bad", "note": "what to think about, under 14 words" }
  ]
}`,
      900,
      HAIKU
    );

    // 2) SONNET — the deeper learning summary that lives under the chat.
    const summaryPromise = askClaude(
      `A sales call roleplay simulation just ended.
Scenario: ${scenario}
${sectionFocus}
Prospect profile: ${JSON.stringify(prospect)}

Full transcript:
${historyText}

${STYLE_RULES}

${SKILL_ID_PROMPT}

Analyze the salesperson's performance, grounded in the sales study notes. The goal is that they LEARN ONE
thing they will remember and apply on the next call. Be specific to what actually happened in this transcript.
Return JSON:
{
  "callScore": <integer 0-100>,
  "headline": "one-line verdict of how the call went",
  "rememberThis": "the single most important lesson from THIS call, one memorable sentence",
  "thinkAboutNextTime": ["forward-looking bullet, a concrete thing to do differently next call", "..."],
  "whatYouDidWell": ["short bullet under 15 words", "..."],
  "principle": { "name": "principle name from notes", "note": "one sentence on how it applied here" },
  "scoreDelta": <integer between -15 and 15, roughly (callScore-50)/4 rounded>,
  "discovered_skills": ["skill_id1", "skill_id2", "skill_id3"]
}`,
      1600,
      SONNET
    );

    const [highlightsData, summary] = await Promise.all([
      highlightsPromise.catch(() => ({ highlights: [] })),
      summaryPromise,
    ]);

    // Attach the salesperson's quote to each highlight so the client can match
    // by text if indices ever drift.
    const highlights = (highlightsData.highlights || [])
      .filter((h) => h && typeof h.index === "number" && userLines[h.index])
      .map((h) => ({
        index: h.index,
        verdict: ["good", "improve", "bad"].includes(h.verdict) ? h.verdict : "improve",
        note: h.note || "",
        quote: userLines[h.index].content,
      }));

    if (req.userId && summary.discovered_skills) {
      autoUnlock(req.userId, summary.discovered_skills);
    }
    res.json({ ...summary, highlights });
  } catch (err) {
    console.error("call/end error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to generate feedback report." });
  }
});

// ---------------------------------------------------------------------
// User status + Stripe checkout
// ---------------------------------------------------------------------

app.get("/api/user/status", authMiddleware, async (req, res) => {
  if (!db) return res.json({ tier: "free", sessionsUsed: 0, sessionsLimit: 5 });
  try {
    const row = await db.query("SELECT email, tier FROM users WHERE id=$1", [req.userId]);
    if (!row.rows.length) return res.status(404).json({ error: "User not found" });
    const { email, tier } = row.rows[0];
    const isAdmin = ADMIN_EMAILS.includes(email);
    const effectiveTier  = isAdmin ? "power" : (tier || "free");
    const limit = isAdmin ? null : (TIER_LIMITS[effectiveTier] === Infinity ? null : TIER_LIMITS[effectiveTier]);
    res.json({ tier: effectiveTier, sessionsUsed: await getMonthlySessionCount(req.userId), sessionsLimit: limit, email });
  } catch (err) {
    console.error("user/status error:", err.message);
    res.status(500).json({ error: "Failed to fetch user status" });
  }
});

app.post("/api/stripe/create-checkout", authMiddleware, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured. Add STRIPE_SECRET_KEY to .env" });
  if (!db)     return res.status(503).json({ error: "Database not configured" });
  const { tier } = req.body;
  const priceId = tier === "pro" ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_POWER_PRICE_ID;
  if (!priceId) return res.status(400).json({ error: `Price ID for '${tier}' not set. Add STRIPE_PRO_PRICE_ID or STRIPE_POWER_PRICE_ID to .env` });
  try {
    const row = await db.query("SELECT email, stripe_customer_id FROM users WHERE id=$1", [req.userId]);
    if (!row.rows.length) return res.status(404).json({ error: "User not found" });
    const { email, stripe_customer_id } = row.rows[0];
    let customerId = stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;
      await db.query("UPDATE users SET stripe_customer_id=$1 WHERE id=$2", [customerId, req.userId]);
    }
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/home?upgraded=1`,
      cancel_url:  `${appUrl}/home`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("create-checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ---------------------------------------------------------------------
// Health + config info
// ---------------------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    aiConfigured: !!anthropic,
    authConfigured: !!(googleClient && db),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    model: SONNET,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sales Camp Games running at http://localhost:${PORT}`);
    if (!anthropic) console.warn("WARNING: ANTHROPIC_API_KEY not set — AI features disabled.");
    if (!db)         console.warn("WARNING: DATABASE_URL not set — user scores use localStorage only.");
    if (!googleClient) console.warn("WARNING: GOOGLE_CLIENT_ID not set — Google login disabled.");
  });
}

module.exports = app;
