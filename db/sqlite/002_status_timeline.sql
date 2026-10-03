-- Adds the 'received' step (delivered to the City) and a history of status changes.
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt.

CREATE TABLE reports_v2 (
  id           TEXT PRIMARY KEY,
  content_text TEXT CHECK (content_text IS NULL OR length(content_text) <= 2000),
  image_url    TEXT,
  latitude     REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude    REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'received', 'in_progress', 'resolved')),
  created_at   TEXT NOT NULL,
  CHECK (content_text IS NOT NULL OR image_url IS NOT NULL),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);

INSERT INTO reports_v2 (id, content_text, image_url, latitude, longitude, status, created_at)
SELECT id, content_text, image_url, latitude, longitude, status, created_at FROM reports;

DROP TABLE reports;
ALTER TABLE reports_v2 RENAME TO reports;
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);

CREATE TABLE IF NOT EXISTS report_status_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  TEXT NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('open', 'received', 'in_progress', 'resolved')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS report_status_events_report_idx ON report_status_events (report_id, created_at);

-- Existing reports: every one was sent at creation; any later status gets one event (time unknown, so creation time).
INSERT INTO report_status_events (report_id, status, created_at) SELECT id, 'open', created_at FROM reports;
INSERT INTO report_status_events (report_id, status, created_at) SELECT id, status, created_at FROM reports WHERE status <> 'open';
