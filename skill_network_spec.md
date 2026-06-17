# Sales Skill Network — Build Brief for Claude Code

**Goal:** A new feature for the sales-training site: a large, interactive *skill network* (force-directed graph) that shows every sales concept from the training material and how they connect. Visually it should resemble an "SoC concept map" — a dense central core with large hub nodes, and color-coded satellite clusters radiating out. Thin grey lines link related nodes so it becomes a *net*, not a tree.

> This document describes **how it should look and behave**, plus all the data (nodes + connections). It deliberately contains no code — you (Claude Code) choose the implementation.

---

## 1. The visual feel

- **Layout:** force-directed / physics-based graph (nodes repel each other, edges pull together). Large hub nodes naturally settle in the middle, small detail nodes on the periphery.
- **Node size = weight/centrality.** Three size tiers (see §4). Hub nodes are large circles with text; detail nodes are small.
- **Color = category** (see §3). Each category is a cluster of the same color.
- **Edges:** thin, light grey, semi-transparent. Cross-links (connections between different categories) can be a bit darker/dashed so you can see them crossing clusters.
- **Background nodes:** less important details render faded (low opacity) until you hover/search — exactly like the pale grey words in the reference image. This adds depth without overwhelming.
- **Labels:** in English (match the rest of the app). Keep framework names where the material uses them (e.g. "Future pacing", "CDR", "ABC").
- **Theme:** dark mode to match the app's dark mode. The color clusters should "glow" slightly against the dark background.

Think: you open the feature, see the whole sales methodology as a living map, and can zoom/drag around inside it.

---

## 2. The overall structure (core vs satellites)

- **Central core (largest, densest):** the call flow itself (the One-Call Close spine) + objection handling. This is the "soc" node in the image — everything else hangs off it.
- **Apex satellite (top of the pyramid):** Identity. Highest leverage, sits slightly apart and "above" — like the pink "design" node in the image.
- **Diagnostic satellite:** Language (the tells).
- **Delivery halo:** Tonality — connects to *every* phase in the spine (a layer that sits over everything).
- **Foundation anchors:** Authority, Funnel, "Use their words", Seller's identity — small but central anchor nodes at the base.

---

## 3. Categories & colors

| # | Category | Color (suggestion) | Role |
|---|----------|--------------------|------|
| A | **Call Structure (the spine)** | Teal / cyan | The funnel flow, phase by phase. The central core. |
| B | **Discovery & Pain** | Orange | Needs, problem vs symptom, probing. |
| C | **Beliefs & Reframes** | Green | Limiting beliefs, pre-handling, the reframe steps. |
| D | **Objection Handling** | Red/grey (the big cluster) | Smoke screens, real objections, fear. |
| E | **Identity** | Pink/magenta (apex) | Logical levels, identity gap. Highest leverage. |
| F | **Language Diagnostics** | Purple | Tells that reveal they're "bending the line". |
| G | **Tonality & Delivery** | Gold/yellow (halo) | The 5 tones, tempo, perception/intention/value. |
| H | **Fundamentals** | Dark blue/grey (anchor) | Authority, funnel, their words, seller identity. |

---

## 4. Size tiers

- **Tier 1 — Hubs (largest):** `One-Call Close (the spine)`, `Problem/Pain`, `Objections`, `Limiting beliefs`, `Identity`.
- **Tier 2 — Frameworks/Phases (medium):** all call phases, named frameworks (CDR, ABC, Identity gap, 4-step reframe, the probing ladder, etc.).
- **Tier 3 — Details/Scripts (smallest):** specific reframes, analogies, individual lines.

---

## 5. NODES (per category)

Format: `id` — **Label** (tier) — short description.

### A. Call Structure — the spine (teal)
- `spine` — **One-Call Close** (T1) — the whole sales process, the backbone everything hangs off.
- `opening` — **The Opening** (T2) — why they're here, what they want help with, why, set frame.
- `setframe` — **Set frame (small agenda)** (T3) — "see where you are, where you want to be, then maybe next steps".
- `situation` — **Situation** (T2) — what they're doing now, how long, why. Max ~20 min.
- `problem` — **Problem** (T1) — dig into the pain; pain creates urgency.
- `eliminate` — **Eliminate other solutions** (T2) — "unlike X, what makes you want help instead of doing it yourself?".
- `buying` — **Understand buying decision** (T2) — what they've done, pre-handle objections, identity reframe.
- `futurepacing` — **Future pacing** (T2) — paint the results, the feeling.
- `consequences` — **Consequences** (T2) — the cost of not acting = the biggest driver.
- `presentation` — **Presentation (3 pillars)** (T2) — short, 3 parts, find certainty, then price.
- `objections_phase` — **Objections (phase)** (T2) — bridge to category D.

