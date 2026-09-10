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

Neon can only rewind as far back as its **history retention** setting. In the
Neon console: **Project → Settings → Storage** (labelled "History retention" or
"Point-in-time restore window").

- Free tier defaults to **24 hours**.
- Paid tiers go to 7 days, and higher on the larger plans.

Ask the honest question: **if someone deleted a table on Friday night, would you
notice before the window closed?** If retention is 24 hours, the answer over a
weekend is no, and no amount of drilling fixes that — only raising the setting
does.

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

## Findings — fill in when you run it

Leaving these blank defeats the purpose of the drill.

- Date run:
- History retention window (Step 0):
- Time from "Create branch" to first successful query (Steps 2–3):
- Row counts matched expectations: yes / no
- Anything that did not match this runbook:
