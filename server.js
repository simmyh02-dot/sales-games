require("dotenv").config();

// ---------------------------------------------------------------------
// Error reporting. This block runs before express and pg are required,
// because the SDK instruments those modules as they load. Without a
// SENTRY_DSN nothing initialises and every call below is a no-op, so local
// dev and the tests are unaffected.
//
// captureConsoleIntegration is doing most of the work: every route in this
// file catches its own errors and console.error()s them, so those never
// reach the express error handler. Promoting error-level console output to
// Sentry events is what actually gets those in front of us.
// ---------------------------------------------------------------------
const Sentry = require("@sentry/node");
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    // Errors only. Tracing would sample every AI call, and those are long.
    tracesSampleRate: 0,
    // Transcripts are the whole product and they are personal. Never let the
    // SDK attach request bodies, headers or IPs on its own.
    sendDefaultPii: false,
    maxValueLength: 2000,
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
  });
  console.log("Sentry error reporting enabled.");
}

const express = require("express");
const helmet = require("helmet");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
// pdfkit loads standard-font metrics lazily through a wildcard subpath import
// (`#standard-fonts/*`). Vercel traces the bundle statically and cannot follow
// a wildcard, so those files were dropped from the deployed function and the
// first .font("Helvetica") call threw — PDFs built fine locally and failed in
// production. Requiring the three faces we actually use puts them back in the
// trace. The values are deliberately unused; the require is the whole point.
require("pdfkit/standard-fonts/Helvetica");
require("pdfkit/standard-fonts/HelveticaBold");
require("pdfkit/standard-fonts/HelveticaOblique");
const Anthropic = require("@anthropic-ai/sdk");
const { OAuth2Client } = require("google-auth-library");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try { stripe = require("stripe")(process.env.STRIPE_SECRET_KEY); } catch (e) { console.warn("Stripe load failed:", e.message); }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Behind Vercel's proxy, so the client IP lives in x-forwarded-for. Without
// this every request looks like one address and rate limiting is meaningless.
app.set("trust proxy", 1);

// Vercel freezes the function the moment a response ends, so a queued Sentry
// event can sit unsent until the next invocation — or be lost with the
// instance. Flushing on finish costs the client nothing: the response has
// already gone out by the time this runs.
if (process.env.SENTRY_DSN) {
  app.use((req, res, next) => {
    res.on("finish", () => { Sentry.flush(2000).catch(() => {}); });
    next();
  });
}

// ---------------------------------------------------------------------
// Fail fast on missing production config. A missing JWT_SECRET used to fall
// back to a public literal, which silently made every session forgeable —
// a loud crash on boot is strictly better than that.
// ---------------------------------------------------------------------

if (process.env.NODE_ENV === "production") {
  const missing = ["JWT_SECRET", "DATABASE_URL"].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Refusing to start: missing required env var(s): ${missing.join(", ")}`);
  }
}

// ---------------------------------------------------------------------
// Rate limiting. NOTE: the default store is in-memory, so on Vercel each
// serverless instance counts separately and the window resets on a cold
// start. That still stops a single client hammering one instance; a hard
// global cap needs a shared store (Upstash/Redis) — see the roadmap.
// ---------------------------------------------------------------------

// Key on the account when the caller presents a usable token, so two people
// behind one office NAT get their own budgets. Falls back to IP for anything
// unauthenticated — which is also what an attacker without a token gets.
// The limiter runs BEFORE authMiddleware on purpose: junk should be turned
// away before it reaches anything that costs money.
function aiRateKey(req) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.sub) return `u:${payload.sub}`;
  }
  return `ip:${rateLimit.ipKeyGenerator(req.ip)}`;
}

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,                       // a fast conversational pace is ~10-15/min
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: aiRateKey,
  message: { error: "rate_limited", detail: "Slow down a moment — too many requests." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "rate_limited", detail: "Too many sign-in attempts. Try again shortly." },
});

// ---------------------------------------------------------------------
// Security headers.
//
// The CSP ships in Report-Only and only enforces when CSP_ENFORCE is set.
// A wrong policy breaks Google sign-in, which is the only door into the
// product and therefore all of the revenue — so it listens first, the
// reports land in Sentry, and enforcement is a deliberate flip once they
// have gone quiet. See the roadmap for the switch-over.
// ---------------------------------------------------------------------

const GSI = "https://accounts.google.com";
const CSP_ENFORCE = !!process.env.CSP_ENFORCE;

// A fresh nonce per request for the two pages carrying inline code: the
// landing page's bootstrap script and the skill tree's inline stylesheet.
// renderPage swaps it into {{NONCE}}.
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
});

const nonce = (req, res) => `'nonce-${res.locals.cspNonce}'`;

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    reportOnly: !CSP_ENFORCE,
    directives: {
      "default-src": ["'self'"],
      // d3 backs the skill tree; GSI is the sign-in widget.
      "script-src": ["'self'", nonce, GSI, "https://d3js.org"],
      // The pricing and Settings buttons still use onclick attributes, which
      // no nonce can cover. script-src-attr is scoped to event-handler
      // attributes alone, so the exposure stops there — rewriting those as
      // listeners is what removes it.
      "script-src-attr": ["'unsafe-inline'"],
      // Styles get 'unsafe-inline' and no nonce, which is a deliberate
      // downgrade from the original plan. The GSI library injects a ~10 KB
      // <style> element of its own at runtime and does not carry our nonce
      // onto it, and CSP *ignores* 'unsafe-inline' the moment a nonce is
      // present — so a nonce here means the sign-in widget renders unstyled.
      // The alternative is pinning a sha256 of Google's stylesheet, which
      // silently rots the next time they change a byte. The incremental risk
      // is small: style-src-attr below already has to allow inline styles,
      // because the client code sets style="" everywhere.
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", GSI],
      "style-src-attr": ["'unsafe-inline'"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      // Google profile pictures come from lh3.googleusercontent.com; blob:
      // is the PDF download.
      "img-src": ["'self'", "data:", "blob:", "https://*.googleusercontent.com"],
      "connect-src": ["'self'", GSI],
      "frame-src": [GSI],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
      "report-uri": ["/api/csp-report"],
    },
  },
  // Vercel's edge already sends Strict-Transport-Security with preload.
  // Two of the same header is worse than one.
  hsts: false,
  // Helmet defaults to no-referrer. This header is *enforced*, not
  // report-only, and a stripped Referer is a documented way to upset the
  // Google sign-in flow — not a thing to discover in production. The modern
  // browser default sends the origin cross-origin and never the path, which
  // is the privacy that actually mattered. (The avatar <img>s keep their own
  // referrerpolicy="no-referrer": that one is deliberate.)
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // The GSI popup needs to reach its opener.
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  // Nothing here is cross-origin isolated and COEP breaks the Google widget.
  crossOriginEmbedderPolicy: false,
  // Avatars and the d3 bundle are cross-origin loads.
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Violation sink. Every route in this file console.errors its failures and
// Sentry's captureConsole integration promotes those, so a report here
// becomes a Sentry issue without any extra wiring. Deduped per process on
// directive + blocked URI: one bad asset would otherwise fire a report on
// every page view by every visitor.
const cspReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const seenCspViolations = new Set();

app.post(
  "/api/csp-report",
  cspReportLimiter,
  express.json({
    type: ["application/csp-report", "application/reports+json", "application/json"],
    limit: "16kb",
  }),
  (req, res) => {
    res.status(204).end();
    const report = (req.body && (req.body["csp-report"] || req.body)) || {};
    const directive = report["effective-directive"] || report["violated-directive"] || "unknown";
    const blocked   = String(report["blocked-uri"] || "unknown").slice(0, 200);
    const key = `${directive}|${blocked}`;
    if (seenCspViolations.has(key)) return;
    if (seenCspViolations.size > 200) seenCspViolations.clear();
    seenCspViolations.add(key);
    console.error(
      `CSP ${CSP_ENFORCE ? "violation" : "report-only"}: ${directive} blocked ${blocked} ` +
      `on ${String(report["document-uri"] || "?").slice(0, 200)}`
    );
  }
);

const HAIKU  = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";

const SALES_NOTES = fs.readFileSync(
  path.join(__dirname, "knowledge", "sales_notes.md"),
  "utf-8"
);

// The Setter Call Framework — the trainee's playbook for Setter mode. Read from
// disk at boot so edits to the markdown flow straight into grading without a
// code change. It is NEVER shown to the AI prospect: it only grounds the
// end-of-call analysis. Missing file degrades to the stage list alone.
let SETTER_FRAMEWORK = "";
try {
  SETTER_FRAMEWORK = fs.readFileSync(
    path.join(__dirname, "setter_call_framework.md"),
    "utf-8"
  );
} catch {
  console.warn("WARNING: setter_call_framework.md not found — setter grading falls back to the stage list.");
}

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
// ---------------------------------------------------------------------
// Schema. The DDL used to live inline here and ran in full on every cold
// start, which meant no record of what had been applied, no way to make a
// change that isn't idempotent, and errors swallowed by a bare .catch().
// It now lives in migrations/, numbered, applied once and recorded.
//
// A failed migration logs at error level (so Sentry sees it) and the app
// keeps serving. That is deliberate: running on a slightly stale schema is
// bad, but a solo product that refuses to boot because of a migration is
// worse. The alert is the point.
// ---------------------------------------------------------------------

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Serverless means several instances can cold-start at once and all reach
// for the same migration. The advisory lock makes them queue; whoever gets
// there second finds the work already recorded and does nothing.
const MIGRATION_LOCK_ID = 4113077;

async function runMigrations(pool) {
  let files;
  try {
    files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    console.error("Migrations directory missing — schema not verified.");
    return;
  }
  if (!files.length) return;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at BIGINT
      );
    `);
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    try {
      const done = new Set(
        (await client.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version)
      );
      const pending = files.filter((f) => !done.has(f));
      if (!pending.length) return;

      for (const file of pending) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
        // One transaction per migration: a file that fails part way leaves
        // nothing behind and stays unrecorded, so the next boot retries it.
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)",
            [file, Date.now()]
          );
          await client.query("COMMIT");
          console.log("Migration applied:", file);
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw new Error(`migration ${file} failed: ${e.message}`);
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

if (process.env.DATABASE_URL) {
  db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  // Not awaited: boot must not block on it, and every query path already
  // handles a database that isn't answering.
  runMigrations(db).catch((e) => console.error("Migration error:", e));
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
  // Ties any error raised while serving this request to an account id, so a
  // report is actionable ("this user, this call") without carrying an email
  // or a transcript into Sentry. No-op when SENTRY_DSN is unset.
  Sentry.setUser({ id: payload.sub });
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

// (optionalAuth was removed: every /api route now requires a real session.
// It let signed-out callers through with req.userId undefined, which silently
// skipped the session limit and the lesson/history/unlock writes.)

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

// Points for a completed sales call: a base award (50 closer / 10 setter)
// scaled linearly by the 0-10 call rating, so a great call pays out near the
// base and a poor one pays out little. Outcome bonuses (close / set) are
// added by the caller so they only land on a real success.
function pointsForCall(base, rating) {
  const r = Math.max(0, Math.min(10, Number(rating) || 0));
  return Math.round(base * r / 10);
}
function clampRating(v) { return Math.max(0, Math.min(10, Math.round(Number(v) || 0))); }

// The conversation history is supplied by the client and goes straight into a
// prompt, so it is the one input that can inflate token spend without limit.
// Cap it: keep the most recent turns, and cap each line's length. A real call
// never approaches these numbers — they only bite on abuse or a runaway client.
const MAX_HISTORY_TURNS = 60;
const MAX_TURN_CHARS    = 2000;

function capHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_TURNS)
    .filter((m) => m && typeof m.content === "string")
    .map((m) => ({
      role:    m.role === "user" ? "user" : "assistant",
      content: m.content.slice(0, MAX_TURN_CHARS),
    }));
}

