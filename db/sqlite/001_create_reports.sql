CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  content_text TEXT CHECK (content_text IS NULL OR length(content_text) <= 2000),
  image_url    TEXT,
  latitude     REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude    REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at   TEXT NOT NULL,
  CHECK (content_text IS NOT NULL OR image_url IS NOT NULL),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
