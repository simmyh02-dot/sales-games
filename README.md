# Sales Camp Games

A sales training arena with three AI-coached modes, all grounded in your own
sales study notes (`knowledge/sales_notes.md`, auto-extracted from the PDFs in
this folder).

## Modes

1. **Objection Battle** — 30 seconds to respond to a live objection, then get
   feedback on what you did well, what you missed, a better alternative, and
   the principle behind the moment.
2. **Pattern Recognition** — read a prospect's statement, identify the real
   issue underneath it (limiting belief, identity, certainty, etc).
3. **Sales Call Mode** — full roleplay against an AI prospect generated from a
   scenario, ending in a detailed call breakdown and score.

Every round adjusts your daily/total score shown on the homepage
(`localStorage`-based for now).

## Setup

```bash
npm install
cp .env.example .env
```

Add your Claude API key to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then run:

```bash
npm start
```

Open http://localhost:3000

Without an API key the site still loads, but each mode shows a notice that
the AI isn't connected yet.

## Re-extracting notes

If you add/replace the source PDFs in this folder, regenerate the knowledge
base with:

```bash
node scripts/extract-notes.js
```

This writes `knowledge/sales_notes.md`, which is injected as grounding context
for every AI request.

## Next steps (planned)

- Login / accounts
- Persisted score history (server-side, per user)
- Payment / subscription