// Persist a call's key takeaway as a Lesson (Sales Call modes only).
// Reuses the /end analysis output that used to be shown once and discarded.
async function saveLesson(userId, { content, headline, source, persona, callScore, language }) {
  if (!db || !userId || !content) return;
  await db.query(
    `INSERT INTO lessons (user_id, content, headline, source, persona, call_score, language, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, content, headline || null, source || null, persona || null,
     Number.isFinite(callScore) ? callScore : null, language || null, Date.now()]
  ).catch(e => console.error("saveLesson error:", e.message));
}

// Persist a compact record of a call so the Skill Tree can "remember" it.
// The transcript is capped and the skill list is short on purpose: this
// memory only exists to fill out the tree, it is never fed back to the AI.
async function saveCallHistory(userId, { mode, label, persona, section, outcome, skills, transcript, reviewed }) {
  if (!db || !userId) return;
  const skillsJson = JSON.stringify(Array.isArray(skills) ? skills.slice(0, 12) : []);
  const compact = typeof transcript === "string" ? transcript.slice(0, 4000) : null;
  await db.query(
    `INSERT INTO call_history (user_id, mode, label, persona, section, outcome, skills, transcript, reviewed, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [userId, mode || null, label || null, persona || null, section || null,
     outcome || null, skillsJson, compact, !!reviewed, Date.now()]
  ).catch(e => console.error("saveCallHistory error:", e.message));
}

// Minimal, cheap skill-tagging for calls ended WITHOUT a full review. One
// small Haiku pass that returns only the skill IDs the trainee touched, so
// the tree still fills out without spending tokens on a debrief.
async function discoverSkillsFromTranscript(historyText, roleLabel) {
  if (!anthropic) return [];
  try {
    const data = await askClaude(
      `A ${roleLabel} sales-call roleplay was ended early with NO review requested.
From the transcript, list ONLY the skill IDs the ${roleLabel} actually attempted or touched (even imperfectly).
Be honest, not generous padding: usually 2 to 6 ids. No prose, no scoring.

Transcript:
${historyText}

${SKILL_ID_PROMPT}

Return ONLY valid JSON: { "discovered_skills": ["id1", "id2"] }`,
      280,
      HAIKU
    );
    return Array.isArray(data.discovered_skills) ? data.discovered_skills : [];
  } catch (e) {
    console.error("discoverSkillsFromTranscript error:", e.message);
    return [];
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

// The other half of the funnel. `scores` only gets a row when a rep is
// GRADED, so an abandoned call was invisible and "how many people who start
// a first call reach the debrief" had no denominator. Fire-and-forget on
// purpose: a failure to record a metric must never cost anyone a session.
function recordSessionStart(userId, mode) {
  if (!db || !userId) return;
  db.query(
    "INSERT INTO session_starts (user_id, mode, created_at) VALUES ($1, $2, $3)",
    [userId, mode, Date.now()]
  ).catch((e) => console.error("recordSessionStart error:", e.message));
}

// Runs after authMiddleware, so req.userId is always set here. (It used to sit
// behind optionalAuth, which meant a signed-out caller skipped the limit
// entirely — the whole product was free to anyone bypassing the browser.)
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
  } catch (e) {
    // Fail OPEN on purpose: a database blip shouldn't lock a paying user out
    // of training. But it must be visible — this used to swallow silently.
    console.error("checkSessionLimit error (allowing through):", e.message);
    next();
  }
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

// Codes the client can request (mirror of LANGS in public/js/lang.js).
// The value is the English name of the language, used in the prompt.
const AI_LANGUAGES = {
  en: "English", sv: "Swedish", es: "Spanish", de: "German", fr: "French",
  no: "Norwegian", da: "Danish", fi: "Finnish", it: "Italian",
  nl: "Dutch", pt: "Portuguese",
};

// One instruction that flips ALL user-facing output into the chosen language.
// The study notes stay English (the model translates concepts fine); only the
// visible text the trainee reads/hears changes. JSON keys and skill_id values
// MUST stay English or the client can't parse them. Empty for English.
function langRule(language) {
  const name = AI_LANGUAGES[language];
  if (!name || language === "en") return "";
  return `

LANGUAGE (overrides the English style rule above): Write EVERY user-facing text
value in ${name} — all feedback, explanations, headlines, bullets, principle
notes, and the prospect's/lead's spoken lines. Translate the sales principle
names naturally into ${name}. Keep all JSON keys, enum values, and skill_id
strings exactly as specified (in English). Do not mix languages in the prose.`;
}

const BASE_SYSTEM = `You are the AI engine behind "Sales Camp AI", a sales training app.
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

async function askClaude(userPrompt, maxTokens = 1500, model = SONNET, language = "en") {
  const msg = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: BASE_SYSTEM + langRule(language),
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

      // A subscription can exist without being paid for. Stripe retries a failed
      // charge for weeks, so "past_due" keeps access — pulling the plan out from
      // under someone whose card just expired is the wrong call. Anything past the
      // retry window ("unpaid", "canceled", "incomplete_expired") drops to free.
      const KEEPS_ACCESS = ["active", "trialing", "past_due"];
      if (!KEEPS_ACCESS.includes(sub.status)) tier = "free";
      const paymentStatus = sub.status === "past_due" ? "past_due" : null;

      if (db && sub.customer) {
        await db.query(
          "UPDATE users SET tier=$1, stripe_subscription_id=$2, payment_status=$3 WHERE stripe_customer_id=$4",
          [tier, sub.id, paymentStatus, sub.customer]
        );
      }
    }
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      if (db && sub.customer) {
        await db.query(
          "UPDATE users SET tier='free', stripe_subscription_id=NULL, payment_status=NULL WHERE stripe_customer_id=$1",
          [sub.customer]
        );
      }
    }
    // Flag the account so Settings can say "your last payment failed" instead of
    // the subscription silently lapsing weeks later with no warning at all.
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      if (db && invoice.customer) {
        await db.query(
          "UPDATE users SET payment_status='past_due' WHERE stripe_customer_id=$1",
          [invoice.customer]
        );
      }
      console.warn("Stripe payment failed for customer", invoice.customer);
    }
    if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
      const invoice = event.data.object;
      if (db && invoice.customer) {
        await db.query(
          "UPDATE users SET payment_status=NULL WHERE stripe_customer_id=$1",
          [invoice.customer]
        );
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

app.use(express.json({ limit: "1mb" }));

// ---------------------------------------------------------------------
// Page delivery. Pages are rendered rather than sendFile'd, because the
// canonical link and the Open Graph tags have to carry an absolute URL and
// this app answers on three origins: localhost, the Vercel preview URL and
// the real domain. Each page writes {{ORIGIN}} and gets the right one here.
// File contents are cached; only the substitution runs per request.
// ---------------------------------------------------------------------

const PUBLIC_DIR = path.join(__dirname, "public");
const pageCache  = new Map();

function siteOrigin(req) {
  const configured = (process.env.APP_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function renderPage(req, res, file) {
  let html = pageCache.get(file);
  if (html === undefined) {
    try { html = fs.readFileSync(file, "utf8"); }
    catch { return res.status(404).send("Not found"); }
    pageCache.set(file, html);
  }
  // The cache holds the file with its placeholders intact; substitution is
  // per request, which matters for the nonce — it must never be reused.
  res.type("html").send(
    html
      .split("{{ORIGIN}}").join(siteOrigin(req))
      .split("{{NONCE}}").join(res.locals.cspNonce || "")
  );
}

const page = (...segments) => (req, res) => renderPage(req, res, path.join(PUBLIC_DIR, ...segments));

// Explicit page routes (must be before express.static so they take priority)
app.get("/", page("landing.html"));
app.get("/home", page("home.html"));
app.get("/settings", page("settings.html"));
app.get("/lessons", page("pages", "lessons.html"));

app.get("/previous-calls", page("pages", "previous-calls.html"));

// The funnel numbers. Serving the page to anyone is fine — it is a shell with
// no data in it, and /api/admin/funnel is what actually checks who is asking.
app.get("/admin", page("pages", "admin.html"));

// Legal. Linked from the landing footer and required by Stripe and the GDPR.
for (const slug of ["terms", "privacy", "refunds", "contact"]) {
  app.get(`/${slug}`, page("pages", `${slug}.html`));
}

// The in-app links point at /pages/*.html directly, and express.static would
// hand those over verbatim — placeholder and all. Route every remaining .html
// through the same renderer so no page can reach a browser unsubstituted.
app.get(/\.html$/, (req, res, next) => {
  let rel;
  try { rel = path.normalize(decodeURIComponent(req.path)).replace(/^[\\/]+/, ""); }
  catch { return next(); }
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file)) return next();
  renderPage(req, res, file);
});

// robots.txt and the sitemap are generated rather than static, for the same
// reason as the canonical tags: the Sitemap directive and every <loc> must be
// absolute, and the origin isn't known until a request arrives. Everything
// behind the auth gate is excluded — it renders a sign-in shell to a crawler.
const PUBLIC_ROUTES = ["/", "/terms", "/privacy", "/refunds", "/contact"];

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    [
      "User-agent: *",
      "Disallow: /api/",
      "Disallow: /pages/",
      "Disallow: /home",
      "Disallow: /settings",
      "Disallow: /lessons",
      "Disallow: /previous-calls",
      "Disallow: /admin",
      "Disallow: /index.html",
      "",
      `Sitemap: ${siteOrigin(req)}/sitemap.xml`,
      "",
    ].join("\n")
  );
});

app.get("/sitemap.xml", (req, res) => {
  const origin = siteOrigin(req);
  const urls = PUBLIC_ROUTES.map(
    (route) => `  <url><loc>${origin}${route}</loc></url>`
  ).join("\n");
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
});

app.use(express.static(PUBLIC_DIR));

// ---------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------

app.post("/api/auth/google", authLimiter, async (req, res) => {
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
    const result = await db.query("SELECT id, name, email, picture, language FROM users WHERE id=$1", [payload.sub]);
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

app.post("/api/objection/new", aiLimiter, authMiddleware, checkSessionLimit, async (req, res) => {
  if (!requireAI(res)) return;
  recordSessionStart(req.userId, "objection-battle");

  // Honour a chosen difficulty from the pre-start screen; fall back to random.
  const requestedDiff = parseInt(req.body && req.body.difficulty, 10);
  const difficulty = [1, 2, 3].includes(requestedDiff) ? requestedDiff : Math.ceil(Math.random() * 3);

  // The shared cache holds English items only; non-English users always
  // generate fresh so they never get served an English line (Phase 1.3).
  const language = req.body && req.body.language;
  const isEn = !language || language === "en";

  if (isEn && objectionCache.length >= 20 && Math.random() < 0.70) {
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
      HAIKU,
      language
    );

    const result = { ...data, difficulty };
    if (isEn) {
      objectionCache.push(result);
      saveCache("objection", result, OBJ_CACHE_FILE, objectionCache);
    }
    trackRecent(recentlyServedObjections, data.objection);
    res.json(result);
  } catch (err) {
    console.error("objection/new error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to generate objection." });
  }
});

app.post("/api/objection/feedback", aiLimiter, authMiddleware, async (req, res) => {
  if (!requireAI(res)) return;
  const { objection, context, userResponse, timeTakenSeconds, difficulty, language } = req.body;

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
      HAIKU,
      language
    );
    if (req.userId && data.discovered_skills) {
      autoUnlock(req.userId, data.discovered_skills);
    }
    // Objection Battle: your 0-10 grade IS your points.
    const oScore = Math.max(0, Math.min(10, Math.round(Number(data.score) || 0)));
    data.pointsAwarded  = oScore;
    data.pointsBreakdown = oScore > 0 ? `Answer graded ${oScore}/10 → +${oScore} pts` : `No clear response → +0 pts`;
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

app.post("/api/pattern/new", aiLimiter, authMiddleware, checkSessionLimit, async (req, res) => {
  if (!requireAI(res)) return;
  recordSessionStart(req.userId, "pattern-recognition");
  const difficulty = parseInt(req.body.difficulty) || 2;

  // Cache holds English items only; non-English users generate fresh (Phase 1.3).
  const language = req.body.language;
  const isEn = !language || language === "en";

  // Only use cache for level 2 (default difficulty)
  if (isEn && difficulty === 2 && patternCache.length >= 20 && Math.random() < 0.70) {
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
      HAIKU,
      language
    );

    if (isEn && difficulty === 2) {
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

app.post("/api/pattern/feedback", aiLimiter, authMiddleware, async (req, res) => {
  if (!requireAI(res)) return;
  const { statement, question, options, correctAnswer, userAnswer, twoCorrect, secondCorrect, difficulty, language } = req.body;
  const pickedBest   = userAnswer === correctAnswer;
  const pickedSecond = twoCorrect && secondCorrect && userAnswer === secondCorrect;
  const isCorrect    = pickedBest || pickedSecond;
  const score        = pickedBest ? 5 : pickedSecond ? 3 : -3;
  // Points by level, only when correct: L1=3, L2=5, L3=7.
  const lvl            = difficulty === 3 ? 3 : difficulty === 1 ? 1 : 2;
  const pointsAwarded  = isCorrect ? ({ 1: 3, 2: 5, 3: 7 })[lvl] : 0;
  const pointsBreakdown = isCorrect ? `Level ${lvl} · correct → +${pointsAwarded} pts` : `Incorrect → +0 pts`;
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
      HAIKU,
      language
    );
    if (req.userId && data.discovered_skills) {
      autoUnlock(req.userId, data.discovered_skills);
    }
    res.json({ ...data, score, correct: isCorrect, pointsAwarded, pointsBreakdown, ...(twoCorrectNote ? { twoCorrectNote } : {}) });
  } catch (err) {
    console.error("pattern/feedback error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to analyze answer." });
  }
});

// ---------------------------------------------------------------------
// 3. Sales Call Mode
// ---------------------------------------------------------------------

// Render a background persona's structured fields into a prompt block.
// Falls back to the legacy one-line `behavior` if the rich fields are absent.
function personaDetail(p) {
  if (!p) return "";
  const lines = [];
  if (p.economicSituation) lines.push(`- Economic situation: ${p.economicSituation}`);
  if (p.primaryPain)       lines.push(`- Primary pain: ${p.primaryPain}`);
  if (p.objectionStyle)    lines.push(`- Objection style: ${p.objectionStyle}`);
  if (p.decisionTempo)     lines.push(`- Decision tempo: ${p.decisionTempo}`);
  if (p.saysYesWhen)       lines.push(`- Says yes when: ${p.saysYesWhen}`);
  if (lines.length) return lines.join("\n");
  return p.behavior ? `- ${p.behavior}` : "";
}

// ---------------------------------------------------------------------
// COMMUNICATION STYLE — a random, persona-INDEPENDENT axis for HOW a
// prospect talks (verbosity, how much they volunteer), so roleplays stop
// defaulting to an eager info-dump. Weighted toward short/guarded so terse
// is the norm and the talkative oversharer is the exception. Picked once at
// /start, attached to the prospect object, and it rides along on every
// /message call because the client round-trips the whole prospect.
// ---------------------------------------------------------------------
const COMM_STYLES = [
  { key: "guarded",    label: "Guarded and short",    weight: 4,
    talk: "Terse and a little suspicious. Mostly one line, sometimes just a few words. You do NOT volunteer detail, you make them ask. A bit of 'who is this again?' energy early on." },
  { key: "distracted", label: "Distracted and busy",  weight: 4,
    talk: "Half-paying-attention and a bit surprised they called. Short, slightly vague answers, sometimes a question back ('what's this about?'). They have to earn your focus before you give real answers." },
  { key: "tired",      label: "Tired and low-energy", weight: 3,
    talk: "Flat and low-energy, can't-really-be-bothered. Minimal answers, little enthusiasm. You open up only if they actually strike a nerve. Never gush." },
  { key: "blunt",      label: "Blunt and skeptical",  weight: 3,
    talk: "Clipped and direct, mildly impatient. 'Get to the point.' You push back and don't hand over anything you weren't asked for." },
  { key: "reserved",   label: "Warm but reserved",    weight: 3,
    talk: "Polite and friendly in tone but still reserved. Short answers, you don't overshare, they have to draw the real stuff out of you." },
  { key: "talkative",  label: "Talkative and open",   weight: 2,
    talk: "More open and chatty than most. You volunteer some context and think out loud a little. Still a real person on a surprise phone call, not a brochure, no monologuing for paragraphs." },
];

const COMM_STYLES_BY_KEY = COMM_STYLES.reduce((a, c) => { a[c.key] = c; return a; }, {});

// Weighted random pick, biased toward the short/guarded styles.
function pickCommStyle() {
  const total = COMM_STYLES.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of COMM_STYLES) {
    r -= c.weight;
    if (r < 0) return c;
  }
  return COMM_STYLES[0];
}

// One-line description for the profile-generation prompt so the OPENING line
// already reflects the rolled style (that "bit surprised you called" feel).
function commStyleSeed(style) {
  return `This prospect's communication style on this call: ${style.label}. ${style.talk} Let their openingMessage already reflect this style (e.g. short/guarded/distracted if that's who they are).`;
}

// STYLE block for the message prompt, from the prospect's rolled style. Replaces
// the old fixed "1-3 sentences" line. Delivery only, never changes beliefs.
function commStyleBlock(style) {
  const s = style && style.key ? (COMM_STYLES_BY_KEY[style.key] || style) : null;
  const talk = s ? s.talk : "Straightforward and concise. 1-3 sentences, no filler, no monologuing.";
  return `STYLE — this is HOW you talk on this call, NOT what you believe (your persona, pain and objections above are unchanged):
- ${talk}
- Vary your length like a real person; most replies are short. Only run longer when something genuinely lands or provokes you.
- Never mention you are an AI. Never use em-dashes. Use plain punctuation.`;
}

// ---------------------------------------------------------------------
// BELIEF ENGINE — why every prospect used to sound the same.
//
// BASE_SYSTEM injects the whole study-notes document into every generation
// and orders the model to ground itself in it. The notes' "Identify" section
// lists a handful of example beliefs, so left to itself the model reached for
// the same two or three every time ("am I the type of person who can do this",
// "it works for others, not for me") whichever persona was rolled. Asking the
// prompt for variety does not fix that. The fix is to stop letting the model
// choose the theme at all.
//
// So: roll the AXES server-side (the way pickCommStyle already rolls tone),
// one belief per axis, each anchored to a concrete particular. Every axis
// below comes from the notes' own taxonomy, so output stays grounded in the
// methodology instead of drifting into generic sales-objection soup.
// ---------------------------------------------------------------------

// `weights` is per persona key; `base` covers personas with no explicit entry.
const BELIEF_AXES = [
  { key: "skeptic", label: "Been burned / everything is a scam",
    surfaces: "They have been sold to before and it did not deliver. They half-expect this to be the same thing in a new wrapper.",
    weights: { base: 3, unemployed: 5, retiree: 4, "business-owner": 2 } },

  { key: "money_specific", label: "The money is genuinely committed elsewhere",
    surfaces: "Not a vague 'it's expensive' - a specific obligation the money is already spoken for.",
    weights: { base: 3, unemployed: 5, retiree: 4, worker: 3, "business-owner": 1 } },

  { key: "resourcefulness", label: "Not willing to be resourceful about the money",
    surfaces: "The money exists somewhere - savings, a card, a person they could ask - but moving it feels out of the question. The problem is the unwillingness, not the amount.",
    weights: { base: 3, unemployed: 4, beginner: 3, "business-owner": 1 } },

  { key: "minimizer", label: "Things aren't that bad after all",
    surfaces: "Downplays their own pain to protect their ego. Half-defends the situation they were just complaining about.",
    weights: { base: 3, "business-owner": 5, worker: 4, retiree: 3, unemployed: 2 } },

  { key: "blamer", label: "External circumstances are the reason",
    surfaces: "The economy, the market, their employer, their area, their luck. Anything but a decision they made.",
    weights: { base: 3, unemployed: 4, worker: 3, "business-owner": 2 } },

  { key: "passive", label: "It will sort itself out",
    surfaces: "Wishful language - 'hopefully', 'it should pick up', 'we'll see how it goes'. No sense of urgency at all.",
    weights: { base: 3, worker: 4, retiree: 3 } },

  { key: "later", label: "I'll do this, but not now",
    surfaces: "Agrees with everything, then puts it past a horizon - after a date, after a thing finishes, after life calms down.",
    weights: { base: 4, worker: 4, beginner: 4, "business-owner": 3 } },

  { key: "research", label: "Analysis paralysis / still comparing",
    surfaces: "Wants to look into it more, compare options, watch more content first. Research as a way of never deciding.",
    weights: { base: 3, beginner: 5, "business-owner": 3 } },

  { key: "permission", label: "Someone else has to sign off",
    surfaces: "A partner, a parent, a business partner. Sometimes real, sometimes a shield.",
    weights: { base: 3, worker: 5, retiree: 4, beginner: 3, unemployed: 2 } },

  { key: "time", label: "It won't fit around what I already do",
    surfaces: "Shifts, kids, a second job, care responsibilities. The hours genuinely do not obviously exist.",
    weights: { base: 3, worker: 5, unemployed: 2, "business-owner": 4 } },

  { key: "trust_you", label: "Doesn't trust YOU specifically",
    surfaces: "Not the industry - the person on the phone. Why are you calling, who are you, what do you get out of this.",
    weights: { base: 3, "business-owner": 4, retiree: 4 } },

  { key: "proof", label: "Generic claims bounce off, wants specifics",
    surfaces: "Asks for numbers, names, timelines, someone like them who did it. Vague answers actively lose them.",
    weights: { base: 3, "business-owner": 5, beginner: 2 } },

  { key: "sunk_cost", label: "Already paying for something similar",
    surfaces: "A course, a subscription, a coach, a membership they are still on the hook for and barely using.",
    weights: { base: 3, beginner: 4, "business-owner": 3, unemployed: 2 } },

  { key: "social_risk", label: "What the people around them would say",
    surfaces: "Status and image. How it would look to a spouse, a parent, colleagues, friends who already have opinions about it.",
    weights: { base: 3, worker: 4, retiree: 3, "business-owner": 3 } },

  { key: "start_over", label: "Tired of starting over",
    surfaces: "Has begun several things and finished none. The fear is not failing, it is being the person who quits again.",
    weights: { base: 3, beginner: 4, unemployed: 4 } },

  { key: "pace", label: "Doubts the timeline, not the method",
    surfaces: "Believes it works - for people with more runway than they have. Their doubt is 'not fast enough for my situation'.",
    weights: { base: 3, unemployed: 4, retiree: 3 } },

  // The two the model used to reach for by default. Kept, because they are
  // real beliefs from the notes - but weighted down hard, so they become an
  // occasional prospect instead of every prospect.
  { key: "capability", label: "Am I the type of person who can do this",
    surfaces: "Self-efficacy doubt. Only usable when tied to a specific thing they have already tried and how it went.",
    weights: { base: 1, beginner: 2, retiree: 2, "business-owner": 0 } },

  { key: "works_for_others", label: "Works for others, not for me",
    surfaces: "Believes the results are real but that something about their own circumstances makes them the exception.",
    weights: { base: 1, unemployed: 2, beginner: 2 } },
];

// Concrete particulars rolled alongside the axes. Beliefs stated as slogans
// all sound alike; beliefs hung on a number, a person or a date do not.
const LIFE_ANCHORS = [
  "a specific person in their life with a stated opinion about this (name the relationship, not the name)",
  "a specific past attempt: what they bought or tried, roughly when, and how it actually ended",
  "a specific money fact: an amount, a monthly commitment, or what their account realistically looks like",
  "a specific time fact: their shift pattern, their hours, or a fixed commitment in their week",
  "a specific recent event in the last few weeks that is why they responded at all",
  "a specific number attached to their goal: an amount they need, by when, and what it is for",
];

function axisWeight(axis, personaKey) {
  const w = axis.weights || {};
  return personaKey && w[personaKey] !== undefined ? w[personaKey] : (w.base || 1);
}

function pickWeightedAxis(pool, personaKey) {
  const total = pool.reduce((sum, a) => sum + axisWeight(a, personaKey), 0);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
  let r = Math.random() * total;
  for (const a of pool) {
    r -= axisWeight(a, personaKey);
    if (r < 0) return a;
  }
  return pool[pool.length - 1];
}

// 3-5 DISTINCT axes, weighted toward the ones that fit the rolled persona.
// Sampling WITHOUT replacement is what makes the bank internally varied - the
// model can no longer return four flavours of the same doubt.
function pickBeliefAxes(personaKey) {
  const count = 3 + Math.floor(Math.random() * 3);   // 3, 4 or 5
  const pool = BELIEF_AXES.slice();
  const picked = [];
  while (picked.length < count && pool.length) {
    const axis = pickWeightedAxis(pool, personaKey);
    picked.push(axis);
    pool.splice(pool.indexOf(axis), 1);
  }
  return picked;
}

function pickAnchors() {
  const pool = LIFE_ANCHORS.slice();
  const out = [];
  for (let i = 0; i < 2 && pool.length; i++) {
    out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
  }
  return out;
}

// The prompt block. It ASSIGNS axes rather than offering them: the model gets
// no say in the theme, only in the wording.
function beliefBrief(axes, anchors, avoid) {
  const assigned = axes.map((a, i) => (i + 1) + ". [" + a.label + "] " + a.surfaces).join("\n");
  const anchorLines = anchors.map((a) => "  - " + a).join("\n");
  const avoidBlock = avoid && avoid.length
    ? "\nThis trainee has already faced these exact beliefs in recent calls. Do NOT reuse them or close paraphrases:\n" +
      avoid.map((b) => "- " + b).join("\n") + "\n"
    : "";

  return `LIMITING BELIEFS - build the bank from the assigned axes below, one belief per axis, in this order:
${assigned}

Rules for the bank:
- Write each belief as ONE sentence in the prospect's own spoken voice, the way it would actually come out on a call. Not a label, not a category name, not a tidy summary.
- Every belief must contain a CONCRETE PARTICULAR: a number, a timeframe, a named relationship, or a specific thing that happened. A belief that could be pasted into any other prospect's profile is wrong and must be rewritten.
- Weave in these particulars from this prospect's life, and keep goal, currentSituation and problem consistent with them:
${anchorLines}
- The beliefs should sit slightly at odds with each other, the way real people are inconsistent. A surface excuse can be cover for something further down the list.
- BANNED, because every previous prospect said them: "I don't know if I'm fit for this", "I'm not sure I'm cut out for this", "some people are just born with it", "people who are born with it are the ones who win", "it works for others but not for me" (allowed ONLY if that exact axis is assigned above, and then only anchored to a specific past attempt), and any bare version of "is this a scam".
- hiddenBelief must be a DIFFERENT fear from all of the above, not a restatement of the strongest one.${avoidBlock}`;
}

// Per-user novelty. The axis roll fixes variety inside one call; this fixes
// "every call feels the same" across a training session. Best-effort both
// ways - a DB blip must never stop a call from starting.
async function recentBeliefsFor(userId) {
  if (!db || !userId) return [];
  try {
    const rows = await db.query(
      "SELECT belief FROM prospect_beliefs WHERE user_id=$1 ORDER BY id DESC LIMIT 15",
      [userId]
    );
    return rows.rows.map((r) => r.belief).filter(Boolean);
  } catch (err) {
    console.error("recentBeliefsFor error:", err.message);
    return [];
  }
}

function rememberBeliefs(userId, beliefs) {
  if (!db || !userId || !Array.isArray(beliefs) || !beliefs.length) return;
  const values = beliefs.slice(0, 5).map((b) => String(b).slice(0, 300));
  const params = [];
  const tuples = values.map((b, i) => {
    params.push(userId, b, Date.now());
    return "($" + (i * 3 + 1) + ", $" + (i * 3 + 2) + ", $" + (i * 3 + 3) + ")";
  });
  db.query(
    "INSERT INTO prospect_beliefs (user_id, belief, created_at) VALUES " + tuples.join(", "),
    params
  ).catch((e) => console.error("rememberBeliefs error:", e.message));
}

// Keep the anti-repeat table from growing without bound: trim a user's rows
// to the newest 40 on every write. Cheap, and it runs off the hot path.
function trimBeliefMemory(userId) {
  if (!db || !userId) return;
  db.query(
    `DELETE FROM prospect_beliefs WHERE user_id=$1 AND id NOT IN (
       SELECT id FROM prospect_beliefs WHERE user_id=$1 ORDER BY id DESC LIMIT 40)`,
    [userId]
  ).catch(() => {});
}

app.post("/api/call/start", aiLimiter, authMiddleware, checkSessionLimit, async (req, res) => {
  if (!requireAI(res)) return;
  recordSessionStart(req.userId, "sales-call");
  const { scenario, customDescription, section, personality, prospectName, language } = req.body;

  const sectionContext = section
    ? `The roleplay focuses on the "${section}" phase of the One Call Close. If the section is not "Opening", the prospect's opening message should reflect that the call is already mid-flow (rapport has been built, earlier phases are done).`
    : "";

  const personalityContext = personality && personality.label
    ? `This prospect is a background persona: "${personality.label}".
${personaDetail(personality)}
Shape their goal, current situation, problem, limiting beliefs, opening line and especially their buyingReadiness around this persona's economic reality and the TYPE of resistance described above. The limitingBeliefs bank should reflect this persona's objection style, not generic ones.`
    : "";

  const nameInstruction = prospectName
    ? `Use exactly "${prospectName}" as the prospect's name.`
    : `Give the prospect a realistic first name.`;

  const commStyle  = pickCommStyle();
  const beliefAxes = pickBeliefAxes(personality && personality.key);
  const anchors    = pickAnchors();

  try {
    const avoid = await recentBeliefsFor(req.userId);
    const data = await askClaude(
      `Generate a prospect profile for a sales call roleplay simulation.
Scenario: ${scenario}${customDescription ? ` — ${customDescription}` : ""}
${sectionContext}
${personalityContext}
${commStyleSeed(commStyle)}
${nameInstruction}

${beliefBrief(beliefAxes, anchors, avoid)}
The "limitingBeliefs" array is that bank, ordered from the one most likely to surface first to last.
These are what the prospect works through during the call.

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
      SONNET,
      language
    );
    if (prospectName) data.name = prospectName;
    // Ride the rolled style along on the prospect so /message stays consistent.
    data.communicationStyle = { key: commStyle.key, label: commStyle.label };
    data.beliefAxes = beliefAxes.map((a) => a.key);
    rememberBeliefs(req.userId, data.limitingBeliefs);
    trimBeliefMemory(req.userId);
    res.json(data);
  } catch (err) {
    console.error("call/start error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to start call." });
  }
});

app.post("/api/call/message", aiLimiter, authMiddleware, async (req, res) => {
  if (!requireAI(res)) return;
  const { scenario, prospect, history, userMessage, section, personality, language } = req.body;

  // Token-free guard: never spend tokens on trolling / keyboard-mashing.
  if (isLowEffortMessage(userMessage)) {
    return res.json({
      blocked: true,
      reason: "That doesn't read like something you'd actually say on a live call. Type a real line and the prospect will respond.",
    });
  }

  try {
    const historyText = capHistory(history)
      .map((m) => `${m.role === "user" ? "Salesperson" : "Prospect"}: ${m.content}`)
      .join("\n");

    const sectionInstruction = section
      ? `\nThis roleplay starts at the "${section}" phase of the One Call Close. Behave as if earlier phases already happened. Your reactions, objections, and openness should be calibrated for where you are at this stage.`
      : "";

    const personalityInstruction = personality && personality.label
      ? `\nYou are "${personality.label}", a specific type of prospect.\n${personaDetail(personality)}\nStay true to this persona's economic reality, pain and objection style throughout.`
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

REACT realistically based on how well they apply Authority, Tonality, Identity, Certainty, Objection Handling and Closing principles. Stay completely in character.

${commStyleBlock(prospect.communicationStyle)}

CLOSE FLAG (be strict and honest):
- "closed" is true ONLY when you have firmly and explicitly agreed to buy / sign up / start / pay for the offer right now (a clear yes to the purchase). Vague interest, "let me think about it", or "sounds good" is NOT closed.
- Otherwise "closed" is false.

Return ONLY valid JSON:
{ "reply": "your spoken reply, in character", "closed": true | false }` + langRule(language),
      messages: [
        {
          role: "user",
          content: `Conversation so far:\n${historyText}\n\nSalesperson: ${userMessage}\n\nRespond only as ${prospect.name}. Return the JSON described.`,
        },
      ],
    });

    const raw = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    let reply = raw, closed = false;
    try {
      const parsed = extractJSON(raw);
      reply = (parsed.reply || "").trim() || raw;
      closed = parsed.closed === true;
    } catch {
      // Model didn't return clean JSON — treat the whole text as the reply.
      reply = raw;
      closed = false;
    }
    res.json({ reply, closed });
  } catch (err) {
    console.error("call/message error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to get prospect reply." });
  }
});

app.post("/api/call/end", aiLimiter, authMiddleware, async (req, res) => {
  if (!requireAI(res)) return;
  const { scenario, prospect, history, section, personality, language } = req.body;
  try {
    const turns = capHistory(history);
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
      HAIKU,
      language
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
  "callScore": <integer 0-10, overall quality of the call>,
  "closed": <boolean, true ONLY if the transcript shows the prospect explicitly agreeing to buy / move forward with payment>,
  "headline": "one-line verdict of how the call went",
  "rememberThis": "the single most important lesson from THIS call, one memorable sentence",
  "thinkAboutNextTime": ["forward-looking bullet, a concrete thing to do differently next call", "..."],
  "whatYouDidWell": ["short bullet under 15 words", "..."],
  "principle": { "name": "principle name from notes", "note": "one sentence on how it applied here" },
  "discovered_skills": ["skill_id1", "skill_id2", "skill_id3"]
}`,
      1600,
      SONNET,
      language
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

    // Closer: base 50 scaled by the 0-10 call quality, +15 only if the deal closed.
    const closeBase     = pointsForCall(50, summary.callScore);
    const closed        = !!summary.closed;
    const closeBonus    = closed ? 15 : 0;
    const pointsAwarded  = closeBase + closeBonus;
    const pointsBreakdown = closed
      ? `Deal closed — quality ${clampRating(summary.callScore)}/10 → ${closeBase}, +${closeBonus} close bonus = ${pointsAwarded}`
      : `Call quality ${clampRating(summary.callScore)}/10 → ${pointsAwarded}`;

    if (req.userId && summary.discovered_skills) {
      autoUnlock(req.userId, summary.discovered_skills);
    }
    if (req.userId && summary.rememberThis) {
      saveLesson(req.userId, {
        content: summary.rememberThis,
        headline: summary.headline,
        source: "Closer",
        persona: personality && personality.label ? personality.label : null,
        callScore: summary.callScore,
        language,
      });
    }
    if (req.userId) {
      saveCallHistory(req.userId, {
        mode: "Closer",
        label: scenario,
        persona: personality && personality.label ? personality.label : null,
        section: section || null,
        outcome: "Reviewed",
        skills: summary.discovered_skills || [],
        transcript: historyText,
        reviewed: true,
      });
    }
    res.json({ ...summary, highlights, pointsAwarded, pointsBreakdown });
  } catch (err) {
    console.error("call/end error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to generate feedback report." });
  }
});