### B. Discovery & Pain (orange)
- `sixneeds` — **6 human needs** (T2) — contribution, growth, variety, significance, love/connection, certainty (ask from the bottom up).
- `maslow` — **Maslow's pyramid** (T2) — physiological → safety → belonging → esteem → self-actualization. Everything is relative.
- `pain_isgap` — **Pain = what they don't have** (T3) — satisfied people don't hop on sales calls.
- `problemvssymptom` — **Problem vs Symptom** (T2, cross-cutting) — the pain lives in the symptoms, not the problem.
- `probingladder` — **The probing ladder** (T2) — broad → specific → timespan → quantify → business impact → personal impact → consequence.
- `improvementoffer` — **Improvement Offer** (T3) — they're already trying; create doubt in their method, make it their "fault".
- `newopp` — **New Opportunity Offer** (T3) — sell a new mechanism; their current opportunity causes pain.
- `pb_justtellme` — **Pushback: "Just tell me what you do"** (T3) — soft/medium defuse (custom-built, doctor analogy).
- `pb_allgood` — **Pushback: "Everything's fine"** (T3) — Good-to-great frame + hook + re-ask the question.

### C. Beliefs & Reframes (green)
- `limitingbeliefs` — **Limiting beliefs** (T1) — how they talk to you = how they talk to themselves.
- `reframe4` — **4-step process** (T2) — Identify, Clarify, Reframe, Close the loop.
- `belief_types` — **Belief types (identify)** (T2) — skeptical, money, "not so bad", blames externally, "fixes itself", wishful thinking, "not now", research mode.
- `reframeladder` — **The reframe steps** (T2) — 1 change meaning, 2 change reasons, 3 analogies, 4 change logical levels (→ identity).
- `prehandle_q` — **The pre-handle question** (T2) — "What have you done before to solve the problem?".
- `b_tried` — **Tried before** (T3) — good/bad results → move on.
- `b_companies` — **Talking to companies** (T3) — gather leverage, "what would you go by?".
- `b_youtube` — **Tried everything alone (YT)** (T3) — "if YouTube worked we'd all be millionaires".
- `b_nothing` — **Done nothing** (T2) — find the real belief that's stopping them.
- `ex_time` — **Excuse: Time/external** (T3) — "others with a wife/kids find time…".
- `ex_money` — **Excuse: Money** (T3) — resourcefulness-superpower reframe.
- `ex_didntknow` — **Excuse: Didn't know** (T3) — "whose responsibility is it to find a solution?".
- `ex_research` — **Excuse: Just looking around** (T3) — clarity reframe + beach/weather analogy.
- `realbeliefs` — **Real beliefs** (T2) — not a priority/lazy, fear, "can fix it myself".
- `identityframe` — **Identity frame** (T2, cross-link → E) — create an identity gap.
- `roimath` — **ROI math / calculator** (T3) — show what waiting costs; get them to accept the number.

#### Named reframes/analogies (T3, green)
- `rf_restaurant` — **Restaurant/food poisoning** — one bad attempt ≠ never again.
- `rf_beach` — **Beach/weather** — you don't know until you dive in (clarity).
- `rf_medal` — **Medal reframe** — you run faster with a medal (future pacing).
- `rf_lion` — **Lion reframe** — you run faster with a lion behind you (consequences).
- `rf_boats` — **Burn the boats** — having a plan B is part of the problem.
- `rf_nicekind` — **Nice vs Kind** — dare to say the truth (fear/commit).

### D. Objection Handling (red/grey — the big cluster)
- `objections` — **Objections** (T1) — objections are limitations; flip it so their "why" outweighs the objection.
- `smoke_vs_real` — **Smoke screen vs Real** (T2) — fake vs genuine objection.
- `slowdown` — **Slow down / sip of water** (T3) — set the pace, build trust.
- `o_think` — **"Need to think about it"** (T3) — "what do you feel you need to think over?".
- `o_partner` — **"Need to talk to my partner"** (T3) — what is the conversation mostly about? → DMP.
- `niche_smoke` — **Niche smoke screens** (T3) — testimonial, other companies → clarity reframe.
- `o_money` — **Money objection (9/10)** (T2) — CDR.
- `cdr` — **CDR: Clarify–Defuse–Reframe** (T2) — 3 questions in a row, problem/symptom, risk question.
- `twofold` — **Two-fold choice** (T2, recurring) — offer two paths, the upcoming choice last, then "Why?".
- `o_time` — **Time objection** (T3) — "others in worse situations find time".
- `dmp` — **Decision-making process** (T2) — if they "always make decisions this way".
- `dmp_partner` — **DMP: Partner / responsibility** (T3) — the crown/Shakespeare quote, whose responsibility.
- `dmp_scale` — **DMP: 1–10 scale + mindset** (T3) — position the mindset as the problem.
- `rf_airplane` — **Airplane/cockpit** (T3) — trust the authority & prior proof.
- `fear` — **Fear objection** (T2) — comes last, after money/partner.
- `abc` — **ABC: Admit–Befriend–Convert** (T2) — pattern interrupt, comfort zone.
- `bossvoice` — **Bitch voice vs Boss voice (speech mode)** (T3) — take them out of autopilot.

