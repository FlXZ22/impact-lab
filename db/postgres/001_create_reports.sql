-- SegnalaMi reports table for PostgreSQL / Supabase.
-- Applied automatically by the postgres adapter on start, or run it by hand:
--   psql "$DATABASE_URL" -f db/postgres/001_create_reports.sql
-- In Supabase you can also paste it into Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS public.reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_text text CHECK (content_text IS NULL OR char_length(content_text) <= 2000),
  image_url    text,
  latitude     double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude    double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_has_content CHECK (content_text IS NOT NULL OR image_url IS NOT NULL),
  CONSTRAINT reports_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX IF NOT EXISTS reports_created_at_idx ON public.reports (created_at DESC);

-- The server connects with a privileged role and bypasses RLS.
-- Enabling RLS with no policies keeps the table closed to Supabase's public anon/authenticated keys.
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
