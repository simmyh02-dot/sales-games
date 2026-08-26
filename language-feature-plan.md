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

## DECISION REVERSED (2026-08-26, after seeing it live): UI stays English

Phase 1 shipped and works on the deploy. Seeing the translated UI in production, the call
was that a half-Swedish interface reads *less* clean than an English one. So:

- **The product is English-only in its interface.** Only the **conversation** language is
  selectable — roleplays, feedback, debriefs and saved lessons.
- **Phase 2 (the `data-i18n` / `SCG_I18N` layer) has been fully reverted.**
  `public/js/i18n.js` is deleted and every `data-i18n` attribute removed. Commits 385f65e, 1c33880 and bee4334 are
  effectively undone; Phase 1 (75145bd) stands untouched.
- **Do not rebuild the UI i18n layer** unless this decision is explicitly revisited.

What replaced it:
- Settings now has a dedicated **Language** section (was a cramped second row under
  Appearance), labelled "Conversation language" and stating the interface stays English.
- A subtle pre-call reminder — **"This call will be in {Language}."** — sits on the persona
  screen, the last step before both Setter and Closer calls (`#call-lang-note`).
- Kept from the reverted work: the lesson score bug fix (`/100` -> `/10`, since
  `call_score` is 0-10 server-side).

The sections below are kept as a record of what was built and why it was dropped.

## Phase 2 — Translate the UI chrome

**All UI surfaces DONE (2026-08-26).** App chrome, the three mode pages, skill-map chrome
and the landing page are converted. Remaining: the **skill-tree node content** and
**persona labels/blurbs** (both open decisions, see below), the **9 untranslated locales**,
and persisting the chosen language to the user record so it follows across devices.

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

## Phase 2 shipped — scaffolding + core chrome (2026-08-26)
- **`public/js/i18n.js`** (new) — `SCG_I18N`: `t(key, vars)` with `{placeholder}`
  interpolation, plus a DOM driver for `data-i18n` (text), `data-i18n-html` (strings with
  inline markup, from our dicts only), and `data-i18n-attr="placeholder:key;title:key"`.
  Applies on load and sets `<html lang>`.
- **Fallback chain:** active locale -> English -> the key itself. A partial dict degrades
  to English instead of rendering blanks; a truly missing key shows the key (obvious in dev).
- **Live switching:** changing the Settings picker calls `SCG_I18N.refresh()`, which
  re-applies the DOM and fires a `scg:languagechange` event. `app-shell.js` rebuilds the
  app-bar (its labels are baked into innerHTML), and `lessons.js` / `settings.js` re-render
  their generated sections. No reload needed.
- **Surfaces converted:** app-bar + full user menu, home (hero, all 5 mode cards), Settings
  (every section incl. leaderboard/plan strings), Lessons (shell, filters, empty states,
  card badges + action tooltips), and the shared pricing modal.
- **Dicts:** English (source of truth) + Swedish, ~110 keys each. The other 9 locales are
  empty objects that fall back to English — filling one in is the only step to add a language.
- **Also fixed in passing:** lesson cards rendered the call score as `/100`, but `call_score`
  is 0-10 server-side — now `/10`. Lesson dates now format in the chosen locale.
- **Verified locally** on the real pages (minted a dev JWT to pass auth-guard): EN renders,
  switching to SV flips static labels, JS-rendered strings, interpolated values and the
  rebuilt app-bar with no reload; language persists across navigation; an empty locale (de)
  falls back to English; round-trip back to EN works.

## Phase 2 part 2 — the three mode pages (2026-08-26)
- **Objection Battle, Pattern Recognition, Sales Call** fully converted: page headers,
  pre-start setup screens, difficulty/timer/level pickers, live-call bar, chat placeholders,
  all JS-built cards, debriefs (both Closer and Setter), and every error/status line.
- **Shared keys** pulled into `common.*` (difficulty, timer, on/off, principle, loading,
  back/next, AI-not-connected, points pill, limit-reached, AI-unreachable, nothing-notable)
  so the three pages don't each carry their own copy.
- **Identifier vs label split — important:** offer and call-section names are English
  identifiers that get sent to the AI. They stay on the `data-offer` / `data-section`
  attributes, and only the *display* text is translated (`offerLabel()` / `sectionLabel()`
  in `sales-call.js`). Verified in the browser that the wire values are still English while
  the UI reads Swedish. Same pattern for the server's English enums (`Qualified`,
  `hit/partial/missed`, booking levels) — translated at render time only.
- Industry terms that stay English in Swedish sales usage (SaaS, Dropshipping) are
  deliberately left untranslated in the Swedish dict.
- **Verified locally:** all three pages render fully in Swedish, including JS-built round /
  exercise cards and the AI-error path, and `data-i18n-html` keeps the `<code>` tags in the
  "AI not connected" notice.

## Phase 2 part 3 — skill-map + landing (2026-08-26)
- **Skill Tree chrome** converted: page header, the 8 discipline filter buttons, search
  placeholder, legend, zoom hint, remembered-calls strip and its chips, side panel state
  badges and "Example lines" heading, and the SVG tree titles/subtitles.
- **Landing page** fully converted (hero, live demo card, the three feature blocks, the
  whole pricing table, sign-in overlay) and now loads `lang.js` + `i18n.js`.
- **Line drawn on content vs chrome:** discipline *names* are treated as navigation and are
  translated; the ~150 skill-tree **node** labels/descriptions/example lines are NOT — they
  are the methodology itself, same status as the server-side study notes. Persona
  labels/blurbs in `personas.js` are likewise still English. Both are open decisions.

### Bug found by verification (worth remembering)
Adding a `t()` i18n helper to `skill-map.js` **shadowed** the `t` parameter that the file
already uses for tree objects (`trees.forEach(t => ...)`, `linkPath(s, t)`). Calling
`t("map.skillTreeSub")` threw `t is not a function` and aborted the render **after one
tree** — the page looked broken but the JS still parsed, so `node --check` passed and only
the browser check caught it. Fixed by renaming the helper to `i18n()` in that file.
**Lesson:** don't name the i18n helper `t` in files that already use `t` as a local.
(Also: `read_console_messages` keeps a per-tab buffer across reloads and server restarts —
a fixed error keeps reappearing. Confirm with a fresh in-page error trap, not the buffer.)

## Already done (session 2026-08-25)
- Mascot figure cropped to a **bust** (torso and up, no legs) — `public/js/mascot.js`,
  `public/css/style.css` (`.mascot-stage` height).
- Skill tree **locks removed**: two-state model (discovered / not yet discovered), no lock
  icons, no gating language — `public/js/skill-map.js`, `public/pages/skill-map.html`.
