-- 001_initial_schema.sql
-- The schema exactly as the boot-time DDL left it on 5 Sep 2026. Every
-- statement is IF NOT EXISTS, so applying this to the existing production
-- database is a no-op — it exists to give that database a recorded starting
-- point, not to change it. New changes go in a new numbered file.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  picture TEXT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS scores (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  delta INTEGER,
  mode TEXT,
  date TEXT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS unlocked_skills (
  user_id TEXT,
  skill_id TEXT,
  unlocked_at BIGINT,
  PRIMARY KEY (user_id, skill_id)
);

CREATE TABLE IF NOT EXISTS rivals (
  user_id TEXT,
  rival_email TEXT,
  created_at BIGINT,
  PRIMARY KEY (user_id, rival_email)
);

CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  content TEXT,
  headline TEXT,
  source TEXT,
  persona TEXT,
  call_score INTEGER,
  language TEXT,
  reviewed BOOLEAN DEFAULT FALSE,
  pinned BOOLEAN DEFAULT FALSE,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS prospect_beliefs (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  belief TEXT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS saved_calls (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  mode TEXT,
  label TEXT,
  persona TEXT,
  section TEXT,
  outcome TEXT,
  score INTEGER,
  transcript TEXT,
  analysis TEXT,
  created_at BIGINT
);

CREATE TABLE IF NOT EXISTS call_history (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  mode TEXT,
  label TEXT,
  persona TEXT,
  section TEXT,
  outcome TEXT,
  skills TEXT,
  transcript TEXT,
  reviewed BOOLEAN DEFAULT FALSE,
  created_at BIGINT
);

-- Every other table records a rep that FINISHED. A rep someone abandons
-- halfway left no trace anywhere, which made the one number worth
-- watching — what fraction of people who start a first call reach the
-- debrief — impossible to compute. This is the missing half.
CREATE TABLE IF NOT EXISTS session_starts (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  mode TEXT,
  created_at BIGINT
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_status TEXT;

CREATE INDEX IF NOT EXISTS idx_scores_user_date        ON scores (user_id, date);
CREATE INDEX IF NOT EXISTS idx_lessons_user            ON lessons (user_id, pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_user       ON call_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unlocked_skills_user    ON unlocked_skills (user_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer   ON users (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_rivals_user             ON rivals (user_id);
CREATE INDEX IF NOT EXISTS idx_prospect_beliefs_user   ON prospect_beliefs (user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_saved_calls_user        ON saved_calls (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_starts_user     ON session_starts (user_id, created_at);
