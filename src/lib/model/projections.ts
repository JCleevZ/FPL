/**
 * Expected-points engine.
 *
 * Deterministic and transparent — no training, no ML dependency. Everything the
 * AI features do sits on top of this, and every projection is written to the
 * `predictions` table with a model version so we can grade it against reality
 * later.
 *
 * The shape of it:
 *
 *   xPts = P(appear) x [ appearance + goals + assists + clean sheet
 *                        + saves + defensive contribution + bonus
 *                        - goals conceded - cards ]
 *
 * Attacking output is scaled by how good the opponent's defence is, clean-sheet
 * probability by how good their attack is. Both come from FPL's own home/away
 * team strength ratings.
 */

import { POSITION, type Position } from '@/lib/fpl/types';

export const MODEL_VERSION = 'v1';

// --- FPL scoring rules ------------------------------------------------------

const GOAL_POINTS: Record<Position, number> = { 1: 6, 2: 6, 3: 5, 4: 4 };
const CLEAN_SHEET_POINTS: Record<Position, number> = { 1: 4, 2: 4, 3: 1, 4: 0 };
const ASSIST_POINTS = 3;

/** Defensive-contribution threshold: defenders count CBI, others add tackles/recoveries. */
const DEFCON_THRESHOLD: Record<Position, number> = { 1: Infinity, 2: 10, 3: 12, 4: 12 };
const DEFCON_POINTS = 2;

/** Rough league baseline: goals a team scores per match. */
const LEAGUE_GOALS_PER_TEAM = 1.45;
/** Modest home advantage applied on top of FPL's own home/away strength split. */
const HOME_ATTACK_BOOST = 1.08;

// --- Inputs -----------------------------------------------------------------

export interface PlayerInput {
  id: number;
  team_id: number;
  position: Position;
  now_cost: number;
  status: string | null;
  chance_of_playing_next_round: number | null;
  minutes: number;
  starts: number;
  expected_goals_per_90: number;
  expected_assists_per_90: number;
  expected_goals_conceded_per_90: number;
  saves_per_90: number;
  defensive_contribution_per_90: number;
  bps: number;
  form: number;
  selected_by_percent: number;
  yellow_cards: number;
}

