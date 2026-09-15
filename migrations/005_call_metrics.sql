-- Per-call score and transcript arithmetic, so the debrief can compare a
-- call with the rep's last five instead of grading it in a vacuum.
--
-- score   is the grader's 0-10 for the call (reviewed calls only).
-- metrics is a small JSON object computed on the server from the transcript
--         itself, no model involved: talk ratio, questions asked, the line
--         the pitch came on, objections raised and handled. TEXT rather than
--         JSONB to match how `skills` is already stored on this table.
--
-- Rows written before this migration have NULL in both, and the trend query
-- skips them; nothing is backfilled because the old debrief never computed
-- these numbers.

ALTER TABLE call_history ADD COLUMN IF NOT EXISTS score   INTEGER;
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS metrics TEXT;
