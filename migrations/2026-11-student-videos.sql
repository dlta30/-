-- Student video submissions. Existing uploads are immutable for students.
CREATE TABLE IF NOT EXISTS student_videos (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_student_videos_owner ON student_videos(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_videos_published ON student_videos(published, created_at DESC);
CREATE TABLE IF NOT EXISTS student_video_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  students_can_view_others INTEGER NOT NULL DEFAULT 0 CHECK (students_can_view_others IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO student_video_settings (id, students_can_view_others) VALUES (1,0);
