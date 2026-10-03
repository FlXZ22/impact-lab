-- Adds the 'received' step (delivered to the City) and a history of status changes.
-- Applied automatically on start, or: psql "$DATABASE_URL" -f db/postgres/002_status_timeline.sql

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('open', 'received', 'in_progress', 'resolved'));

CREATE TABLE IF NOT EXISTS public.report_status_events (
  id         bigserial PRIMARY KEY,
  report_id  uuid NOT NULL REFERENCES public.reports (id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('open', 'received', 'in_progress', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_status_events_report_idx ON public.report_status_events (report_id, created_at);
ALTER TABLE public.report_status_events ENABLE ROW LEVEL SECURITY;

-- Existing reports: every one was sent at creation; any later status gets one event (time unknown, so creation time).
INSERT INTO public.report_status_events (report_id, status, created_at)
SELECT id, 'open', created_at FROM public.reports;
INSERT INTO public.report_status_events (report_id, status, created_at)
SELECT id, status, created_at FROM public.reports WHERE status <> 'open';
