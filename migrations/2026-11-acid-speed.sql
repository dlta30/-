CREATE TABLE IF NOT EXISTS acid_speed_scores (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 1000),
  correct_count INTEGER NOT NULL CHECK(correct_count BETWEEN 0 AND 10),
  elapsed_ms INTEGER NOT NULL CHECK(elapsed_ms BETWEEN 1000 AND 30000),
  played_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acid_speed_rank ON acid_speed_scores(score DESC, elapsed_ms ASC, played_at ASC);
