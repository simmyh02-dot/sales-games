# Sales Camp AI — Launch Roadmap (from the 30 Aug 2026 readiness audit)

Supersedes nothing — the four product roadmaps are all **shipped**. This one covers
the layer *around* the product: what has to exist before it can take money publicly.

Full audit (27 items, four tiers, with fix sketches):
https://claude.ai/code/artifact/c5146944-feaa-4d95-b74a-6daf73fc29ef

---

## Phase 1 — Stop the leak ✅ DONE 30 Aug 2026

- [x] **Auth required on every AI endpoint.** All 12 (`objection/new|feedback`,
      `pattern/new|feedback`, `call/start|message|end|quit`,
      `setter/start|message|end|quit`) moved from `optionalAuth` — or from *nothing*,
      in the case of the two `/message` routes — to `authMiddleware`.
      `optionalAuth` deleted so the pattern can't come back.
- [x] **Client sends the token on the three calls that didn't.**
      `sales-call.js` message send, `objection-battle.js` feedback,
      `pattern-recognition.js` feedback. Same class of bug as the Aug `endCall` fix.
- [x] **History capped** (`capHistory`, 60 turns × 2000 chars) at all four points
      where client-supplied transcript reaches a prompt.
- [x] **Rate limiting** (`express-rate-limit`). AI routes 40/min, sign-in 20/15min.
      Keyed on the **account** when a valid token is present, IP otherwise, so
      shared-NAT users don't collide. Runs before auth so junk is refused cheaply.
- [x] **Boot assertion** on `JWT_SECRET` + `DATABASE_URL` when
      `NODE_ENV=production`. No more `"dev-secret-change-me"` fallback in prod.
- [x] **Six database indexes**, incl. `scores(user_id, date)` — read before every
      session start — and `users(stripe_customer_id)`, hit by every webhook.
- [x] `checkSessionLimit` still fails **open** on a DB error (a blip shouldn't lock
      out a paying user) but now logs instead of swallowing.

**Verified locally:** unauthenticated calls to every AI route return 401; a valid
token passes to the AI layer; the limiter cuts off at exactly 40 and a second
account on the same IP is unaffected.

**Still open from Phase 1:** the limiter's store is in-memory, so on Vercel each
serverless instance counts separately and a cold start resets the window. A hard
global cap needs a shared store (Upstash Redis). Good enough for launch scale;
revisit if abuse appears.

## Phase 2 — Before the first payment

- [x] **Terms, Privacy, Refunds, Contact** at `/terms`, `/privacy`, `/refunds`,
      `/contact` (`public/pages/*.html`), linked from a new `.site-footer` on the
      landing page and on the legal pages themselves. Written for **Simon Myhr,
      sole trader, Sweden** — support address `simmy02@gmail.com`, Swedish law,
      IMY/ARN named. The privacy notice carries a processor table (Anthropic,
      Google, Neon, Stripe, Vercel) and states plainly that call transcripts leave
      our systems for a third-party AI. Refunds: monthly, cancel any time, no
      part-month refunds, goodwill refund within 14 days of a first payment under
      5 sessions. **Not reviewed by a lawyer.**
- [x] **Stripe billing portal** — `POST /api/stripe/portal` +
      a "Manage billing" button in Settings, shown to anyone who has ever had a
      Stripe customer record (so cancelling stays reachable after a downgrade).
      **Requires enabling the customer portal once in the Stripe dashboard**
      (Settings → Billing → Customer portal) or the API throws.
- [x] **`invoice.payment_failed`** webhook handling — sets `users.payment_status`
      to `past_due`; cleared by `invoice.payment_succeeded`/`invoice.paid`.
      `customer.subscription.*` now honours `sub.status`: `active`/`trialing`/
      `past_due` keep the plan (Stripe retries for weeks — don't cut off a card
      that is about to succeed), anything else drops to free. Settings shows
      "Your last payment failed" with a link into the portal.
- [ ] **Sentry** + an uptime ping on `/api/health`.
- [x] **Account deletion + data export.** `GET /api/user/export` returns every row we hold
      as a downloadable JSON file (Stripe ids left out — plumbing, not user data).
      `DELETE /api/user` cancels the Stripe subscription *first* — deleting the account while
      a subscription still bills would be the worst possible failure — then wipes all eight
      tables in one transaction. The Stripe customer record survives, because paid invoices are
      accounting records Swedish law keeps for seven years. Both live in a fenced-off
      **Your data** section in Settings; deletion needs the word DELETE typed, then lands on
      the landing page with a confirmation banner. Privacy policy rewritten to point at the
      self-serve route instead of promising deletion by email.
- [x] **Branded 404 + global error handler.** `/api/*` gets JSON, everything else
      an inline-styled page (no stylesheet dependency — an error page shouldn't be
      able to fail the same way twice). The error handler logs the stack and
      returns 500 without leaking it.

## Phase 3 — Launch week and after

- [ ] Meta description, OG/Twitter tags, favicon, robots.txt, sitemap.xml.
      Shared links currently render as a bare grey URL.
- [ ] **Transactional email** (Resend/Postmark): welcome, payment failed,
      subscription cancelled, free tier nearly used. There is no way to email
      users today — the single biggest missing system after legal.
- [ ] Analytics; track first-call completion rate as the leading indicator.
- [ ] Visible session counter ("3 of 5 used this month") + a plain-English
      definition of a session on the pricing table.
- [ ] Numbered SQL migrations replacing the inline boot-time DDL.
- [ ] `helmet()` + CSP (allow `accounts.google.com`, `fonts.googleapis.com`,
      `fonts.gstatic.com`; re-test Google sign-in immediately after).
- [ ] One real Neon restore into a scratch branch, steps written down.
- [ ] `token_version` column for session revocation.
- [ ] Accessibility pass on the custom buttons, dropdown menu and live chat.
- [ ] Magic-link email sign-in as a second auth method (Google is the only way
      in today, and it stands between you and 100% of revenue).

---

## Done alongside Phase 1 (30 Aug 2026)

- **Rebrand → Sales Camp AI.** All titles, brand marks, page copy, comment
  headers, README and the boot log. Internal `SCG_*` / `scg_*` identifiers were
  deliberately **left alone** — `scg_auth_token` is the localStorage key holding
  every existing session, and renaming it would sign everyone out.
- **Setter Call Framework replaces the TRIAGE script.** `setter_call_framework.md`
  is now read from disk at boot and injected into the setter grading prompt, so
  edits to that file reach the AI without a code change. `SETTER_STAGES` rewritten
  from 10 stages to the framework's 9 (personal impact folded into Problem
  Discovery; "Impact of goal" became Cost of Inaction). The framework is still
  never shown to the AI prospect — grading and outcome only.
- **Deleted** the unreferenced 139 KB `sales-camp-games.html` single-file build.
