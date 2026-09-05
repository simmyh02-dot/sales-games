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
- [x] **Sentry** + an uptime ping on `/api/health`. `@sentry/node` initialises
      before express and pg load, and only when `SENTRY_DSN` is set — no DSN, no
      SDK, so local dev is untouched. The workhorse is `captureConsoleIntegration`:
      every route here catches its own errors and `console.error`s them, so they
      never reach the express error handler; promoting error-level console output
      is what actually surfaces them. `sendDefaultPii: false` and no tracing —
      transcripts must never reach a third party. `authMiddleware` tags the scope
      with the account id (never the email). The error handler now honours a 4xx
      on the thrown error, so a malformed body answers 400 instead of alerting as
      a crash. `/api/health` pings the database (3s cap) and returns 503 when it is
      configured but unreachable — the body keeps its shape, because four client
      pages read it without checking the status.
      **External steps left:** create the Sentry project and put `SENTRY_DSN` in
      Vercel, then point an uptime monitor at `https://<domain>/api/health`.
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

- [x] **Meta description, OG/Twitter tags, favicon, robots.txt, sitemap.xml.**
      Pages are now *rendered* rather than `sendFile`'d: each writes
      `{{ORIGIN}}` and `renderPage` substitutes the real origin per request,
      because the canonical and `og:` URLs must be absolute and this app
      answers on three of them (localhost, the Vercel preview URL, the
      domain). `robots.txt` and `sitemap.xml` are generated for the same
      reason, and everything behind the auth gate is excluded from both — it
      renders a sign-in shell to a crawler. The nine app pages carry
      `noindex`; the four legal pages carry a description and a canonical.
      Icons (`favicon.svg`, a two-size `.ico`, `apple-touch-icon.png`,
      `icon-512.png`, `site.webmanifest`) and the 1200×630 `og-image.png`
      were rendered from the brand mark and the landing headline.
- [ ] **Transactional email** — *deferred by decision, 5 Sep 2026. See
      "Last steps before launch" at the bottom of this file.*
- [x] **Analytics — the in-product half.** *Decision, 5 Sep 2026: this item was
      really two. The traffic half needs a vendor and is deferred to "Last
      steps"; the half that matters needs no vendor at all.*

      The blocker was never a missing tool. `scores` and `call_history` only
      get a row when a rep is **graded**, so an abandoned rep left no trace and
      first-rep completion had no denominator. New `session_starts` table, one
      fire-and-forget insert on each of the four gated start routes.

      `GET /api/admin/funnel` (bearer auth + an `ADMIN_EMAILS` check) answers
      it from our own tables — no third party, nothing added to the processor
      table in the privacy notice. A start counts as completed if a graded rep
      of the **same mode** lands within two hours, which avoids threading a
      session id through the client and keeps a metric off the request path.
      Rates are `null`, not `0`, when the denominator is zero: "nobody has
      started" must not read as "nobody finishes".

      `/admin` renders it, because every route here authenticates with a
      bearer token and the JSON can't just be opened in a tab.

      **Verified against real Postgres**, not by eye: the queries and the whole
      boot DDL were run under PGlite with a seeded fixture covering the cases
      the rate has to get right — someone who finished, someone who quit,
      someone who finished three hours later (correctly excluded), and a
      second start that must not inflate the first-rep cohort. The DDL also
      passes a re-run, since boot repeats it on every cold start.
- [x] **Visible session counter + a plain-English definition of a session.**
      A meter in the app bar on every signed-in page, from `/api/user/status`
      (which already returned the numbers — nothing outside Settings read
      them). Quiet by default, amber on the last fifth of the allowance, red
      at zero — `--bad` rather than `--accent`, which is on a 24s hue loop and
      shouldn't carry a warning. Hidden entirely on an unlimited plan. It
      refreshes after every `POST /api/scores`, because that request *is* what
      the allowance counts. Settings gained a bar and lost the duplicate count
      that sat in the profile row.

      The definition — "one graded rep: a full call simulation, one objection
      round or one pattern round; a rep you leave before it's graded doesn't
      count" — now sits under all four pricing surfaces (landing grid, the
      inline modals on home and Settings, and the one `pricing.js` builds for
      the mode pages). This is what `checkSessionLimit` actually meters, and
      it was nowhere in writing.
