import type { Assessment, ManagedReport, OperationsPatch } from '../operations/domain.ts';
import type { NewReport, Report, ReportStatus, StatusEvent } from '../domain/report.ts';

export interface ListOptions {
  /** Maximum rows to return, newest first. */
  limit: number;
}

/**
 * The storage contract every report adapter implements.
 * Routes and services depend only on this interface, never on a concrete engine.
 */
export interface ReportRepository {
  /** Creates schema objects if needed. Safe to call on every start. */
  init(): Promise<void>;
  create(input: NewReport): Promise<Report>;
  findById(id: string): Promise<Report | null>;
  /** Permanently removes a report and its status history. Returns the removed row. */
  delete(id: string): Promise<Report | null>;
  list(options: ListOptions): Promise<Report[]>;
  /** Changes status and appends it to the report's timeline (no event if unchanged). */
  updateStatus(id: string, status: ReportStatus): Promise<Report | null>;
  /** Status history per report, oldest first. Unknown ids are absent from the map. */
  timelines(ids: string[]): Promise<Map<string, StatusEvent[]>>;
  listManaged(): Promise<ManagedReport[]>;
  updateOperations(id: string, patch: OperationsPatch): Promise<ManagedReport | null>;
  claimAssessment(): Promise<ManagedReport | null>;
  finishAssessment(id: string, assessment: Assessment | null, model: string, error: string | null): Promise<void>;
  retryAssessment(id: string): Promise<boolean>;
  close(): Promise<void>;
}
