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
      **External steps — both done.** `SENTRY_DSN` confirmed live in Vercel via
      `errorReportingConfigured: true` on `/api/health` (5 Sep 2026). An uptime
      monitor is pinging `sales-games.vercel.app/api/health` every 5 minutes,
      100% up over its first ~2 hours (confirmed by the user, 5 Sep 2026).
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
- [x] **Numbered SQL migrations replacing the inline boot-time DDL.** The DDL
      ran in full on every cold start, kept no record of what had been
      applied, could only ever express idempotent changes, and swallowed its
      errors in a bare `.catch(() => {})`. It now lives in `migrations/`,
      applied once each and recorded in `schema_migrations`.
      `001_initial_schema.sql` is the current schema verbatim — every
      statement `IF NOT EXISTS`, so it is a no-op against production and
      exists only to give that database a recorded starting point.

      One transaction per file, so a migration that fails part way leaves
      nothing behind and stays unrecorded — the next boot retries it. A
      `pg_advisory_lock` serialises concurrent cold starts, which on Vercel is
      not hypothetical. A failure logs at error level (so Sentry sees it) and
      the app keeps serving: running on a stale schema is bad, but a solo
      product that refuses to boot over a migration is worse.

      `migrations/**` added to `includeFiles` in `vercel.json`. The runner
      uses `readdirSync`, which Vercel's static tracer cannot follow — exactly
      the failure that dropped the pdfkit fonts from the bundle and broke PDF
      export in production while it worked locally.

      **Tested end to end** with the real function lifted out of `server.js`
      and run against PGlite: fresh database applies 001 and nothing else;
      a second run applies nothing; a newly added file applies only itself;
      and a deliberately broken file throws, records nothing, and leaves no
      partial column behind. That last one also surfaced a real constraint —
      a multi-statement migration only works because node-postgres sends a
      *parameterless* `query()` over the simple protocol.
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

      **`CSP_ENFORCE=1` flipped on 10 Sep 2026** via `vercel.json`'s `env`
      block, after 14 days of zero CSP hits in both Sentry and Vercel logs.
      Enforcement is live — re-test Google sign-in after every deploy that
      touches `script-src`/`style-src`.

      **`script-src-attr` is now `'none'` (10 Sep 2026).** All thirteen
      `onclick=` attributes — pricing cards, Settings plan buttons, the modal
      close and the sign-out button — became two delegated listeners, one in
      `pricing.js` keyed on `data-pricing`, one in `auth.js` on `data-auth`.
      Delegation was the right shape anyway: the pricing modal and the auth
      widget are both injected after load, which is exactly what an inline
      handler was papering over. An injected `onclick=` is now inert rather
      than merely unlikely. `style-src-attr` still needs `'unsafe-inline'` and
      always will — the client sets `style=""` in too many places to unpick.
- [x] **Stop Neon's autosuspend from crashing the server.** *Unplanned, found
      10 Sep 2026 while reading Sentry.* The top issue was "terminating
      connection due to administrator command", marked **Unhandled**, 19 events
      in 5 days. That is Postgres `57P01` — what Neon sends when it suspends an
      idle compute — arriving on an **idle pooled client**. node-postgres emits
      that on the Pool, and an unhandled `'error'` event ends the process, so a
      routine idle scaledown was killing the instance.

      Every other database error in Sentry was downstream of that: the cold
      start that followed fired `runMigrations`, the `generated_cache` DDL and
      the cache loader at a compute that was still waking, which is what
      "Client network socket disconnected before secure TLS connection was
      established", "read ECONNRESET" and "Authentication timed out" are. The
      `/api/health` failure the uptime monitor caught was the same window.

      Fixed in three parts: a `db.on("error")` listener (the actual bug — there
      is nothing to do but not die, the client is already discarded);
      `idleTimeoutMillis: 30s` so we release idle connections well before
      Neon's 5-minute suspend reaches them, plus a bounded `max` and a real
      `connectionTimeoutMillis` instead of the default infinite wait; and the
      `generated_cache` DDL moved into `003_generated_cache.sql` so a cold
      start no longer opens a connection to create a table that exists.