// ---------------------------------------------------------------------
// SETTER MODE
// A remote-setter RECRUITMENT call. The trainee is the setter, phoning a
// warm lead who responded to a video about becoming a remote setter. The
// Setter Call Framework (setter_call_framework.md) is the trainee's PLAYBOOK —
// it is NEVER shown to the AI prospect. It drives only (a) the grading of the
// trainee's structure and (b) the Qualified / Not Qualified outcome. The AI
// prospect just plays a challenging persona and resists, like Closer mode.
// ---------------------------------------------------------------------

// The offer list is now shared with Closer mode. In Setter mode each label is
// framed as the income OPPORTUNITY the lead watched a video about. Keyed by the
// client's `data-offer` value; "Custom" falls through to the trainee's free-text
// customDescription instead of a canned description.
const SETTER_OFFERS = {
  "Fitness Coach":           "becoming an online fitness coach — building a work-from-anywhere coaching business",
  "Business Coach":          "becoming a business coach or consultant and building a coaching business",
  "Agency Offer":            "starting a marketing agency (SMMA) — getting clients paying monthly retainers",
  "E-commerce Offer":        "building an e-commerce brand — running an online store",
  "SaaS":                    "breaking into software / SaaS — building or selling a software product",
  "High Ticket Sales":       "getting into high-ticket sales — remote setting and closing sales calls for other businesses, a work-from-anywhere income path",
  "Affiliate Marketing":     "affiliate marketing — earning commissions promoting other companies' products online",
  "Dropshipping":            "starting a dropshipping e-commerce business — running an online store without holding inventory",
  "Coaching Certification":  "getting certified as a coach in a niche and building a coaching business",
};