### E. Identity (pink/magenta — apex)
- `identity` — **Identity** (T1) — humanity's greatest force: maintaining its self-image.
- `logiclevels` — **Logical levels (pyramid)** (T2) — Environment → Behaviour → Skills → Beliefs → Identity. Higher = more leverage.
- `identitygap` — **Identity gap framework** (T2) — 6 steps: acknowledge identity → limiting belief → connect → create pain → urgency → position the offer as the bridge.
- `desiredidentity` — **Desired identity** (T3) — "where does your drive come from?".
- `identitybridge` — **Offer = the identity bridge** (T3) — the product transforms the identity.
- `realurgency` — **Real urgency** (T3) — a promise to oneself > fake urgency.

### F. Language Diagnostics (purple)
- `straightline` — **The straight line** (T2) — selling = a straight line; prospects bend off it, you bend them back.
- `talkmirror` — **Language = self-talk** (T2, cross-link → C) — how they talk to you mirrors their self-image.
- `l_wishful` — **Wishful thinking** (T3) — "I wish…" → call it out, ask what they need.
- `l_minimize` — **Minimizing the problem** (T3) — "not that bad" → football reframe.
- `l_external` — **External / victim mindset** (T3) — blames outward → someone in the same situation who succeeds.
- `l_ambiguous` — **Ambiguous language** (T3) — "I think…" → repeat it so they hear the doubt; they need certainty.

### G. Tonality & Delivery (gold — halo, connects to everything in A)
- `tonality` — **Tonality** (T2) — transfer emotions; master your own state.
- `t_confused` — **Confused** (T3) — people help the confused; they open up.
- `t_curious` — **Curious** (T3) — shows you want to help, not push.
- `t_concerned` — **Concerned** (T3) — amplifies their pain (genuine).
- `t_challenging` — **Challenging/skeptical** (T3) — don't let them buy their limitations.
- `t_playful` — **Playful** (T3) — defuses, gets them honest early.
- `whatfeel` — **"What do I want them to feel?"** (T3) — choose the tone.
- `piv` — **Perception · Intention · Value** (T2) — three steps so they take the info in.
- `tempo` — **Verbal tempo & timing** (T3) — medium tempo so you can emphasize.

### H. Fundamentals (dark blue/grey — anchor)
- `authority` — **Authority** (T2) — look/sound/be like someone with it; good setup.
- `funnel` — **Funnel** (T2) — broad → narrow; stop using cookie-cutter questions deeper in.
- `theirwords` — **Use their words** (T2) — their words = gospel, yours mean little.
- `selleridentity` — **Seller's identity** (T2, cross-link → E) — Level 1 salesperson → 2 consultant → 3 transformation guide.

---

## 6. CONNECTIONS (the edges)

### The spine (sequential, teal, thicker edges)
`opening → situation → problem → eliminate → buying → futurepacing → consequences → presentation → objections_phase`
Plus: `spine` is the hub binding all A-nodes together; `opening → setframe`.

### Within categories
- B: `problem → sixneeds`, `problem → maslow`, `problem → problemvssymptom`, `problem → probingladder`, `problem → improvementoffer`, `problem → newopp`, `opening → pb_justtellme`, `opening → pb_allgood`.
- C: `limitingbeliefs → reframe4 → reframeladder`, `limitingbeliefs → belief_types`, `prehandle_q → {b_tried, b_companies, b_youtube, b_nothing}`, `b_nothing → realbeliefs`, `b_nothing → {ex_time, ex_money, ex_didntknow, ex_research}`, reframe analogies hang off their owners (`b_tried → rf_restaurant`, `ex_research → rf_beach`, `ex_money → roimath`).
- D: `objections → smoke_vs_real`, `smoke_vs_real → {o_think, o_partner, niche_smoke}`, `smoke_vs_real → {o_money, o_time}`, `o_money → cdr → twofold`, `o_partner → dmp → {dmp_partner, dmp_scale}`, `dmp_scale → rf_airplane`, `objections → fear → abc → bossvoice`, `slowdown → smoke_vs_real`.
- E: `identity → logiclevels`, `identity → identitygap → {desiredidentity, identitybridge, realurgency}`.
- F: `straightline → {l_wishful, l_minimize, l_external, l_ambiguous}`, `straightline → talkmirror`.
- G: `tonality → {t_confused, t_curious, t_concerned, t_challenging, t_playful}`, `tonality → whatfeel`, `tonality → piv`, `tonality → tempo`.

