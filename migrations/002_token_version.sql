-- Session revocation.
--
-- Tokens last 30 days and, until now, nothing could shorten that: a token
-- copied off a shared laptop stayed valid for a month with no way to kill it.
-- Every token now carries the version it was signed under, and bumping this
-- column invalidates every token issued before the bump.
--
-- Existing tokens have no version claim and are read as 0, which matches this
-- default — so shipping this does not sign anybody out.

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