function setterOfferText(offer, customDescription) {
  if (offer === "Custom") return customDescription || "a remote income opportunity";
  return SETTER_OFFERS[offer] || SETTER_OFFERS["High Ticket Sales"];
}

// The ideal call STRUCTURE (order matters). Mirrors the stage order in
// setter_call_framework.md — keep the two in step when that file changes.
// Used only for grading — never fed to the prospect. Loose guide, not a
// verbatim script.
const SETTER_STAGES = [
  { key: "warm_open",          label: "Warm Open & Framing",           desc: "Neutral, low-pressure open; names why they're calling (the video) and frames the call as understanding where the lead is and where they want to go." },
  { key: "hook",               label: "Hook / Reason for Reaching Out", desc: "Surfaces what triggered them to respond — what caught their attention in the video and motivated them to reach out." },
  { key: "situation",          label: "Situation Discovery",           desc: "What they do now, how long, whether they like it (and a two-truths check on why change at all if it sounds fine)." },
  { key: "problem",            label: "Problem Discovery",             desc: "What they don't like, clarified and chunked down (what do you mean / tell me more / in what way), plus the personal impact: how it makes them feel, how long it's gone on." },
  { key: "solution_awareness", label: "Solution Awareness",            desc: "What they've already tried and why it didn't work; why fixing this is a priority NOW after all this time." },
  { key: "goals",              label: "Goals & Vision",                desc: "Where they want to get to — income to replace, the bigger vision, and why that goal matters to them." },
  { key: "cost_of_inaction",   label: "Cost of Inaction",              desc: "How long it's been a goal, how long until they'd get there on their current path; challenges weak answers and establishes why now." },
  { key: "transition",         label: "Transition",                    desc: "Asks permission to share thoughts; mirrors their pain and goals back; frames remote setting as the fit, then checks if they can see themselves doing it." },
  { key: "pitch",              label: "Pitch (Book the Closer Call)",  desc: "Positions a call with a coach/closer as the next step, explains what that call does, then offers specific time slots to book it." },
];

const SETTER_OBJECTIVES = `TWO objectives decide qualification:
1. UNDERSTAND THE PAIN — the setter genuinely uncovered the lead's real problem, its impact, and their goal (not just surface facts).
2. POSITION THE 2ND CALL — the setter positioned a call with a closer/coach as the logical next step and got the lead to book a specific time.
A lead is QUALIFIED only if BOTH objectives are met. Missing either = NOT QUALIFIED.`;

