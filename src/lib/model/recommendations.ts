/**
 * Live player recommendations.
 *
 * Ranked by projected points over the next few gameweeks — which already folds
 * in fixtures, expected minutes and underlying numbers — then annotated with the
 * signals a human actually acts on: form, fixture run, injury news, price
 * momentum, ownership and whether they are nailed on to start.
 *
 * Everything is recomputed from the latest ingest on each load, so the list
 * moves as prices change, news breaks and fixtures approach.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  inferMatchesPlayed,
  projectGameweek,
  projectRange,
  type FixtureInput,
  type PlayerInput,
  type TeamInput,
} from '@/lib/model/projections';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import type { ReasonKey } from '@/lib/glossary';

export interface Recommendation {
  id: number;
  web_name: string;
  position: Position;
  team_id: number;
  team_short: string;
  now_cost: number;
  xpts: number;
  form: number;
  total_points: number;
  selected_by_percent: number;
  /** Mean FPL difficulty over the horizon; lower is kinder. */
  fixtureDifficulty: number;
  /** Net transfers this gameweek — the price-change signal. */
  netTransfers: number;
  /** Probability they start the next match, 0-1. */
  startProbability: number;
  status: string | null;
  news: string | null;
  reasons: ReasonKey[];
}

export interface RecommendationSet {
  fromGw: number;
  toGw: number;
  byPosition: Record<Position, Recommendation[]>;
  /** Best regardless of position. */
  overall: Recommendation[];
  /** When the underlying player data was last refreshed from FPL. */
  dataUpdatedAt: string | null;
  /** Recent FPL status updates, newest first. */
  latestNews: { id: number; team_id: number; web_name: string; team_short: string; news: string; added: string }[];
}

interface Row {
  id: number;
  web_name: string;
  team_id: number;
  position: number;
  now_cost: number;
  status: string | null;
  news: string | null;
  news_added: string | null;
  chance_of_playing_next_round: number | null;
  minutes: number;
  starts: number;
  expected_goals_per_90: number | null;
  expected_assists_per_90: number | null;
  expected_goals_conceded_per_90: number | null;
  saves_per_90: number | null;
  defensive_contribution_per_90: number | null;
  bps: number;
  form: number | null;
  selected_by_percent: number | null;
  yellow_cards: number;
  total_points: number;
  transfers_in_event: number | null;
  transfers_out_event: number | null;
  penalties_order: number | null;
  direct_freekicks_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  updated_at: string | null;
}

interface TeamRow {
  id: number;
  short_name: string;
  played: number | null;
  points: number | null;
  strength_overall_home: number | null;
  strength_overall_away: number | null;
  strength_attack_home: number | null;
  strength_attack_away: number | null;
  strength_defence_home: number | null;
  strength_defence_away: number | null;
}

export interface InsightSet {
  fromGw: number;
  toGw: number;
  /** Every player, unfiltered, ranked by projected points. */
  all: Recommendation[];
  /** The same records keyed by player id, for direct lookup. */
  byId: Map<number, Recommendation>;
  dataUpdatedAt: string | null;
  latestNews: { id: number; team_id: number; web_name: string; team_short: string; news: string; added: string }[];
}

export interface RecommendationOptions {
  /** Players already owned — excluded from suggestions. */
  excludeIds?: number[];
  /** Only suggest players at or below this price. */
  maxCost?: number;
  /** Only suggest these positions. */
  positions?: Position[];
  perPosition?: number;
  horizon?: number;
}

const DAY = 86_400_000;

/**
 * Stats, projections and tags for every player in the league.
 *
 * This is the single source of truth the whole app reads from, so a player
 * carries identical numbers and identical tags wherever they appear.
 */
