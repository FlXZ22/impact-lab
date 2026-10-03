/**
 * The report lifecycle, in order. The citizen sees these as steps:
 * open = sent · received = delivered to the City · in_progress = taken on · resolved = fixed.
 */
export const REPORT_STATUSES = ['open', 'received', 'in_progress', 'resolved'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const LANGUAGES = ['it', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const MAX_TEXT_LENGTH = 2000;

/** A persisted report. Field names mirror the database columns. */
export interface Report {
  id: string;
  content_text: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ReportStatus;
  created_at: string;
}

/** What a repository needs to create a report; id, status and timestamp are assigned by the repository. */
export interface NewReport {
  content_text: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** One status change: the step reached and when. */
export interface StatusEvent {
  status: ReportStatus;
  at: string;
}

/** What a citizen may see about a report's progress (no content). */
export interface ReportProgress {
  id: string;
  status: ReportStatus;
  timeline: StatusEvent[];
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === 'string' && (REPORT_STATUSES as readonly string[]).includes(value);
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}
