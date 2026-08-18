# Sales Call Mode Revamp — Reconciled Roadmap

**Project:** Sales Camp Games (sales_training_website)
**Scope:** Setter/Closer split, persona system, points removal, Lessons system
**Status:** Reconciled against the actual codebase (2026-08-17). This supersedes `new roadmap.md`.

> Reconciliation = the original roadmap was written before Claude could see the code, so its Fas 0 questions ("DB or client-side?", "does a persona system exist?") were guesses. They're now answered from the source, and the phases below are adjusted to fit what's really there.

---

## Ground truth (answers to the original Fas 0 questions)

- **Storage: Postgres (Neon) + Google auth + JWT — not client-side.** Tables today: `users`, `scores`, `unlocked_skills`, `rivals`, `generated_cache` (`server.js`). Scores post to `/api/scores` when signed in, fall back to `localStorage` when not (`score.js`). → Lessons + persona history get a **new `lessons` table**, same pattern.
- **DB/AI/auth run only on the Vercel deploy**, not locally. All end-to-end testing happens on the deploy.
- **A selection system already exists** in Sales Call: **scenario → section → personality** (`sales-call.js`). But the current "personalities" are *behavioral styles* (Friendly, Busy, Analytical, Guarded…), not the *background personas* this roadmap wants. Decision below: **replace** them.
- **The call already generates a rich prospect profile** — `hiddenBelief` + a 3–5 item `limitingBeliefs` bank (`/api/call/start`). Persona data slots into this existing plumbing instead of being improvised by the model.
- **`/api/call/end` already produces lesson-shaped output** (`rememberThis`, `thinkAboutNextTime`, `whatYouDidWell`, `principle`) — currently shown once and discarded. Lessons = persist this + a library page.

## Decisions locked

- **Points:** remove everything user-facing. Keep the `scores` table alive purely as a **silent per-session billing meter** (tier limits count its rows). Billing/Stripe untouched — adjusted later. The user will design a simpler scoring method in the future; not now.
- **Rivals leaderboard:** **parked, not deleted** — hidden behind a feature flag with the `/api/rivals` routes and `rivals` table left intact, so it can be switched back on with one boolean later. (The pure points cosmetics below are deleted outright, since the Lessons system replaces them and git retains the history regardless.)
- **Tier gating:** **same for both** Setter and Closer — both count toward the one monthly session limit, no mode-aware gating.
- **Personas:** the 5 background personas **replace** the 6 behavioral personalities. One picker.
- **Language:** all product copy in English (persona names, labels, prompts, outcome states).

---

## Phase 1 — Mode choice: Setter vs Closer

Clicking "Sales Call Mode" no longer drops straight into a call — it shows a choice: **Setter Call** or **Closer Call**. New first step before the existing scenario → section → persona flow. No gating difference between modes.

**Fits:** low risk, purely additive to `sales-call.js` / `sales-call.html`.

## Phase 1b — Background-persona system (replaces behavioral personalities)

Move persona data into its **own file** (`public/js/personas.js` or similar), one object per archetype:
economic situation, primary pain point, objection style, decision tempo, what would make them say yes.

At the start of a Setter or Closer call the user picks a persona, or **"Randomize"** (default, so you don't only train against your favourite). The chosen persona is injected into the existing `/api/call/start` prompt in place of the current improvised profile, and passed through `/api/call/message` like `personality` is today.

**The five archetypes (English):**

| Persona | Core resistance | Typical objections |
|---|---|---|
| **Unemployed** | Needs income but budget-sensitive; anxious about paying with no money coming in | Price/payment plan, "will this really work for me", scarred by past "get rich quick" offers |
| **Beginner** | Motivated but unsure of their own ability | "Do I have the right experience", price-sensitive but future-focused |
| **Worker** | Has security; main resistance is time and risk | "Can I fit this around a 9–5", "dare I leave the safe thing", partner/family often involved |
| **Business Owner** | Already has status/income; resistance is rarely price | "Is it worth my time", "I can already sell", fast decisions but wants proof, not a generic pitch |
| **Retiree** | Fixed/limited income, unwilling to gamble savings | Risk ("can I afford to lose this"), tech uncertainty in a new field, "am I too old for this" — but very loyal once they feel safe and seen |

Each persona carries a *different type* of resistance, not surface detail differences — that's what fixes the objection-sameness problem. Persona is also stored on each Lesson (Phase 5) so strengths/weaknesses per persona are visible.

## Phase 2 — Closer Mode (unchanged behavior)

This IS the current call flow (One Call Close phases: Opening → Situation → Problem → Consequences → Purchase Decisions → Presentation → Objection Handling → Close). No functional change — just wired into the new mode choice + persona picker. Regression-test after the mode choice lands.

## Phase 3 — Setter Mode (new)

- **Purpose:** qualify a warm lead for the coaching program → on qualification the outcome is "book closer call" (just the status/CTA, not real booking).
- **Offer is fixed:** the TRIAGE script is a **remote-setter recruitment** pitch ("responded to a video about becoming a remote setter"). Unlike Closer mode, Setter has **no scenario picker** — the scenario is always this pitch. The persona picker is the main variable.
- **The TRIAGE script is the setter's (trainee's) playbook, never fed to the AI prospect.** It drives two things only: (a) the coaching/analysis that grades how well the trainee followed the structure, and (b) the Qualified/Not-Qualified outcome (did they hit both objectives — understand the pain AND position the closer call). The AI prospect just plays a challenging persona and resists, exactly like Closer mode.
- Script structure to grade against: Soft Intro + Frame → Shot Across the Bow (Intent) → Situation → Problem → Impact → Solution Awareness → Goals → Impact → Transition → Pitch the closing call. Two objectives: understand problem/pain; position a 2nd call with a closer as the solution.
- Shorter, more checklist-style than Closer, fewer objection types. Own AI system prompt + persona integration, separate from Closer. Fork the existing `/api/call/*` routes as the template.
- **Outcome states:** Qualified / Not Qualified, with a clear rationale shown to the user. Success = the prospect books the closer call.
- **Source material:** `TRIAGE SCRIPT.pdf` (present in the project folder).

