# Runbook — restoring the database

The drill for Phase 3's "one real Neon restore, steps written down". Run it
**once now, while nothing is wrong**, so the first time you do it is not the
day you need it.

The whole drill is non-destructive: it creates a scratch branch alongside
production, reads from it, and deletes it. Production is never touched.

Budget 15 minutes.

---

## Step 0 — Check the retention window FIRST

This is the step that can actually change a decision, so do it before anything
else.

Neon can only rewind as far back as its **history window**. In the Neon
console: **Settings → History window**.

On the **Free plan the slider stops at 6 hours** — that is the ceiling, not a
default you can raise. Paid plans go up to 30 days.

Ask the honest question: **if something destroyed data at 23:00, would you
notice before the window closed?** At six hours the answer is no — you would be
asleep for most of it. No amount of drilling fixes that; only a paid plan does.

Write the current value down at the bottom of this file.

---

## Step 1 — Note a fact you can verify later

You need something concrete to check against, or "the data looks fine" means
nothing. In the Neon **SQL Editor**, with the **production branch** selected,
run:

```sql
SELECT
  (SELECT COUNT(*) FROM users)        AS users,
  (SELECT COUNT(*) FROM scores)       AS scores,
  (SELECT COUNT(*) FROM call_history) AS calls,
  (SELECT MAX(id)  FROM users)        AS newest_user_id;
```

Write the four numbers down.

---

## Step 2 — Create a scratch branch from the past

**Branches → Create branch** (button, top right).

- **Name:** `restore-drill`
- **Parent branch:** your production branch (`main` / `production`)
- **Include data up to:** choose **a specific date and time**, and pick roughly
  **one hour ago** — not "current point in time", which copies the present and
  proves nothing about rewinding.

Create it. It should take seconds — Neon branches are copy-on-write, so it is
not physically copying your data.

**Time this step.** In a real incident the number you want to know is how long
until data is queryable again.

---

## Step 3 — Prove the data is actually there

Still in the **SQL Editor**, switch the branch selector to `restore-drill` and
run the same query from Step 1.

```sql
SELECT
  (SELECT COUNT(*) FROM users)        AS users,
  (SELECT COUNT(*) FROM scores)       AS scores,
  (SELECT COUNT(*) FROM call_history) AS calls,
  (SELECT MAX(id)  FROM users)        AS newest_user_id;
```

Expected: numbers **equal to or slightly lower than** Step 1 — lower is correct
and is the point, because you rewound an hour. Identical numbers on a busy hour
would suggest you accidentally branched from "now".

Then confirm the schema came with it, not just the rows:

```sql
SELECT COUNT(*) AS tables FROM information_schema.tables
  WHERE table_schema = 'public';
SELECT * FROM schema_migrations ORDER BY id;
```

You should see the 10 tables (`users`, `scores`, `call_history`, `lessons`,
`saved_calls`, `unlocked_skills`, `rivals`, `prospect_beliefs`,
`session_starts`, `generated_cache`) plus `schema_migrations` listing every
migration that had been applied at that point in time.

---

## Step 4 — Know how you would actually swap over

This is the half people skip, and it is the half that costs you an hour during
a real incident. You do not have to *do* it now — just confirm you can find the
pieces.

1. On the `restore-drill` branch, click **Connect** and copy its connection
   string. Note that it is a **different host** from production — that string is
   the only thing that would need to change.
2. That value is what goes into Vercel as `DATABASE_URL`
   (**Vercel → Settings → Environment Variables**), replacing the production one.
3. Changing an environment variable does **not** redeploy on its own — you must
   hit **Redeploy** on the latest deployment for it to take effect.
4. `runMigrations` runs on boot and is idempotent, so pointing the app at a
   restored branch does not need any manual schema work.

The real-incident shape is therefore: create branch from just before the damage
→ swap `DATABASE_URL` → redeploy → verify → later, promote that branch to be the
new production branch.

---

## Step 5 — Clean up

**Branches → `restore-drill` → Delete.**

Do not skip this. Branches are cheap but not free, and a stale branch called
`restore-drill` is exactly the sort of thing that gets mistaken for something
important six months from now.

---

## Findings — 10 Sep 2026

- **Date run:** 10 September 2026.
- **History window:** **6 hours**, and already at the Free plan's maximum —
  the slider stops there. An earlier version of this file guessed 24 hours;
  it was wrong. Neon offers up to 30 days on paid plans.
- **Branch creation:** seconds. Neon branches are copy-on-write, so this does
  not scale with data size.
- **Row counts matched:** yes — `users` 1, `scores` 40, `call_history` 11,
  identical on the branch and on production. Identical rather than lower is
  correct here: nothing was written during the hour that was rewound past.
- **Schema came across:** yes — 11 tables, and `schema_migrations` listed all
  three of `001_initial_schema.sql`, `002_token_version.sql`,
  `003_generated_cache.sql`.
- **Corrections to this runbook, found by running it:**
  - The branch dialog's wording is **"Branch data and schema from a past point
    in time"** — the second of four radio options. The default is the first
    one, which copies the present and proves nothing.
  - There is an **Auto-delete** dropdown, default "After 1 day". Leaving it
    alone makes Step 5 unnecessary.
  - Neon shows the new branch's connection string immediately on creation, so
    Step 4 happens whether you plan it or not.
  - `schema_migrations` has no `id` column. Order by `version`.
  - The setting is under **Settings → History window**, not "Storage".

**The conclusion was not about the procedure.** Restoring works and is now
rehearsed. The six-hour ceiling is the actual risk, it cannot be raised on the
free plan, and it is tracked as a launch blocker in `roadmap-launch-2026.md`
under "Last steps before launch".