export async function getInsights(horizon = 5): Promise<InsightSet> {
  const db = createAdminClient();

  const [players, teams, fixtures, gw] = await Promise.all([
    db
      .from('players')
      .select(
        'id, web_name, team_id, position, now_cost, status, news, news_added, ' +
          'chance_of_playing_next_round, minutes, starts, expected_goals_per_90, ' +
          'expected_assists_per_90, expected_goals_conceded_per_90, saves_per_90, ' +
          'defensive_contribution_per_90, bps, form, selected_by_percent, yellow_cards, ' +
          'total_points, transfers_in_event, transfers_out_event, penalties_order, ' +
          'direct_freekicks_order, corners_and_indirect_freekicks_order, updated_at',
      )
      .limit(1000),
    db
      .from('teams')
      .select(
        'id, short_name, played, points, strength_overall_home, strength_overall_away, ' +
          'strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away',
      ),
    db.from('fixtures').select('event, team_h, team_a, team_h_difficulty, team_a_difficulty'),
    db.from('gameweeks').select('id').or('is_next.eq.true,is_current.eq.true').order('id').limit(1),
  ]);

  const rows = (players.data ?? []) as unknown as Row[];
  const teamRows = (teams.data ?? []) as unknown as TeamRow[];
  const fixtureRows = (fixtures.data ?? []) as unknown as (FixtureInput & {
    team_h_difficulty: number | null;
    team_a_difficulty: number | null;
  })[];

  const fromGw = (gw.data?.[0]?.id as number | undefined) ?? 1;
  const toGw = Math.min(38, fromGw + horizon - 1);

  const modelPlayers: PlayerInput[] = rows.map((p) => ({
    id: p.id,
    team_id: p.team_id,
    position: p.position as Position,
    now_cost: p.now_cost,
    status: p.status,
    chance_of_playing_next_round: p.chance_of_playing_next_round,
    minutes: p.minutes,
    starts: p.starts,
    expected_goals_per_90: Number(p.expected_goals_per_90 ?? 0),
    expected_assists_per_90: Number(p.expected_assists_per_90 ?? 0),
    expected_goals_conceded_per_90: Number(p.expected_goals_conceded_per_90 ?? 0),
    saves_per_90: Number(p.saves_per_90 ?? 0),
    defensive_contribution_per_90: Number(p.defensive_contribution_per_90 ?? 0),
    bps: p.bps,
    form: Number(p.form ?? 0),
    selected_by_percent: Number(p.selected_by_percent ?? 0),
    yellow_cards: p.yellow_cards,
  }));

  const modelTeams: TeamInput[] = teamRows.map((t) => ({
    id: t.id,
    strength_overall_home: t.strength_overall_home ?? 0,
    strength_overall_away: t.strength_overall_away ?? 0,
    strength_attack_home: t.strength_attack_home ?? 0,
    strength_attack_away: t.strength_attack_away ?? 0,
    strength_defence_home: t.strength_defence_home ?? 0,
    strength_defence_away: t.strength_defence_away ?? 0,
  }));

  const matches = inferMatchesPlayed(modelPlayers);
  const xpts = projectRange(modelPlayers, modelTeams, fixtureRows, fromGw, toGw, matches);
  const pStart = new Map(
    projectGameweek(modelPlayers, modelTeams, fixtureRows, fromGw, matches).map((p) => [
      p.player_id,
      p.p_start,
    ]),
  );

  // Mean fixture difficulty per club across the horizon.
  const difficulty = new Map<number, { total: number; n: number }>();
  for (const f of fixtureRows) {
    if (f.event === null || f.event < fromGw || f.event > toGw) continue;
    const add = (teamId: number, d: number | null) => {
      const cur = difficulty.get(teamId) ?? { total: 0, n: 0 };
      cur.total += d ?? 3;
      cur.n += 1;
      difficulty.set(teamId, cur);
    };
    add(f.team_h, f.team_h_difficulty);
    add(f.team_a, f.team_a_difficulty);
  }
  const meanDifficulty = (teamId: number) => {
    const d = difficulty.get(teamId);
    return d && d.n > 0 ? d.total / d.n : 3;
  };

  // Clubs picking up results lift everyone in the side. Only meaningful once
  // matches have been played, so it stays silent preseason.
  const leaguePpg = (() => {
    const played = teamRows.filter((t) => (t.played ?? 0) > 0);
    if (!played.length) return null;
    const total = played.reduce((s, t) => s + (t.points ?? 0), 0);
    const games = played.reduce((s, t) => s + (t.played ?? 0), 0);
    return games > 0 ? total / games : null;
  })();
  const teamInForm = (teamId: number) => {
    if (leaguePpg === null) return false;
    const t = teamRows.find((x) => x.id === teamId);
    if (!t || !t.played) return false;
    return (t.points ?? 0) / t.played > leaguePpg * 1.25;
  };

  const teamShort = new Map(teamRows.map((t) => [t.id, t.short_name]));
  const formValues = rows.map((p) => Number(p.form ?? 0)).sort((a, b) => b - a);
  const hotFormThreshold = formValues[Math.floor(formValues.length * 0.1)] ?? 0;
  const now = Date.now();

  const all: Recommendation[] = rows
    .map((p) => {
      const points = xpts.get(p.id) ?? 0;
      const fixtureScore = meanDifficulty(p.team_id);
      const net = Number(p.transfers_in_event ?? 0) - Number(p.transfers_out_event ?? 0);
      const form = Number(p.form ?? 0);
      const ownership = Number(p.selected_by_percent ?? 0);
      const start = pStart.get(p.id) ?? 0;

      const reasons: ReasonKey[] = [];
      if (fixtureScore <= 2.6) reasons.push('kindFixtures');
      else if (fixtureScore >= 3.6) reasons.push('toughFixtures');
      if (form > 0 && form >= hotFormThreshold) reasons.push('hotForm');
      if (teamInForm(p.team_id)) reasons.push('teamInForm');
      if (points / (p.now_cost / 10) > 4) reasons.push('goodValue');
      if (net > 30_000) reasons.push('risingPrice');
      else if (net < -30_000) reasons.push('fallingPrice');
      if (ownership < 8) reasons.push('lowOwnership');
      else if (ownership > 50) reasons.push('highlyOwned');
      if (start >= 0.9) reasons.push('nailed');
      else if (start < 0.7) reasons.push('rotationRisk');
      if (
        p.penalties_order === 1 ||
        p.direct_freekicks_order === 1 ||
        p.corners_and_indirect_freekicks_order === 1
      ) {
        reasons.push('setPieces');
      }
      if (p.status && p.status !== 'a') reasons.push('injuryDoubt');
      if (p.news_added && now - new Date(p.news_added).getTime() < 3 * DAY) {
        reasons.push('freshNews');
      }

      return {
        id: p.id,
        web_name: p.web_name,
        position: p.position as Position,
        team_id: p.team_id,
        team_short: teamShort.get(p.team_id) ?? '',
        now_cost: p.now_cost,
        xpts: Math.round(points * 10) / 10,
        form,
        total_points: p.total_points,
        selected_by_percent: ownership,
        fixtureDifficulty: Math.round(fixtureScore * 100) / 100,
        netTransfers: net,
        startProbability: start,
        status: p.status,
        news: p.news,
        reasons,
      };
    })
    .sort((a, b) => b.xpts - a.xpts);

  const dataUpdatedAt =
    rows.reduce<string | null>(
      (latest, p) => (p.updated_at && (!latest || p.updated_at > latest) ? p.updated_at : latest),
      null,
    ) ?? null;

  const latestNews = rows
    .filter((p) => p.news && p.news.trim().length > 0 && p.news_added)
    .sort((a, b) => (b.news_added! > a.news_added! ? 1 : -1))
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      team_id: p.team_id,
      web_name: p.web_name,
      team_short: teamShort.get(p.team_id) ?? '',
      news: p.news!,
      added: p.news_added!,
    }));

  return {
    fromGw,
    toGw,
    all,
    byId: new Map(all.map((r) => [r.id, r])),
    dataUpdatedAt,
    latestNews,
  };
}

