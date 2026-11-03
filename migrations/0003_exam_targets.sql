CREATE TABLE IF NOT EXISTS exam_targets (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('all','class','student')),
  target_value TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_exam_targets_exam ON exam_targets(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_targets_target ON exam_targets(target_type,target_value);