export interface TeamInput {
  id: number;
  /** 1-5 scale. Populated year-round, including preseason. */
  strength_overall_home: number;
  strength_overall_away: number;
  /** ~1000-1400 scale, but ZERO until FPL populates them a few gameweeks in. */
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export interface FixtureInput {
  event: number | null;
  team_h: number;
  team_a: number;
}

export interface Projection {
  player_id: number;
  gw: number;
  xpts: number;
  p_start: number;
  p_clean_sheet: number;
  x_mins: number;
  fixture_count: number;
  detail: Record<string, number>;
}

// --- Availability -----------------------------------------------------------

/**
 * How many matches the stats in `players` cover.
 *
 * Self-calibrating: the busiest player in the league has started nearly every
 * match, so the maximum start count is a good proxy. This matters because
 * `bootstrap-static` keeps *last season's* totals until the new season kicks
 * off — during that window the answer is ~38, not 0.
 */
export function inferMatchesPlayed(players: PlayerInput[]): number {
  return players.reduce((max, p) => Math.max(max, p.starts), 0);
}

/**
 * Probability the player starts.
 *
 * Two independent things multiply together:
 *
 *   fitness  - `chance_of_playing_next_round`, which is what FPL actually
 *              publishes: the chance the player is AVAILABLE. A fit fringe
 *              player is 100% available and still will not start.
 *   role     - how often they have actually started.
 *
 * Conflating the two is how a squad player with 100 minutes all season and
 * `chance_of_playing = 100` ends up rated a nailed-on starter.
 */
export function startProbability(p: PlayerInput, matchesPlayed: number): number {
  if (p.status === 'i' || p.status === 's' || p.status === 'u' || p.status === 'n') return 0;

  const fitness =
    p.chance_of_playing_next_round !== null
      ? p.chance_of_playing_next_round / 100
      : p.status === 'd'
        ? 0.5
        : 1;

  if (fitness === 0) return 0;

  // Nothing to learn from: a new signing, or the very first gameweek of a
  // season. Price is a weak but real proxy for whether they are a regular.
  if (matchesPlayed === 0 || (p.starts === 0 && p.minutes === 0)) {
    return fitness * (p.now_cost >= 60 ? 0.7 : 0.35);
  }

  // Minutes but no starts means a substitute, not a starter.
  const role =
    p.starts === 0
      ? Math.min(0.3, p.minutes / (matchesPlayed * 90))
      : Math.min(1, Math.max(0.05, p.starts / matchesPlayed));

  return fitness * role;
}

// --- Small-sample correction ------------------------------------------------

/**
 * Minutes of "prior" mixed into every per-90 rate.
 *
 * A rate computed from 100 minutes is one lucky shot extrapolated across a
 * season — that is how a £5.0m squad midfielder ends up out-projecting Haaland.
 * Blending each player's own rate with their positional league average, weighted
 * by how many minutes they have actually played, fixes it: a full season of
 * evidence barely moves, 100 minutes gets pulled most of the way back.
 */
const PRIOR_MINUTES = 600;

/** Per-90 rates we shrink. */
type RateKey =
  | 'expected_goals_per_90'
  | 'expected_assists_per_90'
  | 'expected_goals_conceded_per_90'
  | 'saves_per_90'
  | 'defensive_contribution_per_90';

const RATE_KEYS: RateKey[] = [
  'expected_goals_per_90',
  'expected_assists_per_90',
  'expected_goals_conceded_per_90',
  'saves_per_90',
  'defensive_contribution_per_90',
];

export type Priors = Map<Position, Record<RateKey, number> & { bps_per_90: number }>;

/**
 * Minutes-weighted league average of each rate, per position. Self-calibrating:
 * derived from whatever data we have rather than hardcoded.
 */
export function computePriors(players: PlayerInput[]): Priors {
  const priors: Priors = new Map();

  for (const pos of [1, 2, 3, 4] as Position[]) {
    const group = players.filter((p) => p.position === pos && p.minutes > 0);
    const totalMinutes = group.reduce((s, p) => s + p.minutes, 0);

    const weighted = (get: (p: PlayerInput) => number) =>
      totalMinutes > 0 ? group.reduce((s, p) => s + get(p) * p.minutes, 0) / totalMinutes : 0;

    const entry = {} as Record<RateKey, number> & { bps_per_90: number };
    for (const key of RATE_KEYS) entry[key] = weighted((p) => p[key]);
    entry.bps_per_90 = weighted((p) => (p.minutes > 0 ? (p.bps / p.minutes) * 90 : 0));

    priors.set(pos, entry);
  }

  return priors;
}

/** Blend an observed rate with its prior, weighted by sample size. */
export function shrink(rate: number, minutes: number, prior: number): number {
  return (rate * minutes + prior * PRIOR_MINUTES) / (minutes + PRIOR_MINUTES);
}

/** Expected minutes, given they are involved at all. */
function expectedMinutes(p: PlayerInput, pStart: number): number {
  const minsPerStart = p.starts > 0 ? p.minutes / p.starts : 70;
  // Cap at 90 and floor at a sub appearance.
  return Math.min(90, Math.max(15, minsPerStart)) * pStart;
}

// --- Opponent adjustment ----------------------------------------------------

function leagueMean(values: number[]): number {
  const usable = values.filter((v) => Number.isFinite(v) && v > 0);
  if (usable.length === 0) return 0;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

/** Pull a ratio back towards 1. Keeps a coarse scale from producing wild swings. */
const compress = (ratio: number, weight: number) => 1 + (ratio - 1) * weight;

export type StrengthSource = 'detailed' | 'overall' | 'neutral';

interface StrengthModel {
  source: StrengthSource;
  /** Opponent's defence -> how much our attacking output is scaled. */
  attackAdjustment(opponent: TeamInput, opponentAtHome: boolean): number;
  /** Opponent's attack -> how much our concession rate is scaled. */
  concedeAdjustment(opponent: TeamInput, opponentAtHome: boolean): number;
}

/**
 * Resolve team strength with an explicit fallback chain.
 *
 * FPL leaves `strength_attack_*` and `strength_defence_*` at 0 until a few
 * gameweeks into the season. Reading them blindly makes every multiplier 0,
 * which silently zeroes all goal and clean-sheet expectation — the model still
 * returns plausible-looking numbers, which is the dangerous kind of wrong.
 *
 * So: use the detailed ratings when populated, fall back to the 1-5 overall
 * rating (available year-round), and fall back again to neutral. Never zero.
 */
export function resolveStrength(teams: TeamInput[]): StrengthModel {
  const detailedMeanAttack = leagueMean(
    teams.flatMap((t) => [t.strength_attack_home, t.strength_attack_away]),
  );
  const detailedMeanDefence = leagueMean(
    teams.flatMap((t) => [t.strength_defence_home, t.strength_defence_away]),
  );

  if (detailedMeanAttack > 0 && detailedMeanDefence > 0) {
    return {
      source: 'detailed',
      attackAdjustment: (opp, oppHome) => {
        const d = oppHome ? opp.strength_defence_home : opp.strength_defence_away;
        return d > 0 ? compress(detailedMeanDefence / d, 1) : 1;
      },
      concedeAdjustment: (opp, oppHome) => {
        const a = oppHome ? opp.strength_attack_home : opp.strength_attack_away;
        return a > 0 ? compress(a / detailedMeanAttack, 1) : 1;
      },
    };
  }

  // The 1-5 overall rating measures the whole team, so it stands in for both
  // attack and defence. Its range is coarse, so damp it heavily.
  const overallMean = leagueMean(
    teams.flatMap((t) => [t.strength_overall_home, t.strength_overall_away]),
  );

  if (overallMean > 0) {
    const WEIGHT = 0.35;
    return {
      source: 'overall',
      attackAdjustment: (opp, oppHome) => {
        const s = oppHome ? opp.strength_overall_home : opp.strength_overall_away;
        return s > 0 ? compress(overallMean / s, WEIGHT) : 1;
      },
      concedeAdjustment: (opp, oppHome) => {
        const s = oppHome ? opp.strength_overall_home : opp.strength_overall_away;
        return s > 0 ? compress(s / overallMean, WEIGHT) : 1;
      },
    };
  }

  return {
    source: 'neutral',
    attackAdjustment: () => 1,
    concedeAdjustment: () => 1,
  };
}

// --- Main -------------------------------------------------------------------

/**
 * Project every player for one gameweek.
 *
 * Handles blanks and doubles naturally: we iterate the gameweek's fixtures, so a
 * team with two fixtures accumulates two fixtures' worth of points and a team
 * with none scores zero.
 */
export function projectGameweek(
  players: PlayerInput[],
  teams: TeamInput[],
  fixtures: FixtureInput[],
  gw: number,
  matchesPlayed?: number,
): Projection[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const strength = resolveStrength(teams);
  const matches = matchesPlayed ?? inferMatchesPlayed(players);
  const priors = computePriors(players);

  // Each team's fixtures this gameweek: opponent + whether they are at home.
  const teamFixtures = new Map<number, { opponent: number; home: boolean }[]>();
  for (const f of fixtures) {
    if (f.event !== gw) continue;
    if (!teamFixtures.has(f.team_h)) teamFixtures.set(f.team_h, []);
    if (!teamFixtures.has(f.team_a)) teamFixtures.set(f.team_a, []);
    teamFixtures.get(f.team_h)!.push({ opponent: f.team_a, home: true });
    teamFixtures.get(f.team_a)!.push({ opponent: f.team_h, home: false });
  }

  const out: Projection[] = [];

  for (const p of players) {
    const playerFixtures = teamFixtures.get(p.team_id) ?? [];
    const pStart = startProbability(p, matches);
    const xMins = expectedMinutes(p, pStart);

    if (playerFixtures.length === 0 || pStart === 0) {
      out.push({
        player_id: p.id,
        gw,
        xpts: 0,
        p_start: pStart,
        p_clean_sheet: 0,
        x_mins: 0,
        fixture_count: playerFixtures.length,
        detail: {},
      });
      continue;
    }

    // Pull every rate towards its positional average in proportion to how
    // little evidence backs it.
    const prior = priors.get(p.position)!;
    const xg90 = shrink(p.expected_goals_per_90, p.minutes, prior.expected_goals_per_90);
    const xa90 = shrink(p.expected_assists_per_90, p.minutes, prior.expected_assists_per_90);
    const xgc90 = shrink(
      p.expected_goals_conceded_per_90,
      p.minutes,
      prior.expected_goals_conceded_per_90,
    );
    const saves90 = shrink(p.saves_per_90, p.minutes, prior.saves_per_90);
    const dc90 = shrink(
      p.defensive_contribution_per_90,
      p.minutes,
      prior.defensive_contribution_per_90,
    );
    const bps90 = shrink(
      p.minutes > 0 ? (p.bps / p.minutes) * 90 : 0,
      p.minutes,
      prior.bps_per_90,
    );

    let total = 0;
    let csTotal = 0;
    let matchesCounted = 0;
    const detail: Record<string, number> = {
      appearance: 0,
      goals: 0,
      assists: 0,
      clean_sheet: 0,
      saves: 0,
      defcon: 0,
      bonus: 0,
      conceded: 0,
      cards: 0,
    };

    for (const { opponent, home } of playerFixtures) {
      const opp = teamById.get(opponent);
      if (!opp) continue;

      // Tougher opponent defence -> we score less. Stronger opponent attack -> we concede more.
      // If we are at home, the opponent is away, and vice versa.
      const opponentAtHome = !home;
      const attackAdj =
        strength.attackAdjustment(opp, opponentAtHome) * (home ? HOME_ATTACK_BOOST : 1);
      const concedeAdj = strength.concedeAdjustment(opp, opponentAtHome);

      const minsShare = xMins / 90;

      // Appearance: 2 points for 60+ minutes, 1 otherwise.
      const p60 = xMins >= 60 ? pStart : pStart * (xMins / 60);
      const appearance = pStart * 1 + p60 * 1;

      const xGoals = xg90 * minsShare * attackAdj;
      const xAssists = xa90 * minsShare * attackAdj;

      // Clean sheet via Poisson: P(0 conceded) = e^-lambda.
      const lambdaConceded = (xgc90 > 0 ? xgc90 : LEAGUE_GOALS_PER_TEAM) * concedeAdj;
      // Only counts if they are on the pitch for 60+ minutes.
      const pCleanSheet = Math.exp(-lambdaConceded) * (p60 / Math.max(pStart, 1e-9)) * pStart;

      const goalPts = xGoals * GOAL_POINTS[p.position];
      const assistPts = xAssists * ASSIST_POINTS;
      const csPts = pCleanSheet * CLEAN_SHEET_POINTS[p.position];

      // Goalkeepers: 1 point per 3 saves.
      const savePts = p.position === POSITION.GK ? (saves90 * minsShare) / 3 : 0;

      // Goals conceded: -1 per 2, for keepers and defenders only.
      const concededPts =
        p.position === POSITION.GK || p.position === POSITION.DEF
          ? -(lambdaConceded * (xMins / 90)) / 2
          : 0;

      // Defensive contribution: 2 points for clearing the positional threshold.
      // `defensive_contribution_per_90` is read as a count of qualifying actions.
      // If it turns out to be points, the per-90 value never reaches the
      // threshold and this term is simply 0 — it fails safe rather than
      // inventing points.
      //
      // Modelled as a logistic centred on the threshold: a player who *averages*
      // exactly the threshold clears it about half the time. A linear ramp gave
      // them 100%, which made defensive midfielders out-project Haaland.
      // ponytail: logistic stand-in for a Poisson tail. Recalibrate the spread
      //           against player_gw_stats once real gameweeks land.
      const dcRate = dc90 * minsShare;
      const threshold = DEFCON_THRESHOLD[p.position];
      const pDefcon = Number.isFinite(threshold)
        ? 1 / (1 + Math.exp(-(dcRate - threshold) / (0.35 * threshold)))
        : 0;
      const defconPts = pDefcon * DEFCON_POINTS;

      // Bonus: driven by BPS rate. Crude but monotonic — high-BPS players get
      // bonus far more often.
      // ponytail: linear ramp on season BPS/90. Replace with a per-fixture BPS
      //           rank model if bonus prediction ever matters on its own.
      const bonusPts = Math.min(1.4, Math.max(0, (bps90 - 18) / 14)) * minsShare;

      const cardPts = p.minutes > 0 ? -(p.yellow_cards / (p.minutes / 90)) * minsShare : 0;

      detail.appearance += appearance;
      detail.goals += goalPts;
      detail.assists += assistPts;
      detail.clean_sheet += csPts;
      detail.saves += savePts;
      detail.defcon += defconPts;
      detail.bonus += bonusPts;
      detail.conceded += concededPts;
      detail.cards += cardPts;

      csTotal += pCleanSheet;
      matchesCounted++;
      total +=
        appearance +
        goalPts +
        assistPts +
        csPts +
        savePts +
        defconPts +
        bonusPts +
        concededPts +
        cardPts;
    }

    out.push({
      player_id: p.id,
      gw,
      xpts: Math.max(0, round2(total)),
      p_start: round2(pStart),
      p_clean_sheet: matchesCounted > 0 ? round2(csTotal / matchesCounted) : 0,
      x_mins: Math.round(xMins),
      fixture_count: playerFixtures.length,
      detail: Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, round2(v)])),
    });
  }

  return out;
}

/** Sum projections across a gameweek range, keyed by player id. */
export function projectRange(
  players: PlayerInput[],
  teams: TeamInput[],
  fixtures: FixtureInput[],
  fromGw: number,
  toGw: number,
  matchesPlayed?: number,
): Map<number, number> {
  const totals = new Map<number, number>();
  const matches = matchesPlayed ?? inferMatchesPlayed(players);
  for (let gw = fromGw; gw <= toGw; gw++) {
    for (const proj of projectGameweek(players, teams, fixtures, gw, matches)) {
      totals.set(proj.player_id, (totals.get(proj.player_id) ?? 0) + proj.xpts);
    }
  }
  return totals;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
