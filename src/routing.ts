import type { RoutingConfig } from './config.ts';
import type { Report } from './domain/report.ts';

/**
 * What the citizen is asked to do next. Mirrors the dispatch service's `CitizenAction`.
 * `NONE` means the service transmitted the report itself; `ANSWER_QUESTIONS` means it
 * could not be filed yet.
 */
export const CITIZEN_ACTIONS = ['NONE', 'CALL', 'SUBMIT_FORM', 'USE_APP', 'ANSWER_QUESTIONS', 'CALL_EMERGENCY'] as const;
export type CitizenAction = (typeof CITIZEN_ACTIONS)[number];

/**
 * The slice of the dispatch service's answer that the chat card needs. Deliberately
 * narrow: the full response also carries its own report id, confidence and analysis,
 * none of which belong in this UI.
 */
export interface RoutingNextStep {
  /** The responsible body's slug, e.g. `atm`. Its display name is already inside `message`. */
  agencyId: string | null;
  category: string;
  /** The dispatch service's own status, e.g. `AWAITING_CITIZEN_ACTION`. Not this app's report status. */
  status: string;
  action: CitizenAction;
  /** Italian, written by the dispatch service for the citizen. */
  message: string;
  /** A `tel:` or `https:` URI the page can turn into a one-tap action. */
  deeplink: string | null;
}

/**
 * Asks the dispatch service which public body is responsible for a report.
 *
 * Never throws and never rejects: by the time this runs the report is already saved, and
 * routing is the optional half. A failure means the chat shows no next-step card — the
 * same as routing being switched off.
 */
export interface Router {
  readonly enabled: boolean;
  route(input: { report: Report }): Promise<RoutingNextStep | null>;
}

/** Shorter than the assistant's 20 s: this is the part the citizen can do without. */
const ROUTE_TIMEOUT_MS = 8_000;

/** The dispatch service rejects coordinates outside Milan; these are its own bounds. */
const MILAN_BOUNDS = { minLat: 45.3, maxLat: 45.6, minLon: 9.0, maxLon: 9.4 };

/** The dispatch service's own limit. */
const MAX_TEXT = 5000;

function isInMilan(latitude: number | null, longitude: number | null): boolean {
  return (
    latitude !== null && longitude !== null &&
    latitude >= MILAN_BOUNDS.minLat && latitude <= MILAN_BOUNDS.maxLat &&
    longitude >= MILAN_BOUNDS.minLon && longitude <= MILAN_BOUNDS.maxLon
  );
}

/** Reads the dispatch response defensively: anything unexpected becomes "no next step". */
export function toNextStep(payload: unknown): RoutingNextStep | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const { nextStep, analysis, status } = payload as Record<string, unknown>;
  if (!nextStep || typeof nextStep !== 'object' || Array.isArray(nextStep)) return null;

  const step = nextStep as Record<string, unknown>;
  const action = step.action;
  const message = step.message;
  if (typeof action !== 'string' || !(CITIZEN_ACTIONS as readonly string[]).includes(action)) return null;
  if (typeof message !== 'string' || !message.trim()) return null;

  const category = (analysis as Record<string, unknown> | undefined)?.category;
  return {
    agencyId: typeof step.agencyId === 'string' ? step.agencyId : null,
    category: typeof category === 'string' ? category : 'ALTRO',
    status: typeof status === 'string' ? status : 'CLASSIFIED',
    action: action as CitizenAction,
    message: message.trim(),
    deeplink: typeof step.deeplink === 'string' && step.deeplink ? step.deeplink : null
  };
}

export function createRouter(config: RoutingConfig): Router {
  const baseUrl = config.baseUrl;
  if (!baseUrl) return { enabled: false, route: async () => null };

  let inFlight = 0;

  return {
    enabled: true,
    async route({ report }) {
      // Photo-only reports are valid here but the dispatch service requires text.
      const text = report.content_text?.trim();
      if (!text) return null;
      // Shed load instead of queueing: no card beats a late one.
      if (inFlight >= 4) return null;
      inFlight++;
      try {
        const response = await fetch(new URL('/api/v1/reports', baseUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
          // No `contact`: this app holds no contact details and must not invent one.
          // Coordinates are omitted rather than clamped when they fall outside Milan —
          // the dispatch service would reject them, and it does not classify on them.
          body: JSON.stringify({
            text: text.slice(0, MAX_TEXT),
            ...(isInMilan(report.latitude, report.longitude)
              ? { latitude: report.latitude, longitude: report.longitude }
              : {})
          })
        });
        if (!response.ok) {
          console.warn(`[routing] dispatch service answered HTTP ${response.status}; no next step shown.`);
          return null;
        }
        return toNextStep(await response.json());
      } catch (error) {
        const detail = error instanceof Error ? error.name : 'unknown';
        console.warn(`[routing] failed (${detail}); no next step shown.`);
        return null;
      } finally {
        inFlight--;
      }
    }
  };
}