function setterStagesForPrompt() {
  return SETTER_STAGES.map((s, i) => `${i + 1}. ${s.label} — ${s.desc}`).join("\n");
}

// The framework's own stage goals and example questions, as extra grounding for
// GRADING only. Trimmed to the stage sections: the file's preamble and closing
// notes are instructions to a human reader, not to the grader.
function setterFrameworkBlock() {
  if (!SETTER_FRAMEWORK) return "";
  const start = SETTER_FRAMEWORK.indexOf("## Stage 1");
  const end   = SETTER_FRAMEWORK.lastIndexOf("## Notes");
  const body  = SETTER_FRAMEWORK.slice(
    start === -1 ? 0 : start,
    end === -1 ? undefined : end
  ).trim();
  if (!body) return "";
  return `
THE FRAMEWORK IN FULL (the trainee's playbook). The example questions show the
KIND of question each stage calls for — wording will and should differ, and
reciting them verbatim is worse than a real conversation that hits the same
beats. Grade against the intent of each stage, not the phrasing:
${body}
`;
}

app.post("/api/setter/start", aiLimiter, authMiddleware, checkSessionLimit, async (req, res) => {
  if (!requireAI(res)) return;
  recordSessionStart(req.userId, "setter");
  const { offer, customDescription, personality, prospectName, language } = req.body;
  const offerText = setterOfferText(offer, customDescription);

  const personaContext = personality && personality.label
    ? `This lead is a background persona: "${personality.label}".\n${personaDetail(personality)}\nShape their current situation, the problem/pain that made them respond to the video, their goal, their limiting beliefs and their buyingReadiness around this persona's economic reality and TYPE of resistance.`
    : "";

  const nameInstruction = prospectName
    ? `Use exactly "${prospectName}" as the lead's name.`
    : `Give the lead a realistic first name.`;

  const commStyle  = pickCommStyle();
  const beliefAxes = pickBeliefAxes(personality && personality.key);
  const anchors    = pickAnchors();

  try {
    const avoid = await recentBeliefsFor(req.userId);
    const data = await askClaude(
      `Generate a prospect profile for a REMOTE-INCOME RECRUITMENT call roleplay.
The offer: ${offerText}
The trainee is a SETTER phoning this warm lead. The lead has NOT been sold anything yet — they only watched a video and are curious/skeptical.
${personaContext}
${commStyleSeed(commStyle)}
${nameInstruction}

${beliefBrief(beliefAxes, anchors, avoid)}
The "limitingBeliefs" array is that bank - hesitations about pursuing remote setting AND about committing to a next step - ordered most-likely-first.

Return JSON:
{
  "name": "${prospectName || "first name"}",
  "age": <number>,
  "goal": "what they ultimately want (income / lifestyle / change)",
  "currentSituation": "their current work and income situation",
  "problem": "what they dislike about their current situation — the pain that made them respond to the video",
  "hiddenBelief": "the single deepest doubt they would never say out loud",
  "limitingBeliefs": ["short belief/objection 1", "2", "3"],
  "buyingReadiness": "Low" | "Medium" | "High",
  "openingMessage": "the lead answering the phone — brief, a little unsure/guarded, e.g. 'Hello?' or 'Yeah, this is <name>...' They do NOT launch into anything; the setter leads the call."
}`,
      700,
      SONNET,
      language
    );
    if (prospectName) data.name = prospectName;
    // Ride the rolled style along on the lead so /message stays consistent.
    data.communicationStyle = { key: commStyle.key, label: commStyle.label };
    data.beliefAxes = beliefAxes.map((a) => a.key);
    rememberBeliefs(req.userId, data.limitingBeliefs);
    trimBeliefMemory(req.userId);
    res.json(data);
  } catch (err) {
    console.error("setter/start error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to start call." });
  }
});

app.post("/api/setter/message", aiLimiter, authMiddleware, async (req, res) => {
  if (!requireAI(res)) return;
  const { offer, customDescription, prospect, history, userMessage, personality, language } = req.body;
  const offerText = setterOfferText(offer, customDescription);

  if (isLowEffortMessage(userMessage)) {
    return res.json({
      blocked: true,
      reason: "That doesn't read like something you'd actually say on a live call. Type a real line and the lead will respond.",
    });
  }

  try {
    const historyText = capHistory(history)
      .map((m) => `${m.role === "user" ? "Setter" : "Lead"}: ${m.content}`)
      .join("\n");

    const personaInstruction = personality && personality.label
      ? `\nYou are "${personality.label}", a specific type of lead.\n${personaDetail(personality)}\nStay true to this persona's economic reality, pain and objection style throughout.`
      : "";

    const beliefBank = Array.isArray(prospect.limitingBeliefs) && prospect.limitingBeliefs.length
      ? prospect.limitingBeliefs.map((b, i) => `${i + 1}. ${b}`).join("\n")
      : "(none specified — improvise realistic ones from your hidden belief)";

    const msg = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 350,
      system: `You are roleplaying as ${prospect.name}, a warm LEAD on a phone call. You recently watched a video about ${offerText} and left your details, so someone from their team (the SETTER, the person you're talking to) is now calling you. You are curious but skeptical. You do NOT know any sales script and must never reference one.
${personaInstruction}

Profile:
- Age: ${prospect.age}
- Goal: ${prospect.goal}
- Current situation: ${prospect.currentSituation}
- Problem / pain that made you respond: ${prospect.problem}
- Hidden doubt (never say this explicitly, let it leak through resistance): ${prospect.hiddenBelief}
- Readiness: ${prospect.buyingReadiness}

Your hesitations / objections bank (work through these like a real person):
${beliefBank}

BEHAVIOUR:
- Act like a real, conscious human, not a loop. Remember everything already said. Never repeat an objection once it's been genuinely handled — drop it and move on.
- Make the setter EARN it. Don't hand over your real problem, its impact, or your goals unless they actually ask good questions and make you feel understood. If they interrogate you or jump to pitching without understanding you, stay guarded and non-committal.
- You only agree to book a call with a "closer" / "coach" when the setter has (a) genuinely understood your pain and goals AND (b) made that next call feel worth your time AND (c) offered a specific time. Only then do you accept a SPECIFIC time slot.

BOOKING FLAG (be strict and honest):
- "none"      = you have not agreed to a next call, or the setter hasn't pitched one.
- "soft"      = you're interested / open to hearing more, but you have NOT committed to a specific time ("sounds good, tell me more" is soft, not confirmed).
- "confirmed" = you have firmly accepted a SPECIFIC time slot for the call with the closer (e.g. "yeah, tomorrow at 3 works"). Never mark confirmed for vague interest.

${commStyleBlock(prospect.communicationStyle)}

Return ONLY valid JSON:
{ "reply": "your spoken reply, in character", "booking": "none" | "soft" | "confirmed" }` + langRule(language),
      messages: [
        {
          role: "user",
          content: `Conversation so far:\n${historyText}\n\nSetter: ${userMessage}\n\nRespond only as ${prospect.name}. Return the JSON described.`,
        },
      ],
    });

    const raw = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    let reply = raw, booking = "none";
    try {
      const parsed = extractJSON(raw);
      reply = (parsed.reply || "").trim() || raw;
      booking = ["none", "soft", "confirmed"].includes(parsed.booking) ? parsed.booking : "none";
    } catch {
      // Model didn't return clean JSON — fall back to treating the text as the reply.
      reply = raw;
      booking = "none";
    }
    res.json({ reply, booking });
  } catch (err) {
    console.error("setter/message error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to get lead reply." });
  }
});

app.post("/api/setter/end", aiLimiter, authMiddleware, async (req, res) => {
  if (!requireAI(res)) return;
  const { offer, customDescription, prospect, history, liveBooking, personality, language } = req.body;
  const offerText = setterOfferText(offer, customDescription);
  try {
    const turns = capHistory(history);
    const historyText = turns
      .map((m) => `${m.role === "user" ? "Setter" : "Lead"}: ${m.content}`)
      .join("\n");

    const userLines = turns.filter((m) => m.role === "user");
    const numberedUserLines = userLines
      .map((m, i) => `[#${i}] Setter: ${m.content}`)
      .join("\n");

    // 1) HAIKU — per-line highlights painted onto the chat.
    const highlightsPromise = askClaude(
      `A remote-income recruitment call just ended. Below are ONLY the setter's own lines, each tagged [#index].
Pick the 4 to 8 most instructive lines and tag each. Highlight strong moves AND clear mistakes / missed reads.

Verdicts:
- "good"    = a strong, skillful move
- "improve" = workable but a better option existed
- "bad"     = a clear mistake or missed read

Setter lines:
${numberedUserLines}

${STYLE_RULES}

Return ONLY valid JSON. Each note is the lesson for that exact line, under 14 words, action-focused:
{ "highlights": [ { "index": <integer>, "verdict": "good" | "improve" | "bad", "note": "under 14 words" } ] }`,
      900,
      HAIKU,
      language
    );

    // 2) SONNET — grade against the Setter Call Framework + decide the outcome.
    const summaryPromise = askClaude(
      `A REMOTE-INCOME RECRUITMENT call roleplay just ended. The offer being recruited for: ${offerText}
Grade the SETTER (the trainee) against the ideal call structure and objectives below.

THE IDEAL STRUCTURE (order matters, but it's a loose guide — reward following the STRUCTURE and having a real conversation, not reciting questions verbatim):
${setterStagesForPrompt()}
${setterFrameworkBlock()}
${SETTER_OBJECTIVES}

Lead profile: ${JSON.stringify(prospect)}

Full transcript:
${historyText}

During the live call the lead's booking flag reached: "${liveBooking || "none"}".
BOOKING VALIDATION (two-stage guard): only treat the call as BOOKED if the transcript actually shows the setter pitching the closer call AND the lead firmly accepting a SPECIFIC time. If the live flag says confirmed but the transcript doesn't support a firm yes + a specific time, set booked=false and explain. If the lead gave a firm yes + time WITHOUT the setter earning it (no real pain uncovered, structure skipped), set booked=true but unearned=true and call it out.

${STYLE_RULES}

${SKILL_ID_PROMPT}

Return JSON:
{
  "callScore": <integer 0-10, overall quality of the call>,
  "outcome": "Qualified" | "Not Qualified",
  "booked": <boolean>,
  "unearned": <boolean, true only if booked but not earned>,
  "bookingRationale": "one or two sentences: was the closer call booked, and was it earned?",
  "objectives": { "understoodPain": <boolean>, "positionedCloserCall": <boolean> },
  "structure": [ { "key": "<stage key from the list>", "status": "hit" | "partial" | "missed", "note": "under 14 words, specific to this call" } ],
  "headline": "one-line verdict of how the call went",
  "rememberThis": "the single most important lesson from THIS call, one memorable sentence",
  "thinkAboutNextTime": ["forward-looking, concrete thing to do differently next call", "..."],
  "whatYouDidWell": ["short bullet under 15 words", "..."],
  "principle": { "name": "principle name", "note": "one sentence on how it applied here" },
  "discovered_skills": ["skill_id1", "skill_id2"]
}
The "structure" array MUST include one entry for every stage key: ${SETTER_STAGES.map((s) => s.key).join(", ")}.`,
      2000,
      SONNET,
      language
    );

    const [highlightsData, summary] = await Promise.all([
      highlightsPromise.catch(() => ({ highlights: [] })),
      summaryPromise,
    ]);

    const highlights = (highlightsData.highlights || [])
      .filter((h) => h && typeof h.index === "number" && userLines[h.index])
      .map((h) => ({
        index: h.index,
        verdict: ["good", "improve", "bad"].includes(h.verdict) ? h.verdict : "improve",
        note: h.note || "",
        quote: userLines[h.index].content,
      }));

    // Attach each stage's label so the client doesn't need to know the rubric.
    const stageLabels = Object.fromEntries(SETTER_STAGES.map((s) => [s.key, s.label]));
    const structure = Array.isArray(summary.structure)
      ? summary.structure.map((s) => ({ ...s, label: stageLabels[s.key] || s.key }))
      : [];

    // Setter: base 10 scaled by the 0-10 call quality, +5 only for an earned booking.
    const setBase       = pointsForCall(10, summary.callScore);
    const earnedSet     = summary.booked && !summary.unearned;
    const setBonus      = earnedSet ? 5 : 0;
    const pointsAwarded  = setBase + setBonus;
    const pointsBreakdown = earnedSet
      ? `Appointment booked — quality ${clampRating(summary.callScore)}/10 → ${setBase}, +${setBonus} set bonus = ${pointsAwarded}`
      : (summary.booked
          ? `Booked but unearned — quality ${clampRating(summary.callScore)}/10 → ${pointsAwarded}`
          : `Call quality ${clampRating(summary.callScore)}/10 → ${pointsAwarded}`);

    if (req.userId && summary.discovered_skills) {
      autoUnlock(req.userId, summary.discovered_skills);
    }
    if (req.userId && summary.rememberThis) {
      saveLesson(req.userId, {
        content: summary.rememberThis,
        headline: summary.headline,
        source: "Setter",
        persona: personality && personality.label ? personality.label : null,
        callScore: summary.callScore,
        language,
      });
    }
    if (req.userId) {
      saveCallHistory(req.userId, {
        mode: "Setter",
        label: offerText,
        persona: personality && personality.label ? personality.label : null,
        section: null,
        outcome: summary.outcome || (summary.booked ? "Booked" : "Ended"),
        skills: summary.discovered_skills || [],
        transcript: historyText,
        reviewed: true,
      });
    }
    res.json({ ...summary, structure, highlights, pointsAwarded, pointsBreakdown });
  } catch (err) {
    console.error("setter/end error:", err.stack || err.message);
    res.status(500).json({ error: "Failed to generate feedback report." });
  }
});

