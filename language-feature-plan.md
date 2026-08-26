# Language selection (i18n) — build plan

Goal: let a user pick their language. Because the app is mostly **AI-generated**, the
valuable half (training *in* their language) is a tiny change; the tedious half is
translating the fixed UI chrome. Build in phases.

Two layers:
- **AI-generated content** (roleplay, debrief/analysis, pattern recognition, objection
  battle, lessons) → becomes the chosen language just by injecting one instruction into
  the prompt. This is the substance of the product.
- **Static UI chrome** (buttons, labels, nav, marketing copy) → hardcoded across ~8 HTML +
  ~15 JS files; needs a real extraction/translation pass.

---

## Phase 1 — Train in the chosen language (small, high value)

**1. Language selector in Settings**
- Mirror the existing Theme toggle in `public/settings.html` (Appearance section) and
  `public/js/theme.js` storage pattern (`localStorage`, key e.g. `scg_lang`).
- Default `en`. Launch set TBD (English + Swedish first is the likely call).
- Also persist to the user record later (Phase 2) so it syncs across devices.

**2. Inject language into every AI endpoint** (`server.js`)
Add a `language` field from the client and put "Conduct everything in {language}" into the
prompt. Endpoints:
- `/api/call/start` (1058), `/api/call/message` (1117), `/api/call/end` (1208)
- `/api/setter/start` (1395), `/api/setter/message` (1446), `/api/setter/end` (1528)
- `/api/objection/new` (753), `/api/objection/feedback` (798)
- `/api/pattern/new` (873), `/api/pattern/feedback` (936)
- Simplest: add a `LANGUAGE_RULE` string (like `STYLE_RULES`) and append per call. The
  `BASE_SYSTEM` study notes stay English — the model translates concepts fine.

**3. Cache fix (must-do or the feature looks broken)**
- `patternCache` / objection cache are language-blind and shared across users
  (`/api/pattern/new` ~878). A non-English user would get served English cached items ~70%
  of the time. Fix: key the cache by language, or bypass cache for non-English.

**4. Concept-name policy (decide)**
- Prompts tell the AI to name principles ("Authority", "Limiting Beliefs", etc.). Decide
  whether those term-of-art names translate or stay English. Lean: translate for a fully
  native feel.

---

## Lesson language + flag (the concrete ask)

Lessons are generated from each call's debrief, so a lesson inherits **that call's**
language. A Swedish call → Swedish lesson; English call → English lesson; the list ends up
mixed-language, one entry per call, frozen in its original language (no retro-translate).

Show a small flag on each lesson card so you can eye-scan the list:
- **Schema:** add a `language` column to the `lessons` table (`server.js:70`).
- **Store it:** thread `language` into `saveLesson` (`server.js:181`) and its two callers
  (`server.js:1313`, `server.js:1642`), from the call's language.
- **Render:** add a flag to the badges row in `public/js/lessons.js` (~line 130, next to
  the source/persona badges).
- **Flag style — DECIDE:** small inline **SVG** flags (recommended: render identically on
  Windows) vs a text pill "SV"/"EN". Windows browsers do NOT render 🇸🇪/🇬🇧 emoji (they show
  "SE"/"GB" letters).
- **Existing lessons:** no stored language → show a neutral/unknown flag; they won't
  retro-translate.

---

## Phase 2 — Translate the UI chrome (tedious, not hard)

- Build a tiny i18n helper: `t(key)` + per-locale dicts (`en.js`, `sv.js`, …), driven by
  `data-i18n` attributes or JS lookups. ~half a day of scaffolding.
- Extract every hardcoded string across the HTML + JS into the dicts (a few hundred
  strings). Ongoing per language.
- Cover: nav/app-shell, Settings, Lessons library shell, home, landing marketing copy.
- Persist chosen language to the user record so it follows them across devices.

---

## Decisions made (2026-08-26)
1. **Launch languages** — DONE: English + Swedish + Spanish, German, French, Norwegian,
   Danish, Finnish, Italian, Dutch, Portuguese (11). Adding more is one row in the `LANGS`
   array in `public/js/lang.js` + `AI_LANGUAGES` in `server.js`. UI chrome stays English.
2. **Flag style** — DONE: inline SVG (hand-rolled, geometric) so they render identically on
   Windows. `SCG_LANG.flagSvg(code)`; neutral "?" flag for lessons with no stored language.
3. **Concept-name policy** — DECIDED: translate. `langRule()` tells the AI to translate the
   principle names naturally into the target language.
4. **Skill map** — still open, out of scope for this build (roots stay pre-discovered).

## Caveats to remember
- Shared pattern/objection cache is language-blind (see Phase 1.3).
- Lesson list becomes mixed-language over time (expected).
- Coaching is grounded in English study notes; AI translates concepts on the fly, lesson
  content comes out in the target language, but the notes themselves stay English.
- This deliberately reverses the previous "English-only product" stance.

## Phase 1 shipped (2026-08-26)
- **`public/js/lang.js`** (new) — `SCG_LANG` module: stores `scg_lang` in localStorage,
  builds the Settings `<select>`, renders per-lesson SVG flags, and wraps `fetch` to inject
  `language` into every `/api` POST body (so no call site opts in; respects an explicit
  `language` already in the body). Loaded in `<head>` on the 3 AI pages + settings + lessons.
- **Settings selector** — `settings.html` Appearance section + `settings.js` mount, mirroring
  the theme toggle. Styled via `.settings-select` in `style.css`.
- **Server prompt injection** — `langRule(language)` + `AI_LANGUAGES` map in `server.js`;
  `askClaude()` takes a 4th `language` arg and appends the rule to the system prompt. Threaded
  through all AI endpoints (objection/pattern new+feedback, call & setter start/message/end).
  The two inline `messages.create` calls (call/setter message) append `langRule` directly.
  Skill-ID-only helper (`discoverSkillsFromTranscript`) intentionally left English.
- **Cache fix (Phase 1.3)** — objection & pattern shared caches are English-only now:
  non-English requests bypass both the read and the write, so no English item is ever served.
- **Lesson flags** — `lessons.language` column (+ `ALTER … ADD COLUMN IF NOT EXISTS`),
  threaded through `saveLesson` and both `/end` callers; GET returns it; `lessons.js` renders
  the flag as the first badge. Pre-existing lessons show the neutral "?" flag.
- **Verified locally** (AI/DB off): selector renders 11 langs + persists; all 12 flags render;
  fetch wrapper injects the stored language, preserves other fields, and respects an explicit
  one — proven via a temporary echo route (since removed). AI *output* language needs the
  Vercel deploy to confirm.

## Already done (session 2026-08-25)
- Mascot figure cropped to a **bust** (torso and up, no legs) — `public/js/mascot.js`,
  `public/css/style.css` (`.mascot-stage` height).
- Skill tree **locks removed**: two-state model (discovered / not yet discovered), no lock
  icons, no gating language — `public/js/skill-map.js`, `public/pages/skill-map.html`.
