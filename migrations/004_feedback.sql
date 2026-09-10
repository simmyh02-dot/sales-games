-- Product feedback, for launch and the first couple of months.
--
-- Two ways in, one table: a 1-5 rating (with an optional note) asked once
-- someone has finished a couple of reps, and a free-text letter from the box
-- at the bottom of Settings. `kind` says which, and the rating is null for a
-- letter. Both read as posts in the admin panel.
--
-- The pop-up is intrusive by design, so it has to be switchable without a
-- deploy: app_settings is the switchboard, read on every check rather than
-- cached, so flipping it in admin takes effect on the next request.

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at BIGINT
);

CREATE TABLE IF NOT EXISTS feedback (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT,
  kind       TEXT,                              -- 'rep' (pop-up) | 'letter' (Settings)
  rating     INTEGER,                           -- 1-5; null on a letter
  message    TEXT,
  mode       TEXT,                              -- the rep that triggered it; null on a letter
  reps       INTEGER,                           -- reps completed when they answered
  archived   BOOLEAN NOT NULL DEFAULT FALSE,    -- handled; hidden from the default view
  created_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (archived, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user    ON feedback (user_id);

-- One row per person, so the pop-up can be asked, snoozed and retired without
-- depending on localStorage — which is per-device and would re-ask the same
-- person on every new browser.
CREATE TABLE IF NOT EXISTS feedback_prompt_state (
  user_id     TEXT PRIMARY KEY,
  shows       INTEGER NOT NULL DEFAULT 0,   -- times the pop-up actually appeared
  dismissals  INTEGER NOT NULL DEFAULT 0,   -- times they said "not now"
  last_reps   INTEGER NOT NULL DEFAULT 0,   -- rep count at the last show, for the snooze
  answered_at BIGINT,                       -- set once they rate; never asked again
  updated_at  BIGINT
);
