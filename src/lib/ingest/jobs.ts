/**
 * Ingest jobs: FPL API -> Supabase. Every write is an upsert keyed on a natural
 * key, so re-running a job is harmless and a double-fired cron changes nothing.
 *
 * Server-only — uses the service-role client.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  getBootstrap,
  getEntry,
  getEntryHistory,
  getEntryPicks,
  getEventStatus,
  getFixtures,
  getLive,
} from '@/lib/fpl/client';
import type { FplElement } from '@/lib/fpl/types';

export type JobName = 'snapshot' | 'fixtures' | 'live' | 'entries';

export interface JobResult {
  job: JobName;
  ok: boolean;
  counts: Record<string, number>;
  ms: number;
  note?: string;
}

/** FPL returns most decimals as strings. Coerce, never trust, default to 0. */
const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};

/** Nullable variant, for fields where 0 and "unknown" mean different things. */
const numOrNull = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Supabase rejects very large single payloads; 500 rows per call is comfortable. */
async function upsertChunked<T extends object>(
  table: string,
  rows: T[],
  onConflict: string,
  chunk = 500,
): Promise<number> {
  const db = createAdminClient();
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db
      .from(table)
      .upsert(rows.slice(i, i + chunk), { onConflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// snapshot — the important one. One bootstrap fetch feeds teams, gameweeks,
// players and the price/ownership history that exists nowhere else.
// ---------------------------------------------------------------------------

export async function runSnapshot(): Promise<JobResult> {
  const started = Date.now();
  const bs = await getBootstrap();
  const capturedAt = new Date().toISOString();

  const teams = bs.teams.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    short_name: t.short_name,
    strength: t.strength,
    strength_overall_home: t.strength_overall_home,
    strength_overall_away: t.strength_overall_away,
    strength_attack_home: t.strength_attack_home,
    strength_attack_away: t.strength_attack_away,
    strength_defence_home: t.strength_defence_home,
    strength_defence_away: t.strength_defence_away,
    position: t.position,
    played: t.played,
    win: t.win,
    draw: t.draw,
    loss: t.loss,
    points: t.points,
    updated_at: capturedAt,
  }));

  const gameweeks = bs.events.map((e) => ({
    id: e.id,
    name: e.name,
    deadline_time: e.deadline_time,
    is_current: e.is_current,
    is_next: e.is_next,
    is_previous: e.is_previous,
    finished: e.finished,
    data_checked: e.data_checked,
    average_entry_score: e.average_entry_score,
    highest_score: e.highest_score,
    most_selected: e.most_selected,
    most_transferred_in: e.most_transferred_in,
    most_captained: e.most_captained,
    most_vice_captained: e.most_vice_captained,
    top_element: e.top_element,
    transfers_made: e.transfers_made,
    chip_plays: e.chip_plays,
    updated_at: capturedAt,
  }));

  const players = bs.elements.map((p: FplElement) => ({
    id: p.id,
    code: p.code,
    first_name: p.first_name,
    second_name: p.second_name,
    web_name: p.web_name,
    team_id: p.team,
    position: p.element_type,
    now_cost: p.now_cost,
    cost_change_start: p.cost_change_start,
    cost_change_event: p.cost_change_event,

    status: p.status,
    news: p.news,
    news_added: p.news_added,
    chance_of_playing_this_round: p.chance_of_playing_this_round,
    chance_of_playing_next_round: p.chance_of_playing_next_round,

    total_points: p.total_points,
    points_per_game: num(p.points_per_game),
    form: num(p.form),
    minutes: p.minutes,
    starts: p.starts,
    goals_scored: p.goals_scored,
    assists: p.assists,
    clean_sheets: p.clean_sheets,
    goals_conceded: p.goals_conceded,
    own_goals: p.own_goals,
    penalties_saved: p.penalties_saved,
    penalties_missed: p.penalties_missed,
    yellow_cards: p.yellow_cards,
    red_cards: p.red_cards,
    saves: p.saves,
    bonus: p.bonus,
    bps: p.bps,

    defensive_contribution: p.defensive_contribution ?? 0,
    clearances_blocks_interceptions: p.clearances_blocks_interceptions ?? 0,
    recoveries: p.recoveries ?? 0,
    tackles: p.tackles ?? 0,

    expected_goals: num(p.expected_goals),
    expected_assists: num(p.expected_assists),
    expected_goal_involvements: num(p.expected_goal_involvements),
    expected_goals_conceded: num(p.expected_goals_conceded),
    expected_goals_per_90: num(p.expected_goals_per_90),
    expected_assists_per_90: num(p.expected_assists_per_90),
    expected_goal_involvements_per_90: num(p.expected_goal_involvements_per_90),
    expected_goals_conceded_per_90: num(p.expected_goals_conceded_per_90),
    starts_per_90: num(p.starts_per_90),
    clean_sheets_per_90: num(p.clean_sheets_per_90),
    saves_per_90: num(p.saves_per_90),
    defensive_contribution_per_90: num(p.defensive_contribution_per_90),

    influence: num(p.influence),
    creativity: num(p.creativity),
    threat: num(p.threat),
    ict_index: num(p.ict_index),

    selected_by_percent: num(p.selected_by_percent),
    transfers_in: p.transfers_in,
    transfers_out: p.transfers_out,
    transfers_in_event: p.transfers_in_event,
    transfers_out_event: p.transfers_out_event,
    value_form: numOrNull(p.value_form),
    value_season: numOrNull(p.value_season),
    ep_this: numOrNull(p.ep_this),
    ep_next: numOrNull(p.ep_next),

    penalties_order: p.penalties_order,
    direct_freekicks_order: p.direct_freekicks_order,
    corners_and_indirect_freekicks_order: p.corners_and_indirect_freekicks_order,

    updated_at: capturedAt,
  }));

  // Order matters: players reference teams, fixtures reference gameweeks.
  await upsertChunked('teams', teams, 'id');
  await upsertChunked('gameweeks', gameweeks, 'id');
  await upsertChunked('players', players, 'id');

  // The point of the whole exercise. FPL exposes no price or ownership history,
  // so this row is the only record that this player cost this much at this time.
  const snapshots = bs.elements.map((p) => ({
    player_id: p.id,
    captured_at: capturedAt,
    now_cost: p.now_cost,
    cost_change_event: p.cost_change_event,
    selected_by_percent: num(p.selected_by_percent),
    transfers_in_event: p.transfers_in_event,
    transfers_out_event: p.transfers_out_event,
    form: num(p.form),
    status: p.status,
  }));
  await upsertChunked('price_snapshots', snapshots, 'player_id,captured_at');

  return {
    job: 'snapshot',
    ok: true,
    counts: {
      teams: teams.length,
      gameweeks: gameweeks.length,
      players: players.length,
      price_snapshots: snapshots.length,
    },
    ms: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

export async function runFixtures(): Promise<JobResult> {
  const started = Date.now();
  const fixtures = await getFixtures();

  const rows = fixtures.map((f) => ({
    id: f.id,
    code: f.code,
    event: f.event,
    team_h: f.team_h,
    team_a: f.team_a,
    team_h_score: f.team_h_score,
    team_a_score: f.team_a_score,
    team_h_difficulty: f.team_h_difficulty,
    team_a_difficulty: f.team_a_difficulty,
    kickoff_time: f.kickoff_time,
    started: f.started ?? false,
    finished: f.finished ?? false,
    finished_provisional: f.finished_provisional ?? false,
    minutes: f.minutes ?? 0,
    stats: f.stats ?? [],
    updated_at: new Date().toISOString(),
  }));

  await upsertChunked('fixtures', rows, 'id');

  return {
    job: 'fixtures',
    ok: true,
    counts: { fixtures: rows.length },
    ms: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// live — per-player gameweek actuals. Skips entirely when no gameweek is active,
// so it is cheap to schedule aggressively.
// ---------------------------------------------------------------------------

export async function runLive(): Promise<JobResult> {
  const started = Date.now();
  const bs = await getBootstrap();
  const current = bs.events.find((e) => e.is_current);

  if (!current) {
    return {
      job: 'live',
      ok: true,
      counts: {},
      ms: Date.now() - started,
      note: 'no current gameweek — nothing to do',
    };
  }

  const [live, status] = await Promise.all([getLive(current.id), getEventStatus()]);

  // Which teams played whom this gameweek, for opponent attribution.
  const fixtures = await getFixtures(current.id);
  const opponentOf = new Map<number, { opponent: number; home: boolean }>();
  for (const f of fixtures) {
    opponentOf.set(f.team_h, { opponent: f.team_a, home: true });
    opponentOf.set(f.team_a, { opponent: f.team_h, home: false });
  }
  const teamOf = new Map(bs.elements.map((p) => [p.id, p.team]));
  const fixtureCount = new Map<number, number>();
  for (const f of fixtures) {
    fixtureCount.set(f.team_h, (fixtureCount.get(f.team_h) ?? 0) + 1);
    fixtureCount.set(f.team_a, (fixtureCount.get(f.team_a) ?? 0) + 1);
  }

  const rows = live.elements.map((el) => {
    const team = teamOf.get(el.id);
    const opp = team ? opponentOf.get(team) : undefined;
    const s = el.stats;
    return {
      player_id: el.id,
      gw: current.id,
      fixture_count: team ? (fixtureCount.get(team) ?? 0) : 0,
      opponent_team: opp?.opponent ?? null,
      was_home: opp?.home ?? null,
      total_points: s.total_points,
      minutes: s.minutes,
      starts: s.minutes > 0 ? 1 : 0,
      goals_scored: s.goals_scored,
      assists: s.assists,
      clean_sheets: s.clean_sheets,
      goals_conceded: s.goals_conceded,
      own_goals: s.own_goals,
      penalties_saved: s.penalties_saved,
      penalties_missed: s.penalties_missed,
      yellow_cards: s.yellow_cards,
      red_cards: s.red_cards,
      saves: s.saves,
      bonus: s.bonus,
      bps: s.bps,
      defensive_contribution: s.defensive_contribution ?? 0,
      updated_at: new Date().toISOString(),
    };
  });

  await upsertChunked('player_gw_stats', rows, 'player_id,gw');

  const bonusAdded = status.status.every((s) => s.bonus_added);

  return {
    job: 'live',
    ok: true,
    counts: { player_gw_stats: rows.length },
    ms: Date.now() - started,
    note: `GW${current.id}, bonus ${bonusAdded ? 'final' : 'provisional'}`,
  };
}

// ---------------------------------------------------------------------------
// entries — refresh every tracked FPL manager.
// ---------------------------------------------------------------------------

export async function runEntries(): Promise<JobResult> {
  const started = Date.now();
  const db = createAdminClient();

  // Every entry id any user has claimed on their profile.
  const { data: profiles, error } = await db
    .from('profiles')
    .select('fpl_entry_id')
    .not('fpl_entry_id', 'is', null);
  if (error) throw new Error(`read profiles: ${error.message}`);

  const ids = [...new Set((profiles ?? []).map((p) => p.fpl_entry_id as number))];
  if (ids.length === 0) {
    return {
      job: 'entries',
      ok: true,
      counts: {},
      ms: Date.now() - started,
      note: 'no linked FPL teams yet',
    };
  }

  let gwRows = 0;
  let pickRows = 0;

  for (const id of ids) {
    // One manager failing (deleted team, bad id) must not abort the others.
    try {
      const [entry, history] = await Promise.all([getEntry(id), getEntryHistory(id)]);

      await upsertChunked(
        'entries',
        [
          {
            id: entry.id,
            player_name: `${entry.player_first_name} ${entry.player_last_name}`.trim(),
            team_name: entry.name,
            started_event: entry.started_event,
            overall_rank: entry.summary_overall_rank,
            total_points: entry.summary_overall_points,
            updated_at: new Date().toISOString(),
          },
        ],
        'id',
      );

      const chipByEvent = new Map(history.chips.map((c) => [c.event, c.name]));
      const gws = history.current.map((h) => ({
        entry_id: id,
        gw: h.event,
        points: h.points,
        total_points: h.total_points,
        rank: h.rank,
        overall_rank: h.overall_rank,
        bank: h.bank,
        value: h.value,
        event_transfers: h.event_transfers,
        event_transfers_cost: h.event_transfers_cost,
        points_on_bench: h.points_on_bench,
        chip: chipByEvent.get(h.event) ?? null,
      }));
      if (gws.length) {
        await upsertChunked('entry_gw', gws, 'entry_id,gw');
        gwRows += gws.length;
      }

      // Picks are public only once a deadline has passed, so iterate the
      // gameweeks the manager has actually played.
      for (const h of history.current) {
        try {
          const picks = await getEntryPicks(id, h.event);
          const rows = picks.picks.map((p) => ({
            entry_id: id,
            gw: h.event,
            player_id: p.element,
            position: p.position,
            multiplier: p.multiplier,
            is_captain: p.is_captain,
            is_vice_captain: p.is_vice_captain,
          }));
          await upsertChunked('entry_picks', rows, 'entry_id,gw,player_id');
          pickRows += rows.length;
        } catch {
          // Picks unavailable for this gameweek — skip it, keep the rest.
        }
      }
    } catch (err) {
      console.error(`entries: failed for entry ${id}`, err);
    }
  }

  return {
    job: 'entries',
    ok: true,
    counts: { entries: ids.length, entry_gw: gwRows, entry_picks: pickRows },
    ms: Date.now() - started,
  };
}

export const JOBS: Record<JobName, () => Promise<JobResult>> = {
  snapshot: runSnapshot,
  fixtures: runFixtures,
  live: runLive,
  entries: runEntries,
};