- [x] **One real Neon restore into a scratch branch, steps written down.**
      *Done 10 Sep 2026.* Runbook: `runbook-database-restore.md`. The drill
      passed cleanly — a branch taken from an hour earlier returned the same
      1/40/11 row counts as production, all 11 tables, and all three rows of
      `schema_migrations`. Restoring works and the procedure is written down.

      **The drill's real finding was not the drill.** Neon's Free plan caps the
      history window at **6 hours**, and it is already at that maximum — this
      file previously assumed 24. Six hours is shorter than a night's sleep:
      data destroyed at 23:00 and noticed at 08:00 is gone, and no amount of
      rehearsing the restore procedure recovers it. See "Last steps before
      launch" — this is now a launch blocker, not a Phase 3 item.
- [x] **`token_version` column for session revocation.** *Done 10 Sep 2026.*
      Tokens last 30 days and nothing could shorten that — one copied off a
      shared laptop stayed valid for a month. Every token now carries a `tv`
      claim; `authMiddleware` compares it to `users.token_version` and 401s on a
      mismatch. That costs one primary-key lookup per authenticated request and
      **fails open on a database error**, the same call `checkSessionLimit`
      makes: a Neon blip must not sign out everyone holding a good token.
      `/api/auth/me` folds the comparison into the query it already runs, which
      is what makes `auth-guard.js` bounce a revoked session on the next page
      load. `POST /api/user/sign-out-everywhere` bumps the column and returns a
      replacement token, so the device asking is the one device that stays —
      wired to "Sign out on all other devices" in Settings → Profile.
      Tokens signed before this shipped carry no `tv` and read as 0, matching
      the column default, so the deploy signed nobody out.
- [x] **Accessibility pass on the custom buttons, dropdown menu and live chat.**
      *Done 10 Sep 2026.* Four things were wrong, all of them the same mistake:
      state carried in colour and position, which say nothing out loud.

      *Focus ring.* Seven rules cleared `outline` on `:focus` so a mouse click
      wouldn't leave a ring — which also took it from keyboard users, the only
      people who need it. One `:focus-visible` rule restores it (keyboard only)
      and carries `!important` so it beats those seven without unpicking each.

      *Custom buttons.* The `active`/`selected` class was the only signal of
      which difficulty, timer, offer, section or persona was chosen. Every
      toggle group now sets `aria-pressed` alongside the class, at all eight
      places that flip it, and each group is a labelled `role="group"`.

      *Dropdown menu.* It claimed `role="menu"`, which promises `menuitem`
      children and arrow-key navigation, and delivered neither — it is a list
      of links. It is now a labelled `<nav>` with `aria-expanded` alone (no
      `aria-haspopup`, which means "opens a menu"), `aria-current="page"` on the
      entry you are on, and Escape returns focus to the trigger instead of
      dropping it on the floor.

      *Live chat.* The prospect's reply arrives on its own and was announced to
      nobody: `#chat-window` is now `role="log" aria-live="polite"`. Who is
      speaking was carried by which side the bubble sits on, so each bubble
      carries a visually hidden "You said:" / "Prospect said:" prefix. Four
      inputs that leaned on a placeholder for their name got real labels.

      Verified in a browser, not assumed: `aria-pressed` flips to exactly one
      `true` per group, Escape restores focus to the trigger, the ring computes
      to `2px solid` on keyboard focus, and the hidden prefixes measure 0×0 and
      do not appear in a screenshot of the chat.