// ---------------------------------------------------------------------
// End a call WITHOUT a review. Sometimes you just want to quit and move
// on. No highlights, no debrief, no lesson - just one tiny Haiku pass to
// tag which skills were touched, so the Skill Tree still "remembers" the
// call and fills out. Cheap by design.
// ---------------------------------------------------------------------

app.post("/api/call/quit", aiLimiter, authMiddleware, async (req, res) => {
  const { scenario, prospect, history, section, personality } = req.body || {};
  const turns = Array.isArray(history) ? history : [];
  const historyText = turns
    .map((m) => `${m.role === "user" ? "Salesperson" : "Prospect"}: ${m.content}`)
    .join("\n");

  // Only spend the (tiny) token budget when there's a logged-in user whose
  // tree this can actually fill out, and a real call to read.
  const userTurns = turns.filter((m) => m.role === "user").length;
  const skills = (req.userId && userTurns >= 2) ? await discoverSkillsFromTranscript(historyText, "closer") : [];

  if (req.userId) {
    if (skills.length) autoUnlock(req.userId, skills);
    saveCallHistory(req.userId, {
      mode: "Closer",
      label: scenario || "Sales call",
      persona: personality && personality.label ? personality.label : null,
      section: section || null,
      outcome: "Ended (no review)",
      skills,
      transcript: historyText,
      reviewed: false,
    });
  }
  res.json({ ok: true, discovered_skills: skills });
});

app.post("/api/setter/quit", aiLimiter, authMiddleware, async (req, res) => {
  const { offer, customDescription, history, personality } = req.body || {};
  const offerText = setterOfferText(offer, customDescription);
  const turns = Array.isArray(history) ? history : [];
  const historyText = turns
    .map((m) => `${m.role === "user" ? "Setter" : "Lead"}: ${m.content}`)
    .join("\n");

  const userTurns = turns.filter((m) => m.role === "user").length;
  const skills = (req.userId && userTurns >= 2) ? await discoverSkillsFromTranscript(historyText, "setter") : [];

  if (req.userId) {
    if (skills.length) autoUnlock(req.userId, skills);
    saveCallHistory(req.userId, {
      mode: "Setter",
      label: offerText,
      persona: personality && personality.label ? personality.label : null,
      section: null,
      outcome: "Ended (no review)",
      skills,
      transcript: historyText,
      reviewed: false,
    });
  }
  res.json({ ok: true, discovered_skills: skills });
});

// Recent calls the Skill Tree remembers (metadata + touched skills only).
app.get("/api/calls/recent", authMiddleware, async (req, res) => {
  if (!db) return res.json({ calls: [] });
  try {
    const result = await db.query(
      `SELECT id, mode, label, persona, section, outcome, skills, reviewed, created_at
         FROM call_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 12`,
      [req.userId]
    );
    const calls = result.rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      label: r.label,
      persona: r.persona,
      section: r.section,
      outcome: r.outcome,
      reviewed: r.reviewed,
      created_at: r.created_at,
      skills: (() => { try { return JSON.parse(r.skills || "[]"); } catch { return []; } })(),
    }));
    res.json({ calls });
  } catch (err) {
    console.error("calls/recent error:", err.message);
    res.json({ calls: [] });
  }
});

// ---------------------------------------------------------------------
// Saved calls — the ones the trainee explicitly chose to keep.
//
// Separate from call_history on purpose: that table is the Skill Tree's
// automatic memory (capped, fire-and-forget, never shown as a document).
// This one holds only what someone deliberately saved, at full length, so
// it can be re-read or handed to a coach as a PDF.
// ---------------------------------------------------------------------

const SAVED_LIMIT = 200;   // per account, oldest pruned beyond this

function normalizeTranscript(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).map((t) => ({
    role: t && t.role === "user" ? "user" : "prospect",
    content: typeof (t && t.content) === "string" ? t.content.slice(0, 4000) : "",
  })).filter((t) => t.content);
}