- [ ] Numbered SQL migrations replacing the inline boot-time DDL.
- [x] **`helmet()` + CSP — shipped in Report-Only.** The enforced part is the
      cheap part: `nosniff`, `X-Frame-Options`, COOP/CORP, and no more
      `X-Powered-By: Express`. Helmet's HSTS is switched **off** — Vercel's
      edge already sends it with `preload`, and two of the same header is
      worse than one. Helmet's default `Referrer-Policy: no-referrer` is
      overridden to `strict-origin-when-cross-origin`: that header *is*
      enforced, a stripped `Referer` is a known way to upset Google sign-in,
      and the origin-only default is the privacy that mattered anyway.

      The CSP itself is `Content-Security-Policy-Report-Only` and only
      enforces when **`CSP_ENFORCE`** is set. Getting it wrong breaks the only
      door into the product, so it listens first: violations POST to
      `/api/csp-report`, which `console.error`s them, which Sentry's console
      integration turns into issues — deduped per process on
      directive + blocked URI so one bad asset can't fire on every page view.
      Script sources are nonce-based (`{{NONCE}}`, substituted per request by
      `renderPage`) plus `accounts.google.com` and `d3js.org`.

      Report-Only immediately earned its keep: the browser flagged that the
      **GSI library injects a ~10 KB `<style>` of its own** and does not carry
      our nonce onto it. Since CSP ignores `'unsafe-inline'` whenever a nonce
      is present, a nonced `style-src` would have rendered the sign-in widget
      unstyled in production. Styles therefore take `'unsafe-inline'` and no
      nonce — the alternative was pinning a sha256 of Google's stylesheet,
      which rots the next time they change a byte, and `style-src-attr` had to
      allow inline styles regardless because the client sets `style=""`
      everywhere. Scripts keep the nonce, which is where it counts.

      **Next step, outside the code:** let reports accumulate for a few days,
      confirm the only entries are ones you understand, then set
      `CSP_ENFORCE=1` in Vercel and re-test Google sign-in immediately.
      Remaining known gap: `script-src-attr 'unsafe-inline'`, needed by the
      `onclick=` handlers on the pricing and Settings buttons. Rewriting those
      as listeners is what removes it.
- [ ] One real Neon restore into a scratch branch, steps written down.
- [ ] `token_version` column for session revocation.
- [ ] Accessibility pass on the custom buttons, dropdown menu and live chat.
- [ ] Magic-link email sign-in as a second auth method (Google is the only way
      in today, and it stands between you and 100% of revenue).

---

## Last steps before launch

Things deliberately deferred, to be done immediately before going public
rather than now. Each is flagged here so it cannot quietly fall off.

- [ ] **Transactional email.** *Deferred 5 Sep 2026 by decision — build it as
      one of the last steps.* Provider undecided (Resend is the cheap default;
      Postmark if deliverability of the payment-failed mail is worth paying
      for). Whichever it is, gate it on the API key the way Sentry is gated on
      `SENTRY_DSN`, so local dev stays untouched.

      Four messages, in order of what it costs to not have them:
      **payment failed** (Stripe retries for weeks and then silently drops the
      user to free — today they find out by losing access), **subscription
      cancelled** (a receipt for an action that takes money off you, and the
      one users complain loudest about not getting), **welcome** (the first
      thing a new account sees, and where the "what is a session" explanation
      belongs), **free tier nearly used** (the only upgrade prompt that
      arrives when they are not already blocked).

      Prerequisite that takes real-world time: a **verified sending domain**
      with SPF/DKIM records. Start that before you need it — DNS propagation
      and provider review are not instant.

- [ ] **Traffic analytics.** *Deferred 5 Sep 2026 by decision.* The in-product
      funnel is done and needs no vendor; this is the other half — how many
      people reach the landing page, where from, and what share of them sign
      up. It only produces anything worth reading once real traffic exists,
      which is why it waits.

      Plausible is the pick when you get here: no cookies, so no cookie
      banner, and one line to add to the processor table in the privacy
      notice. Pair it with the existing `/admin` funnel and you can see the
      whole path — visitor → account → first rep → graded rep → paid.

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