### Booking detection (the "did they get closed?" signal)

Goal: recognize live when the trainee books the prospect on the closer call, **without false positives.**

- **Two-sided rule:** "booked" requires BOTH (a) the setter actually pitched/asked for the closer call, and (b) the prospect firmly accepts. One side alone never triggers it.
- **Bar = firm yes + agreed time slot.** The prospect must accept a specific time ("tomorrow at 3 works"), matching the script's slot offer. Soft interest ("sounds good, tell me more") does NOT count.
- **Detection lives with the prospect model, as a structured flag** — `/api/call/message` returns `{ reply, booking: "none" | "soft" | "confirmed" }`. The prospect sets `"confirmed"` only when, in character, it has accepted a specific slot. Keeps the flag consistent with what it actually said, and avoids a separate judge model disagreeing with the roleplay. The persona is told to resist realistically and only accept when earned.
- **Two-stage guard against a single fuzzy line:** `"confirmed"` flips the call into a provisional Booked state (live recognition). The end-of-call analysis then re-reads the full transcript and validates it was a real booking before the final Qualified/Booked stamp; if unsupported, it's downgraded with a reason.
- **Unearned closes: book it, but flag it.** If an easy prospect gives a firm yes + time without the setter earning it (no pain uncovered, structure skipped), it still counts as booked so the flow completes, but the debrief explicitly calls it out as lucky/unearned.

## Phase 4 — Remove the points system (user-facing only)

**Corrected from the original roadmap — this is NOT a clean wipe.** The `scores` table is load-bearing for billing (session limits count its rows in `checkSessionLimit` / `getMonthlySessionCount`). So:

**Keep (as silent billing meter):**
- `scores` table and the `/api/scores` insert — keep logging one row per completed session so the monthly limit keeps counting. `delta` becomes unused/0.
- `checkSessionLimit`, `TIER_LIMITS`, tier/Stripe machinery — untouched.

**Remove (everything the user sees as "points"):**
- Score pills in every page topbar (`score-pill`, `data-scg-today`, `data-scg-total`).
- Home dashboard: Level/XP bar, "Total points", "Today", "Rounds" (`home.html`, `score.js` render funcs).
- "+X points added to your score" and `scoreDelta` display in the call debrief (`sales-call.js` `renderSummary`).
- Score display in Objection Battle and Pattern Recognition summaries (`SCG.addScore` call sites).
- **Rivals / leaderboard** feature end-to-end: `/api/rivals` routes, `buildLeaderboard`, `scoreSummaryForUserId`, `rivals` table, and its UI in `home.js` / `home.html`.
- `/api/scores/summary` if nothing else consumes it after the dashboard is gone.

**Touch list (points appears in ~12 files):** `score.js`, `sales-call.js`, `objection-battle.js`, `pattern-recognition.js`, `home.js`, `skill-map.js`, `home.html`, `index.html`, `sales-call.html`, `objection-battle.html`, `pattern-recognition.html`, `skill-map.html`, plus `style.css` (pill/dashboard styles) and `server.js` (rivals + scores routes).

## Phase 5 — Build the Lessons system

**Scope:** Sales Call Mode only (Setter + Closer) — not Objection Battle or Pattern Recognition.

- **Data model:** new `lessons` table — content, source (Setter/Closer), persona, timestamp, `reviewed` flag, `pinned` flag, `user_id`.
- **Generation:** reuse the existing `/api/call/end` output (`rememberThis`, `thinkAboutNextTime`, etc.) — persist it as one or more concrete lessons instead of showing points. The generation half largely exists already.
- **Lessons library** (new page/section): list all lessons, mark reviewed, pin as important, filter by pinned / unread / persona.

## Phase 6 — QA

- Setter end-to-end against the TRIAGE script, all five personas.
- Closer unchanged, all five personas.
- Lessons survive a fresh login (DB-backed, so they should).
- No user-facing points references left across the ~12 files — **and** billing still enforces limits after the scores table was reduced to a silent meter.

## Phase 7 — Rebrand

Deferred, out of scope here.

---

## Still needed from you

1. ~~TRIAGE SCRIPT.pdf~~ — provided and read.
2. Any tweaks to the five English persona descriptions above.
3. GitHub token / Pro upgrade when it's time to push to `main`.