app.post("/api/calls/save", authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const { mode, label, persona, section, outcome, score, transcript, analysis } = req.body || {};
  const turns = normalizeTranscript(transcript);
  if (!turns.length) return res.status(400).json({ error: "Nothing to save — the call has no transcript." });

  let analysisJson = null;
  if (analysis && typeof analysis === "object") {
    try { analysisJson = JSON.stringify(analysis).slice(0, 40000); } catch { analysisJson = null; }
  }

  try {
    const row = await db.query(
      `INSERT INTO saved_calls (user_id, mode, label, persona, section, outcome, score, transcript, analysis, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        req.userId,
        (mode || "closer").slice(0, 40),
        (label || "Sales call").slice(0, 200),
        (persona || "").slice(0, 120) || null,
        (section || "").slice(0, 120) || null,
        (outcome || "").slice(0, 120) || null,
        Number.isFinite(score) ? score : null,
        JSON.stringify(turns),
        analysisJson,
        Date.now(),
      ]
    );
    // Keep the shelf from growing forever; the newest SAVED_LIMIT survive.
    db.query(
      `DELETE FROM saved_calls WHERE user_id=$1 AND id NOT IN (
         SELECT id FROM saved_calls WHERE user_id=$1 ORDER BY id DESC LIMIT ${SAVED_LIMIT})`,
      [req.userId]
    ).catch(() => {});
    res.json({ ok: true, id: row.rows[0].id });
  } catch (err) {
    console.error("calls/save error:", err.message);
    res.status(500).json({ error: "Could not save this conversation." });
  }
});

app.get("/api/calls/saved", authMiddleware, async (req, res) => {
  if (!db) return res.json({ calls: [] });
  try {
    const result = await db.query(
      `SELECT id, mode, label, persona, section, outcome, score, analysis, transcript, created_at
         FROM saved_calls WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`,
      [req.userId]
    );
    const calls = result.rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      label: r.label,
      persona: r.persona,
      section: r.section,
      outcome: r.outcome,
      score: r.score,
      reviewed: !!r.analysis,
      turns: (() => { try { return JSON.parse(r.transcript || "[]").length; } catch { return 0; } })(),
      created_at: Number(r.created_at),
    }));
    res.json({ calls });
  } catch (err) {
    console.error("calls/saved error:", err.message);
    res.json({ calls: [] });
  }
});

app.get("/api/calls/saved/:id", authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const row = await loadSavedCall(req.params.id, req.userId);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err) {
    console.error("calls/saved/:id error:", err.message);
    res.status(500).json({ error: "Could not load that conversation." });
  }
});

app.delete("/api/calls/saved/:id", authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
  try {
    await db.query("DELETE FROM saved_calls WHERE id=$1 AND user_id=$2", [id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("calls/saved delete error:", err.message);
    res.status(500).json({ error: "Could not delete that conversation." });
  }
});

// Scoped by user_id in the WHERE clause, not just by id — an id alone must
// never be enough to read someone else's call.
async function loadSavedCall(rawId, userId) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) return null;
  const result = await db.query(
    `SELECT id, mode, label, persona, section, outcome, score, transcript, analysis, created_at
       FROM saved_calls WHERE id=$1 AND user_id=$2`,
    [id, userId]
  );
  if (!result.rows.length) return null;
  const r = result.rows[0];
  const parse = (raw, fallback) => { try { return JSON.parse(raw); } catch { return fallback; } };
  return {
    id: r.id,
    mode: r.mode,
    label: r.label,
    persona: r.persona,
    section: r.section,
    outcome: r.outcome,
    score: r.score,
    created_at: Number(r.created_at),
    transcript: parse(r.transcript, []),
    analysis: r.analysis ? parse(r.analysis, null) : null,
  };
}

// ---------------------------------------------------------------------
// PDF export. The page is the chat: left/right bubbles, same proportions
// as the live call screen, so a coach reading the PDF sees what the
// trainee saw. Theme and whether the score is printed are the reader's
// choice, sent as query params from Settings.
// ---------------------------------------------------------------------

const PDF_THEMES = {
  light: {
    page:        "#ffffff",
    ink:         "#1a1310",
    muted:       "#6b5750",
    accent:      "#d4431e",
    rule:        "#e3d9d4",
    themBg:      "#f4f1ef",
    themBorder:  "#e3d9d4",
    themInk:     "#1a1310",
    youBg:       "#fdeee8",
    youBorder:   "#f2c7b5",
    youInk:      "#1a1310",
    good:        "#1f7a45",
    bad:         "#b3261e",
    panel:       "#faf7f6",
  },
  dark: {
    page:        "#0a0605",
    ink:         "#f2ece9",
    muted:       "#9a857e",
    accent:      "#ff5a2e",
    rule:        "#241713",
    themBg:      "#171010",
    themBorder:  "#241713",
    themInk:     "#e7ded9",
    youBg:       "#26110b",
    youBorder:   "#5a2416",
    youInk:      "#f6ece7",
    good:        "#5fd08a",
    bad:         "#ff5a4e",
    panel:       "#100907",
  },
};

const PDF_MARGIN = 56;

function pdfOptions(query) {
  const q = query || {};
  const theme = PDF_THEMES[q.theme] ? q.theme : "light";
  // Absent means "print it" - only an explicit 0/false turns the score off.
  const showScore = !(q.score === "0" || q.score === "false" || q.score === "no");
  return { theme, palette: PDF_THEMES[theme], showScore };
}

// A dark PDF needs the page painted, not just the text recoloured — and on
// every page, including ones pdfkit adds mid-transcript.
function paintPage(doc, c) {
  if (c.page === "#ffffff") return;
  const { width, height } = doc.page;
  doc.save().rect(0, 0, width, height).fill(c.page).restore();
}

function pdfNewPage(doc, c) {
  doc.addPage();
  return doc.y;
}

function pdfHeading(doc, c, text) {
  if (doc.y > 640) pdfNewPage(doc, c);
  doc.moveDown(1.1);
  doc.fillColor(c.accent).font("Helvetica-Bold").fontSize(9)
     .text(text.toUpperCase(), PDF_MARGIN, doc.y, { characterSpacing: 1.4 });
  doc.moveTo(PDF_MARGIN, doc.y + 3).lineTo(doc.page.width - PDF_MARGIN, doc.y + 3)
     .strokeColor(c.rule).lineWidth(1).stroke();
  doc.moveDown(0.7);
}

function pdfBullets(doc, c, items) {
  (Array.isArray(items) ? items : []).forEach((item) => {
    const text = typeof item === "string" ? item : (item && (item.text || item.note)) || "";
    if (!text) return;
    if (doc.y > 720) pdfNewPage(doc, c);
    doc.fillColor(c.ink).font("Helvetica").fontSize(10.5)
       .text("•  " + text, PDF_MARGIN, doc.y, { width: doc.page.width - PDF_MARGIN * 2, paragraphGap: 4, lineGap: 1.5 });
  });
}

// A bubble with one squared-off corner on the speaker's side, the same tail
// the chat window draws with border-bottom-*-radius: 4px.
function bubblePath(doc, x, y, w, h, radii) {
  const [tl, tr, br, bl] = radii;
  doc.moveTo(x + tl, y)
     .lineTo(x + w - tr, y)
     .quadraticCurveTo(x + w, y, x + w, y + tr)
     .lineTo(x + w, y + h - br)
     .quadraticCurveTo(x + w, y + h, x + w - br, y + h)
     .lineTo(x + bl, y + h)
     .quadraticCurveTo(x, y + h, x, y + h - bl)
     .lineTo(x, y + tl)
     .quadraticCurveTo(x, y, x + tl, y);
}

const BUBBLE_PAD_X = 14;
const BUBBLE_PAD_Y = 11;
const BUBBLE_GAP   = 12;
const BUBBLE_FONT  = 10.5;

function drawBubble(doc, c, turn) {
  const isUser    = turn.role === "user";
  const contentW  = doc.page.width - PDF_MARGIN * 2;
  const maxBubble = contentW * 0.75;                    // matches .chat-bubble max-width
  const maxInner  = maxBubble - BUBBLE_PAD_X * 2;

  doc.font("Helvetica").fontSize(BUBBLE_FONT);
  // Short lines keep a short bubble, the way the chat window does.
  const innerW  = Math.min(Math.ceil(doc.widthOfString(turn.content)) + 1, maxInner);
  const textH   = doc.heightOfString(turn.content, { width: innerW, lineGap: 1.6 });
  const bubbleW = innerW + BUBBLE_PAD_X * 2;
  const bubbleH = textH + BUBBLE_PAD_Y * 2;

  const bottom = doc.page.height - PDF_MARGIN;
  if (doc.y + bubbleH + 18 > bottom) pdfNewPage(doc, c);

  const x = isUser ? doc.page.width - PDF_MARGIN - bubbleW : PDF_MARGIN;
  const y = doc.y;

  // Speaker label, tucked above the bubble on the speaker's side.
  doc.fillColor(c.muted).font("Helvetica-Bold").fontSize(7.5)
     .text(isUser ? "YOU" : "PROSPECT", isUser ? x : x, y, {
       width: bubbleW,
       align: isUser ? "right" : "left",
       characterSpacing: 1,
     });

  const bubbleY = doc.y + 3;
  bubblePath(doc, x, bubbleY, bubbleW, bubbleH, isUser ? [14, 14, 4, 14] : [14, 14, 14, 4]);
  doc.fillColor(isUser ? c.youBg : c.themBg)
     .strokeColor(isUser ? c.youBorder : c.themBorder)
     .lineWidth(0.8)
     .fillAndStroke();

  doc.fillColor(isUser ? c.youInk : c.themInk).font("Helvetica").fontSize(BUBBLE_FONT)
     .text(turn.content, x + BUBBLE_PAD_X, bubbleY + BUBBLE_PAD_Y, { width: innerW, lineGap: 1.6 });

  doc.x = PDF_MARGIN;
  doc.y = bubbleY + bubbleH + BUBBLE_GAP;
}

function renderCallPdf(doc, call, opts) {
  const o = opts || pdfOptions({});
  const c = o.palette;
  const contentW = doc.page.width - PDF_MARGIN * 2;

  paintPage(doc, c);
  doc.on("pageAdded", () => paintPage(doc, c));

  const date = new Date(Number(call.created_at) || Date.now());
  const dateText = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Masthead
  doc.fillColor(c.accent).font("Helvetica-Bold").fontSize(9)
     .text("SALES CAMP AI", PDF_MARGIN, doc.y, { characterSpacing: 2 });
  doc.fillColor(c.ink).font("Helvetica-Bold").fontSize(20)
     .text(call.label || "Sales call", { width: contentW, paragraphGap: 2 });
  doc.fillColor(c.muted).font("Helvetica").fontSize(10).text(dateText);

  // Who you were calling and what you were selling. No score here — the
  // number belongs with the debrief, and only when it's wanted at all.
  const meta = [
    ["Mode", call.mode === "setter" ? "Setter call" : "Closer call"],
    ["Prospect persona", call.persona],
    ["Section practised", call.section],
    ["Outcome", call.outcome],
    ["Length", (call.transcript || []).length + " messages"],
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");

  doc.moveDown(0.8);
  meta.forEach(([k, v]) => {
    doc.fillColor(c.muted).font("Helvetica").fontSize(9.5)
       .text(k + ": ", PDF_MARGIN, doc.y, { continued: true })
       .fillColor(c.ink).font("Helvetica-Bold").text(String(v));
  });

  // The conversation, as it looked on screen
  pdfHeading(doc, c, "The conversation");
  doc.moveDown(0.2);
  (call.transcript || []).forEach((turn) => drawBubble(doc, c, turn));

  const a = call.analysis;
  if (!a) {
    pdfHeading(doc, c, "Debrief");
    doc.fillColor(c.muted).font("Helvetica-Oblique").fontSize(10.5)
       .text("This call was ended without a review, so there is no debrief to include.",
             PDF_MARGIN, doc.y, { width: contentW });
    return;
  }

  pdfHeading(doc, c, "Debrief");
  if (o.showScore && Number.isFinite(a.callScore)) {
    doc.fillColor(c.accent).font("Helvetica-Bold").fontSize(26)
       .text(a.callScore + " / 10", PDF_MARGIN, doc.y, { paragraphGap: 2 });
  }
  if (a.headline) {
    doc.fillColor(c.ink).font("Helvetica-Bold").fontSize(12)
       .text(a.headline, PDF_MARGIN, doc.y, { width: contentW, paragraphGap: 8, lineGap: 2 });
  }
  if (a.rememberThis) {
    doc.fillColor(c.muted).font("Helvetica-Bold").fontSize(9)
       .text("REMEMBER THIS", PDF_MARGIN, doc.y, { characterSpacing: 1.1 });
    doc.fillColor(c.ink).font("Helvetica-Oblique").fontSize(11)
       .text(a.rememberThis, { width: contentW, paragraphGap: 10, lineGap: 2 });
  }

  // Setter-specific blocks
  if (a.bookingRationale || a.outcome) {
    pdfHeading(doc, c, "Outcome");
    if (a.outcome) {
      doc.fillColor(c.ink).font("Helvetica-Bold").fontSize(11)
         .text(String(a.outcome), PDF_MARGIN, doc.y, { width: contentW });
    }
    if (a.bookingRationale) {
      doc.fillColor(c.ink).font("Helvetica").fontSize(10.5)
         .text((a.booked ? (a.unearned ? "Booked, but unearned. " : "Closer call booked. ") : "No closer call booked. ") + a.bookingRationale,
               PDF_MARGIN, doc.y, { width: contentW, paragraphGap: 6, lineGap: 1.5 });
    }
  }

  if (Array.isArray(a.structure) && a.structure.length) {
    pdfHeading(doc, c, "Call structure");
    a.structure.forEach((s) => {
      if (doc.y > 700) pdfNewPage(doc, c);
      const status = (s.status || "partial").toUpperCase();
      doc.fillColor(c.ink).font("Helvetica-Bold").fontSize(10.5)
         .text((s.label || s.key || "") + "  ", PDF_MARGIN, doc.y, { width: contentW, continued: true })
         .fillColor(status === "HIT" ? c.good : status === "MISSED" ? c.bad : c.muted)
         .fontSize(8.5).text(status, { characterSpacing: 0.8 });
      if (s.note) {
        doc.fillColor(c.muted).font("Helvetica").fontSize(10)
           .text(s.note, PDF_MARGIN, doc.y, { width: contentW, paragraphGap: 6, lineGap: 1.5 });
      }
    });
  }

  if (Array.isArray(a.whatYouDidWell) && a.whatYouDidWell.length) {
    pdfHeading(doc, c, "What you did well");
    pdfBullets(doc, c, a.whatYouDidWell);
  }
  if (Array.isArray(a.thinkAboutNextTime) && a.thinkAboutNextTime.length) {
    pdfHeading(doc, c, "Think about this next time");
    pdfBullets(doc, c, a.thinkAboutNextTime);
  }
  if (a.principle && a.principle.name) {
    pdfHeading(doc, c, "Principle to revisit");
    doc.fillColor(c.ink).font("Helvetica-Bold").fontSize(10.5)
       .text(a.principle.name + ": ", PDF_MARGIN, doc.y, { width: contentW, continued: true })
       .font("Helvetica").text(a.principle.note || "");
  }
}

app.get("/api/calls/saved/:id/pdf", authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const call = await loadSavedCall(req.params.id, req.userId);
    if (!call) return res.status(404).json({ error: "Not found" });

    const safeName = (call.label || "sales-call")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "sales-call";
    const stamp = new Date(Number(call.created_at) || Date.now()).toISOString().slice(0, 10);

    // Theme and score visibility come from the trainee's download settings.
    const opts = pdfOptions(req.query);

    const doc = new PDFDocument({ size: "A4", margin: PDF_MARGIN, info: {
      Title: (call.label || "Sales call") + " — Sales Camp AI",
      Author: "Sales Camp AI",
    }});
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="sales-camp-${safeName}-${stamp}.pdf"`);
    doc.pipe(res);
    renderCallPdf(doc, call, opts);
    doc.end();
  } catch (err) {
    console.error("calls/saved pdf error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Could not build the PDF." });
  }
});

// ---------------------------------------------------------------------
// Lessons library (Sales Call modes only)
// ---------------------------------------------------------------------

app.get("/api/lessons", authMiddleware, async (req, res) => {
  if (!db) return res.json({ dbDisabled: true, lessons: [] });
  try {
    const rows = await db.query(
      `SELECT id, content, headline, source, persona, call_score, language, reviewed, pinned, created_at
       FROM lessons WHERE user_id=$1
       ORDER BY pinned DESC, created_at DESC`,
      [req.userId]
    );
    res.json({ lessons: rows.rows });
  } catch (err) {
    console.error("lessons list error:", err.message);
    res.status(500).json({ error: "Failed to load lessons." });
  }
});