### CROSS-LINKS — these make it a *net* (draw slightly darker/dashed)
- `problemvssymptom` ↔ `problem` (B) ↔ `o_money/cdr` (D) ↔ `newopp` — the same idea recurs in discovery, the money reframe and structure.
- `identityframe` (C) → `identity` (E) — the reframe steps top out in identity.
- `reframeladder` step 4 → `logiclevels` (E) — "change logical levels" = climbing to identity.
- `identitygap` (E) ↔ `buying` (A) ↔ `realbeliefs` (C) — the buying decision builds on pre-handle + identity reframe.
- `talkmirror` (F) ↔ `limitingbeliefs` (C) ↔ `belief_types` (C) — language is how you *identify* beliefs.
- `twofold` (D) → `o_money`, `o_time`, `dmp`, `fear` — the same pattern in all real objections.
- `dmp_scale` (D) ↔ `presentation`-certainty (A) ↔ value objection — the 1–10 scale is reused.
- `prehandle_q` (C) ↔ `buying` (A) — pre-handling happens in the buying-decision phase.
- `sixneeds` + `maslow` (B) ↔ `opening` (A) — needs are dug out in the opening.
- `consequences` (A) ↔ `rf_lion` ↔ `rf_boats` (C/D) — the consequences phase is driven by these reframes.
- `futurepacing` (A) ↔ `rf_medal` — the medal reframe opens future pacing.
- `fear/bossvoice` (D) ↔ `identity` (E) — fear is resolved by stepping into the identity.
- **Tonality halo:** `tonality` (G) → **every phase node in A** (`opening, situation, problem, buying, futurepacing, consequences, presentation, objections_phase`). Draw these as bright gold threads so you can see tonality sitting over everything.
- `authority`, `funnel`, `theirwords` (H) → `spine` — foundations the whole spine rests on.
- `selleridentity` (H) ↔ `identity` (E) — the seller's own identity journey mirrors the buyer's.

---

## 7. Layout & sizing rules

- Force-directed with enough repulsion that the text in hub nodes doesn't collide.
- Tier 1 nodes: largest radius, always full opacity, label always visible.
- Tier 2: medium, label visible at normal zoom.
- Tier 3: small, label shown on hover or at high zoom (otherwise faded like background nodes).
- The core (A + D) should gravitate toward the center; E (identity) is placed slightly "above"/apart as the apex; F, G, H as satellites around it.
- Add a weak radial/grouping force per category so the same color clumps together (otherwise the net becomes mush).

---

## 8. Interaction & UX

- **Hover on a node:** highlight the node + its direct neighbors and edges; fade the rest. Show a small tooltip with the label + one-line description.
- **Click on a node:** open a side panel with: title, category, description, and **concrete scripts/lines** from the material (e.g. for `ex_money` show the resourcefulness lines). This makes the map an actual training tool, not just a picture.
- **Filter:** buttons per category (A–H) to fade/show clusters.
- **Search:** free-text search that zooms to and highlights the matching node.
- **Zoom & pan:** scroll-zoom, drag to pan.
- **Mobile:** pinch-zoom; tap = hover behavior, second tap = open panel.
- **(Optional, ties into the sales trainer):** let the user mark nodes as "mastered / practicing / not started" and save the state. Then the net becomes a progress map of which sales skills you've trained — tying in with the existing training modes (Objection Battle, Scenario Simulator, etc.). Use the app's normal persistence (not localStorage if it runs as an artifact preview).

---

## 9. Data model (conceptual, not code)

- **Node:** `id`, `label` (English), `category` (A–H), `tier` (1–3), `description` (one sentence), `scripts` (list of example lines, optional), `status` (optional: mastered/practicing/none).
- **Edge:** `source`, `target`, `type` (`spine` | `intra` | `cross` | `tonality`). `type` controls color/thickness/dashing.
- Keep nodes and edges in separate structures so the graph is easy to extend as more material is added.

---

## 10. Style

- Dark background, glowing cluster colors (see §3). Light text.
- Thin edges, high transparency; cross-links slightly more visible.
- Rounded node circles; hub nodes get a subtle glow/halo in their category color.
- Match the app's existing fonts and dark-mode palette.
- Labels in English; keep framework names where the material uses them.

---

## 11. Integration into the sales trainer

- Add it as its own mode, e.g. **"Skill Map"** or **"The Sales Network"**, alongside the existing training modes.
- It can act as an overview/landing view: you see the whole methodology and can click into a concept (and from there optionally start the relevant practice mode).
- Single-file friendly: the whole graph (data + render) can live in the same file as the rest if you want to keep the single-file architecture.

---

### Summary of what the network captures
8 categories · ~70 nodes · 5 hub concepts (One-Call Close, Problem, Objections, Limiting beliefs, Identity) · a tonality halo touching every phase · and ~15 cross-links showing that the whole methodology is *one* system, not separate modules.
