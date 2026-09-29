-- US-01 · Criterio 4: tabla intermedia pura con dos FK (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE student (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE course (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL
);

CREATE TABLE student_course (
  student_id INTEGER NOT NULL REFERENCES student (id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES course (id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, course_id)
) WITHOUT ROWID;