app.patch("/api/lessons/:id", authMiddleware, async (req, res) => {
  if (!db) return res.status(400).json({ error: "Database not configured." });
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Bad id." });
  const fields = [];
  const values = [];
  if (typeof req.body.reviewed === "boolean") { values.push(req.body.reviewed); fields.push(`reviewed=$${values.length}`); }
  if (typeof req.body.pinned === "boolean")   { values.push(req.body.pinned);   fields.push(`pinned=$${values.length}`); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update." });
  values.push(id, req.userId);
  try {
    const result = await db.query(
      `UPDATE lessons SET ${fields.join(", ")} WHERE id=$${values.length - 1} AND user_id=$${values.length} RETURNING id`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: "Lesson not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("lessons update error:", err.message);
    res.status(500).json({ error: "Failed to update lesson." });
  }
});

app.delete("/api/lessons/:id", authMiddleware, async (req, res) => {
  if (!db) return res.status(400).json({ error: "Database not configured." });
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Bad id." });
  try {
    await db.query("DELETE FROM lessons WHERE id=$1 AND user_id=$2", [id, req.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error("lessons delete error:", err.message);
    res.status(500).json({ error: "Failed to delete lesson." });
  }
});

// ---------------------------------------------------------------------
// User status + Stripe checkout
// ---------------------------------------------------------------------

app.get("/api/user/status", authMiddleware, async (req, res) => {
  if (!db) return res.json({ tier: "free", sessionsUsed: 0, sessionsLimit: 5 });
  try {
    const row = await db.query(
      "SELECT email, tier, stripe_customer_id, payment_status FROM users WHERE id=$1",
      [req.userId]
    );
    if (!row.rows.length) return res.status(404).json({ error: "User not found" });
    const { email, tier, stripe_customer_id, payment_status } = row.rows[0];
    const isAdmin = ADMIN_EMAILS.includes(email);
    const effectiveTier  = isAdmin ? "power" : (tier || "free");
    const limit = isAdmin ? null : (TIER_LIMITS[effectiveTier] === Infinity ? null : TIER_LIMITS[effectiveTier]);
    res.json({
      tier: effectiveTier,
      sessionsUsed: await getMonthlySessionCount(req.userId),
      sessionsLimit: limit,
      email,
      // Drives the "Manage billing" button and the failed-payment warning in Settings.
      billable: !!stripe_customer_id,
      paymentStatus: payment_status || null,
    });
  } catch (err) {
    console.error("user/status error:", err.message);
    res.status(500).json({ error: "Failed to fetch user status" });
  }
});

// Persist the chosen conversation language on the user record so it follows
// them across devices. localStorage stays the fast local source of truth; this
// is the copy that survives a new browser. Best-effort: a failure here must
// never block training, so the client fires it and moves on.
app.put("/api/user/language", authMiddleware, async (req, res) => {
  const lang = req.body && req.body.language;
  if (!AI_LANGUAGES[lang]) return res.status(400).json({ error: "Unsupported language." });
  if (!db) return res.json({ ok: true, dbDisabled: true, language: lang });
  try {
    await db.query("UPDATE users SET language=$1 WHERE id=$2", [lang, req.userId]);
    res.json({ ok: true, language: lang });
  } catch (err) {
    console.error("user/language error:", err.message);
    res.status(500).json({ error: "Failed to save language." });
  }
});

// ---------------------------------------------------------------------
// GDPR: export + delete. The privacy notice promises both; until now they
// were manual, done by email. These make them self-serve.
// ---------------------------------------------------------------------

// Everything we hold about one account, in one JSON file. Ordered oldest-first
// inside each table so the file reads like a history rather than a dump.
app.get("/api/user/export", authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const me = await db.query(
      `SELECT id, email, name, picture, created_at, tier, language, payment_status
         FROM users WHERE id=$1`,
      [req.userId]
    );
    if (!me.rows.length) return res.status(404).json({ error: "User not found" });

    // The Stripe ids are deliberately left out — they are our billing plumbing,
    // not the user's data, and the invoices themselves live in Stripe's portal.
    const grab = (sql) => db.query(sql, [req.userId]).then((r) => r.rows);
    const [scores, skills, rivals, lessons, beliefs, savedCalls, callHistory] = await Promise.all([
      grab("SELECT delta, mode, date, created_at FROM scores WHERE user_id=$1 ORDER BY id"),
      grab("SELECT skill_id, unlocked_at FROM unlocked_skills WHERE user_id=$1 ORDER BY unlocked_at"),
      grab("SELECT rival_email, created_at FROM rivals WHERE user_id=$1 ORDER BY created_at"),
      grab("SELECT headline, content, source, persona, call_score, language, reviewed, pinned, created_at FROM lessons WHERE user_id=$1 ORDER BY id"),
      grab("SELECT belief, created_at FROM prospect_beliefs WHERE user_id=$1 ORDER BY id"),
      grab("SELECT mode, label, persona, section, outcome, score, transcript, analysis, created_at FROM saved_calls WHERE user_id=$1 ORDER BY id"),
      grab("SELECT mode, label, persona, section, outcome, skills, transcript, reviewed, created_at FROM call_history WHERE user_id=$1 ORDER BY id"),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      service: "Sales Camp AI",
      note: "Everything Sales Camp AI holds about this account. Timestamps are Unix milliseconds.",
      account: me.rows[0],
      scores,
      unlockedSkills: skills,
      competitors: rivals,
      lessons,
      prospectBeliefs: beliefs,
      savedCalls,
      callHistory,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sales-camp-ai-export-${stamp}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error("user/export error:", err.message);
    res.status(500).json({ error: "Could not build your export. Please try again." });
  }
});

// Irreversible. Cancels the Stripe subscription first — deleting the account
// while a subscription still bills would be the worst possible failure — then
// removes every row we hold. The Stripe *customer* record stays: paid invoices
// are accounting records Swedish law makes us keep for seven years, and the
// privacy notice says exactly that.
app.delete("/api/user", authMiddleware, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const row = await db.query(
      "SELECT stripe_subscription_id FROM users WHERE id=$1",
      [req.userId]
    );
    if (!row.rows.length) return res.status(404).json({ error: "User not found" });

    const subId = row.rows[0].stripe_subscription_id;
    if (subId && stripe) {
      try {
        await stripe.subscriptions.cancel(subId);
      } catch (err) {
        // Already cancelled at Stripe's end is fine; anything else must stop the
        // deletion, because we cannot leave a live subscription with no account.
        const code = err && err.code;
        if (code !== "resource_missing") {
          console.error("user delete: subscription cancel failed:", err.message);
          return res.status(502).json({
            error: "We could not cancel your subscription with Stripe, so nothing was deleted. Please try again or contact support.",
          });
        }
      }
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const table of ["scores", "unlocked_skills", "rivals", "lessons", "prospect_beliefs", "saved_calls", "call_history"]) {
        await client.query(`DELETE FROM ${table} WHERE user_id=$1`, [req.userId]);
      }
      await client.query("DELETE FROM users WHERE id=$1", [req.userId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    console.log(`Account deleted: ${req.userId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("user delete error:", err.message);
    res.status(500).json({ error: "Could not delete your account. Please try again or contact support." });
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

// Self-serve billing: cancel, switch plan, update the card, download invoices.
// Everything happens on Stripe's hosted page, so no card data ever reaches us.
// The portal must be enabled once in the Stripe dashboard
// (Settings -> Billing -> Customer portal) or this call throws.
app.post("/api/stripe/portal", authMiddleware, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured. Add STRIPE_SECRET_KEY to .env" });
  if (!db)     return res.status(503).json({ error: "Database not configured" });
  try {
    const row = await db.query("SELECT stripe_customer_id FROM users WHERE id=$1", [req.userId]);
    if (!row.rows.length) return res.status(404).json({ error: "User not found" });
    const customerId = row.rows[0].stripe_customer_id;
    // No customer record means they have never paid — there is nothing to manage.
    if (!customerId) return res.status(400).json({ error: "no_subscription" });
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("stripe/portal error:", err.message);
    res.status(500).json({ error: "Could not open the billing portal. Please try again." });
  }
});

// ---------------------------------------------------------------------
// Health + config info
// ---------------------------------------------------------------------

// Doubles as the uptime monitor's target, so it has to actually exercise the
// database rather than report that a DATABASE_URL string exists. A dead Neon
// branch is the failure most likely to take the product down while the process
// itself keeps answering, and that is precisely what a monitor should catch.
// Returns 503 when the database is configured but unreachable; the response
// body keeps its shape either way, because four client pages read it for
// `googleClientId` and `aiConfigured` without checking the status code.
// ---------------------------------------------------------------------
// Funnel. Everything here is answered from our own tables — no third-party
// analytics, nothing added to the processor list in the privacy notice.
//
// The number that matters is first-rep completion: of the people who start
// their very first rep, what fraction reach the grading. The debrief is
// where this product proves itself, so someone who quits before it never
// had a reason to come back. A low number means more traffic just burns
// money faster.
// ---------------------------------------------------------------------

async function adminOnly(req, res, next) {
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const row = await db.query("SELECT email FROM users WHERE id=$1", [req.userId]);
    if (!row.rows.length || !ADMIN_EMAILS.includes(row.rows[0].email)) {
      return res.status(403).json({ error: "Not authorised" });
    }
    next();
  } catch (e) {
    console.error("adminOnly error:", e.message);
    res.status(500).json({ error: "Could not verify access" });
  }
}

// A start counts as completed if a graded rep in the SAME mode lands within
// two hours of it. Matching on mode and a window rather than an id keeps
// this out of the request path entirely — no session id to thread through
// the client and no way for a metric to break a call.
const COMPLETION_WINDOW_MS = 2 * 60 * 60 * 1000;

app.get("/api/admin/funnel", authMiddleware, adminOnly, async (req, res) => {
  try {
    const [totals, firstRep, byMode, recent] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM users)                       AS accounts,
          (SELECT COUNT(DISTINCT user_id) FROM session_starts) AS started_any,
          (SELECT COUNT(DISTINCT user_id) FROM scores)         AS completed_any
      `),
      // One row per user: their first start, and whether a graded rep of the
      // same mode followed it inside the window.
      db.query(`
        WITH first_start AS (
          SELECT DISTINCT ON (user_id) user_id, mode, created_at
          FROM session_starts
          ORDER BY user_id, created_at ASC
        )
        SELECT
          COUNT(*)                                   AS cohort,
          COUNT(*) FILTER (WHERE s.hit IS NOT NULL)  AS completed
        FROM first_start f
        LEFT JOIN LATERAL (
          SELECT 1 AS hit FROM scores
          WHERE scores.user_id = f.user_id
            AND scores.mode = f.mode
            AND scores.created_at BETWEEN f.created_at AND f.created_at + $1::bigint
          LIMIT 1
        ) s ON TRUE
      `, [COMPLETION_WINDOW_MS]),
      db.query(`
        SELECT mode, COUNT(*) AS starts
        FROM session_starts GROUP BY mode ORDER BY starts DESC
      `),
      // Starts and completions side by side for the last 30 days, so the
      // rate isn't dominated by however long the table has been filling.
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM session_starts WHERE created_at > $1) AS starts,
          (SELECT COUNT(*) FROM scores         WHERE created_at > $1) AS completions
      `, [Date.now() - 30 * 24 * 60 * 60 * 1000]),
    ]);

    const t = totals.rows[0];
    const f = firstRep.rows[0];
    const r = recent.rows[0];
    const pct = (num, den) => (Number(den) > 0 ? Math.round((Number(num) / Number(den)) * 1000) / 10 : null);

    res.json({
      accounts:        Number(t.accounts),
      startedAny:      Number(t.started_any),
      completedAny:    Number(t.completed_any),
      // Of everyone with an account, how many ever began a rep.
      activationRate:  pct(t.started_any, t.accounts),
      firstRep: {
        cohort:        Number(f.cohort),
        completed:     Number(f.completed),
        completionRate: pct(f.completed, f.cohort),
      },
      last30Days: {
        starts:        Number(r.starts),
        completions:   Number(r.completions),
        completionRate: pct(r.completions, r.starts),
      },
      startsByMode: byMode.rows.map((row) => ({ mode: row.mode, starts: Number(row.starts) })),
      // session_starts only began recording on the deploy that added it, so
      // any figure spanning earlier data is misleading. Say so, don't hide it.
      note: "session_starts began recording 5 Sep 2026; rates before that date are not meaningful.",
    });
  } catch (err) {
    console.error("admin/funnel error:", err.message);
    res.status(500).json({ error: "Could not build the funnel." });
  }
});

app.get("/api/health", async (req, res) => {
  let dbOk = null;
  if (db) {
    try {
      // Bounded: a hung connection must not hold the monitor open until its
      // own timeout fires, or every check reads as a timeout instead of a 503.
      await Promise.race([
        db.query("SELECT 1"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("db ping timed out")), 3000)),
      ]);
      dbOk = true;
    } catch (err) {
      dbOk = false;
      console.error("health: database unreachable:", err.message);
    }
  }
  res.status(dbOk === false ? 503 : 200).json({
    ok: dbOk !== false,
    dbOk,
    aiConfigured: !!anthropic,
    authConfigured: !!(googleClient && db),
    // Whether SENTRY_DSN reached this environment — a boolean, never the DSN.
    // "Did the env var actually land in Vercel?" was otherwise unanswerable
    // from outside: a missing DSN silently disables the SDK and looks
    // identical to a healthy deploy with no errors.
    errorReportingConfigured: !!process.env.SENTRY_DSN,
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    model: SONNET,
  });
});

// ---------------------------------------------------------------------
// 404 + error handling (must be registered after every route)
// ---------------------------------------------------------------------

// Branded, self-contained and inlined: an error page that depends on the
// stylesheet loading is an error page that can fail the same way twice.
function errorPage(code, heading, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${code} — Sales Camp AI</title>
<style>
  /* Values, not tokens, on purpose — this page must render with no stylesheet. */
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0a0605; color: #f2ece9; text-align: center; padding: 24px;
    font-family: "DM Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .code { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #ff5a2e; margin-bottom: 18px; }
  h1 {
    font-family: "Syne", "DM Mono", sans-serif; font-weight: 700; letter-spacing: -0.02em;
    font-size: clamp(28px, 5vw, 42px); margin: 0 0 14px;
  }
  p { color: #9a857e; max-width: 440px; margin: 0 auto 30px; line-height: 1.6; font-size: 14px; }
  a {
    display: inline-block; padding: 12px 24px; text-decoration: none;
    background: #ff5a2e; color: #0a0605; font-weight: 500; font-size: 13px;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  a:hover { background: #ff7a54; }
</style>
</head>
<body>
  <main>
    <div class="code">${code} · Sales Camp AI</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <a href="/home">Back to training</a>
  </main>
</body>
</html>`;
}

app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.status(404).type("html").send(
    errorPage(404, "This page went cold.", "The link is broken or the page has moved. Your training is still where you left it.")
  );
});

// Four arguments — Express identifies an error handler by arity, so `next` must
// stay even though it is unused.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Body-parser and friends set a 4xx on the error they throw — a malformed
  // JSON body is a bad request, not a crash. Answer with the status they
  // chose and keep it out of the log, or every junk request becomes an alert.
  const status = (err && (err.status || err.statusCode)) || 500;
  if (status >= 400 && status < 500) {
    if (res.headersSent) return;
    if (req.path.startsWith("/api/")) return res.status(status).json({ error: "Bad request." });
    return res.status(status).type("html").send(
      errorPage(status, "That request didn't make sense.", "Something about the request was malformed. Try again from the page you came from.")
    );
  }

  // Passing the Error itself (not err.stack) matters twice over: node prints
  // the full stack to the Vercel log, and Sentry's console integration sees
  // an Error argument and reports it as a real exception rather than a
  // flattened string, so crashes group properly.
  console.error("Unhandled error:", err);
  // Logged first: a crash that happens after the response has started is
  // exactly the kind we most need to see, even though we can no longer answer.
  if (res.headersSent) return;
  if (req.path.startsWith("/api/")) return res.status(500).json({ error: "Something went wrong on our end." });
  res.status(500).type("html").send(
    errorPage(500, "Something broke on our end.", "That one is on us, not you. Try again in a moment — nothing you have done has been lost.")
  );
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sales Camp AI running at http://localhost:${PORT}`);
    if (!anthropic) console.warn("WARNING: ANTHROPIC_API_KEY not set — AI features disabled.");
    if (!db)         console.warn("WARNING: DATABASE_URL not set — user scores use localStorage only.");
    if (!googleClient) console.warn("WARNING: GOOGLE_CLIENT_ID not set — Google login disabled.");
  });
}

module.exports = app;
