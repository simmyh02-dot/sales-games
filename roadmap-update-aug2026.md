# Sales Trainer — Update Roadmap (Aug 2026)

Consolidated from the current conversation. Seven workstreams.

---

## 1. Merge offers across both modes
- **One shared offer list** used by Closer *and* Setter (today they're separate:
  Closer `data-scenario`, Setter `data-offer`).
- Combine both lists, dedup, and **merge `Remote Setter` + `Remote Closer` →
  `High Ticket Sales`**. Merge `Custom Scenario` + `Custom Offer` → single `Custom`.
- Final list: Fitness Coach · Business Coach · Agency Offer · E-commerce Offer ·
  SaaS · High Ticket Sales · Affiliate Marketing · Dropshipping ·
  Coaching Certification · Custom.
- **One identical panel + neutral label** for both modes (`// Choose an offer`).
  Closer then → section panel; Setter then → persona panel.
- **Remove the `<small>` explanations** under every offer button. Names only.
- Files: `public/pages/sales-call.html` (collapse the two panels into one),
  `public/js/sales-call.js` (single `selectedOffer`, branch on mode for "Next"),
  `server.js` (`SETTER_OFFERS` re-keyed to new labels as income-opportunity
  framings; `"Custom Offer"`→`"Custom"`; closer `"Custom Scenario"`→`"Custom"`).

## 2. Shorten persona card subtitles
- `sales-call.js:214` jams `primaryPain` + `objectionStyle` (two sentences) under
  each name. Add a short `blurb` (~6–9 words) per persona in `personas.js`, render
  that instead.

## 3. Prospect talking-style randomness  *(mainly Setter, applied to both)*
- New axis **separate from persona**: persona = what they believe; comm-style =
  how they talk. Weighted server-side table, biased toward short/guarded so
  terse is the norm and the info-dump is the exception.
- Styles: Guarded & short · Distracted/busy · Tired/low-energy · Blunt/skeptical ·
  Warm but reserved · Talkative (low weight).
- Picked at `/start`, attached to the returned `prospect` JSON (round-trips on
  every `/message` automatically), injected as a `STYLE` block that **replaces**
  the fixed "1-3 sentences" line, anchored "this is HOW you talk, not WHAT you
  believe." Opening line reflects it (that "surprised you called" feel).
- Hidden from pre-call UI. Files: `server.js` (both start + message handlers,
  closer and setter).

## 4. BUG — analysis never saved a lesson
- Root cause: `endCall`'s fetch (`sales-call.js:498`) sends **no Authorization
  header** (unlike `quitCall`). So `optionalAuth` leaves `req.userId` undefined on
  `/api/call/end` + `/api/setter/end` → `saveLesson`, `saveCallHistory`, and
  `autoUnlock` all silently skip for logged-in users.
- Fix: send the bearer token on the `endCall` fetch. Restores lessons + call
  history + skill unlocks on review. **After every analysis → lesson added.**

## 5. BUG / feature — success auto-trigger ends the call
- Today nothing auto-ends. Setter booking only escalates an indicator.
- Setter: when `booking === "confirmed"`, auto-run the analyze/end flow (call ends
  + auto-analysis fires) with a success beat.
- Closer: add a **`closed` success signal** to `/api/call/message` (prospect
  agrees to buy), surface it client-side, and auto-run the same end flow.

## 6. New points system  *(remove the old one)*
- Old `scoreDelta` (-15..15 daily) mechanics are dead client-side (`score.js`
  posts `delta:0`). Remove the vestige, keep the `scores` table + `/api/scores`.
- New awards (vary by performance via `callScore`):
  - **Setter close ≈ 15** (scaled; full only when booked & earned).
  - **Closer close ≈ 60** (scaled by callScore).
  - **Pattern Recognition** — small fixed award on correct.
  - **Objection Battle** — small fixed award per graded round.
- Server computes `pointsAwarded` in the end handlers (authoritative, now that
  auth header is fixed) and inserts the real delta; returns it for display.
- `score.js` `addScore` posts real deltas again; debrief cards + mini-game cards
  show points earned. Files: `server.js`, `score.js`, `sales-call.js`,
  `pattern-recognition.js`, `objection-battle.js`.

## 7. Pixel-art prospect mascot beside the chat
- Per `Sales Mascot.dc.html` spec: 16×28 grid, 6px cells (96×168 sprite), drawn as
  positioned divs / crisp SVG rects (no box-shadow). 4 variants man/woman ×
  brown/blonde; man = cap+beard+pants, woman = long hair+bow+skirt.
- States driven by real call state: idle (waiting) · listening (user typing) ·
  thinking (awaiting AI) · talking (AI reply, with mouth flap). Ground shadow
  "breathes," accent = outfit color.
- Mount to the **left of the chat window** in the call panel. Variant from
  prospect name auto-detect (female-name list) + random hair.
- Files: new `public/js/mascot.js`, styles in `public/css/style.css`, mount in
  `sales-call.html` + wire state from `sales-call.js`.

---
### Build order
2 → 1 → 4 → 5 → 3 → 6 → 7  (quick wins & bug fixes first, mascot last).
