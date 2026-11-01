-- Semester support for Chemistry 2-1 and Chemistry 2-2.
ALTER TABLE learning_units ADD COLUMN semester TEXT NOT NULL DEFAULT '1';
ALTER TABLE exams ADD COLUMN semester TEXT NOT NULL DEFAULT '1';
CREATE INDEX IF NOT EXISTS idx_learning_units_semester ON learning_units(semester, published, sort_order);
CREATE INDEX IF NOT EXISTS idx_exams_semester ON exams(semester, status);
