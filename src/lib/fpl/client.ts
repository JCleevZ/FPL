/**
 * Thin client for the official FPL API.
 *
 * Only the ingest layer should import this. The app itself reads from Supabase —
 * see the plan: keeping FPL off the user request path protects us from rate
 * limiting and keeps page loads fast.
 */

import type {
  FplBootstrap,
  FplElementSummary,
  FplEntry,
  FplEntryHistory,
  FplEntryPicks,
  FplEventStatus,
  FplFixture,
  FplLive,
} from './types';

const BASE = 'https://fantasy.premierleague.com/api';

/**
 * FPL blocks obvious bot traffic. A normal browser UA plus low request volume
 * from a single ingest process is enough; we do not scrape at page-view rate.
 */
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-GB,en;q=0.9',
} as const;

export class FplApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FplApiError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with exponential backoff. Retries transient failures (429, 5xx, network
 * errors) and fails fast on everything else — a 404 will never fix itself.
 */
async function get<T>(path: string, retries = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(2 ** attempt * 500); // 1s, 2s, 4s

    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: HEADERS,
        cache: 'no-store',
      });

      if (res.ok) return (await res.json()) as T;

      const retryable = res.status === 429 || res.status >= 500;
      lastError = new FplApiError(path, res.status, `FPL ${res.status} on ${path}`);
      if (!retryable) throw lastError;
    } catch (err) {
      if (err instanceof FplApiError && err.status < 500 && err.status !== 429) throw err;
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new FplApiError(path, 0, `FPL request failed: ${path}`);
}

/** Everything: players, teams, gameweeks, chips, scoring rules. ~1MB. */
export const getBootstrap = () => get<FplBootstrap>('/bootstrap-static/');

/** All 380 fixtures. Pass a gameweek to narrow it. */
export const getFixtures = (event?: number) =>
  get<FplFixture[]>(event ? `/fixtures/?event=${event}` : '/fixtures/');

/** Per-player history, upcoming fixtures and past seasons. */
export const getElementSummary = (playerId: number) =>
  get<FplElementSummary>(`/element-summary/${playerId}/`);

/** Live points and BPS during a gameweek. */
export const getLive = (event: number) => get<FplLive>(`/event/${event}/live/`);

/** Tells us whether bonus has been applied yet, so the live job knows when to stop. */
export const getEventStatus = () => get<FplEventStatus>('/event-status/');

/** Public manager profile — no authentication needed. */
export const getEntry = (entryId: number) => get<FplEntry>(`/entry/${entryId}/`);

export const getEntryHistory = (entryId: number) =>
  get<FplEntryHistory>(`/entry/${entryId}/history/`);

/** A manager's picks for a gameweek. Public once that gameweek's deadline has passed. */
export const getEntryPicks = (entryId: number, event: number) =>
  get<FplEntryPicks>(`/entry/${entryId}/event/${event}/picks/`);

// --- Asset URLs (free, no key) ----------------------------------------------

/** Note: takes `element.code`, NOT `element.id`. */
export const playerPhotoUrl = (code: number, size: '110x140' | '250x250' = '250x250') =>
  `https://resources.premierleague.com/premierleague/photos/players/${size}/p${code}.png`;

/** Takes `team.code`, NOT `team.id`. */
export const teamBadgeUrl = (teamCode: number, size: 25 | 50 | 70 = 70) =>
  `https://resources.premierleague.com/premierleague/badges/${size}/t${teamCode}.png`;