- [x] **Product feedback — a pop-up after two reps, a letterbox in Settings, a
      thread in admin.** *Done 10 Sep 2026, for launch and the first couple of
      months.*

      Two channels, one `feedback` table. The pop-up asks for 1&ndash;5 with an
      optional note once someone has finished their **second** rep &mdash; the
      first point at which they have seen a debrief, chosen to go again, and
      formed an opinion about the product rather than about one bad call. The
      box at the bottom of Settings takes a letter at any time and has no
      rating on purpose: a scale invites a score, and a letter invites a
      sentence.

      The trigger hangs off `SCG.addScore`, the one line every mode already
      runs when a graded rep lands, so all four modes got it without knowing
      the feature exists. `score.js` asks the server whether it is due; the
      3-second delay before it appears lives in the client, so the debrief they
      just earned is never covered by a dialog.

      **Being asked is itself an answer.** `feedback_prompt_state` is one row
      per person, server-side rather than in `localStorage` (which is
      per-device and would re-ask the same person in every new browser). It is
      recorded when the dialog is actually on screen, not when the check says
      it could be. A "not now" snoozes for three more reps; three asks with no
      answer retires it; one rating retires it for good. A letter deliberately
      does **not** &mdash; answering in Settings should not silently cancel a
      question they have not been asked yet.

      Both channels are switchable from `/admin/feedback` without a deploy
      (`app_settings`, an allowlisted key/value pair, read uncached &mdash; a
      switch that takes a minute to bite is a switch you cannot trust while
      watching the thing it controls). Two switches rather than one because
      they retire at different times: the pop-up is intrusive by design and
      comes out after launch; the letterbox can stay forever. Off *removes* the
      thing rather than greying it out, and the submit route re-checks the
      switch, because a hidden box is a rendering decision and the route is
      reachable without it.

      `/admin/feedback` reads as a forum: ratings and letters newest-first in
      one thread, colour-coded badges, the author joined at read time (so a
      deleted account takes its name off posts already written), paragraph
      breaks preserved, and an Archive button that hides a handled post without
      deleting what anybody wrote. Above it, the poll: the distribution, the
      average, and &mdash; next to it &mdash; the **answer rate**, because a 4.8
      from one person in twenty is a different number than a 4.8 from twelve.

      Feedback is included in the GDPR export and deleted with the account. The
      poll loses that vote; the privacy notice promises deletion erases what we
      hold, and a post someone wrote is theirs even when it is useful to us.
      Section 1 of the notice now lists it.

      **Verified against real Postgres**, not by eye: the migration and every
      query were run under PGlite with a fixture covering someone one rep short
      of the threshold, someone who dismissed and came back, someone who hit
      the three-ask cap, someone who answered, a letter that must not retire a
      pop-up, an archived post that must stay out of the default view, the
      empty-table case (day one), and an account deletion that must leave no
      orphaned post. Each query is asserted to appear verbatim in `server.js`,
      so the run tests the shipped code and not a copy. The pop-up, the
      letterbox and the admin thread were driven in a browser in both themes.
- [ ] Magic-link email sign-in as a second auth method (Google is the only way
      in today, and it stands between you and 100% of revenue).

---

## Last steps before launch

Things deliberately deferred, to be done immediately before going public
rather than now. Each is flagged here so it cannot quietly fall off.

- [ ] **Widen the database history window before taking a single paying user.**
      *Found 10 Sep 2026 by running the restore drill.* Neon's Free plan allows
      a maximum of **6 hours**, and the project is already at that maximum.
      Restoring itself works — that was verified — but only within those six
      hours, which is shorter than one night. Damage done at 23:00 and noticed
      at 08:00 is permanent.

      Today this is nearly harmless: one account, forty rows, all of it the
      owner's own. It stops being harmless the moment someone else's paid
      progress is in there, because the failure mode is a refund, a bad review
      and nothing to restore from.

      The fix is a plan upgrade — Neon advertises up to 30 days on paid tiers —
      and it should be bought at the same time as the first real customer, not
      before. **Do not build a custom `pg_dump` pipeline instead.** It is more
      moving parts to maintain, needs somewhere to store the dumps, and would
      be a worse version of a feature that costs about a tenth of one
      subscription per month.

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