/**
 * The subset worth suggesting: filtered to what the caller asked for, and
 * ranked. Built on top of getInsights so the numbers are identical to the ones
 * shown for a player you already own.
 */
export async function getRecommendations(
  options: RecommendationOptions = {},
): Promise<RecommendationSet> {
  const insights = await getInsights(options.horizon ?? 5);
  const exclude = new Set(options.excludeIds ?? []);
  const perPosition = options.perPosition ?? 5;

  const eligible = insights.all.filter((r) => {
    if (exclude.has(r.id)) return false;
    if (options.maxCost !== undefined && r.now_cost > options.maxCost) return false;
    if (options.positions && !options.positions.includes(r.position)) return false;
    // Never suggest someone unlikely to play at all.
    if (r.startProbability < 0.5) return false;
    return true;
  });

  const byPosition = { 1: [], 2: [], 3: [], 4: [] } as Record<Position, Recommendation[]>;
  for (const pos of [1, 2, 3, 4] as Position[]) {
    byPosition[pos] = eligible.filter((r) => r.position === pos).slice(0, perPosition);
  }

  return {
    fromGw: insights.fromGw,
    toGw: insights.toGw,
    byPosition,
    overall: eligible.slice(0, 20),
    dataUpdatedAt: insights.dataUpdatedAt,
    latestNews: insights.latestNews,
  };
}

export { POSITION_NAME };
