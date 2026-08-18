/**
 * AI Squad Builder — four stages.
 *
 *   1. Deterministic filter   apply every hard constraint, narrow to ~160 candidates
 *   2. Optimiser              produce 2-3 squads that are legal by construction
 *   3. LLM                    choose, refine within the pool, name it, explain it
 *   4. Validator              re-check every FPL rule before anything is returned
 *
 * The division of labour is the whole point: the LLM is good at judgement and
 * narrative and bad at arithmetic under constraints, so it never gets to decide
 * whether a squad is legal.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  inferMatchesPlayed,
  projectGameweek,
  projectRange,
  type PlayerInput,
  type TeamInput,
} from '@/lib/model/projections';
import {
  buildSquads,
  validateSquad,
  SQUAD_QUOTA,
  type Candidate,
  type Constraints,
  type Squad,
} from '@/lib/model/optimiser';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { generateWithFallback } from '@/lib/ai/provider';
import {
  HORIZON_GAMEWEEKS,
  squadChoiceSchema,
  squadFiltersSchema,
  type ResolvedSquadFilters,
  type SquadChoice,
  type SquadFilters,
} from '@/lib/ai/schemas';

export interface BuiltSquad {
  name: string;
  strategy: string;
  keyRisk: string;
  squad: Squad;
  players: (Candidate & { note?: string; teamShort: string; status: string | null })[];
  captainId: number;
  viceCaptainId: number;
  horizonGameweeks: [number, number];
  provider: string;
  model: string;
  cached: boolean;
  /** Set when the LLM was unusable and we fell back to the optimiser's pick. */
  fallbackReason?: string;
  /** Preferences that had to give way to produce a legal 15. */
  relaxations: string[];
}

interface LoadedData {
  players: PlayerInput[];
  teams: TeamInput[];
  fixtures: { event: number | null; team_h: number; team_a: number }[];
  meta: Map<number, { web_name: string; team_id: number; status: string | null; code: number }>;
  teamShort: Map<number, string>;
  /** Players on any of the penalty / free-kick / corner lists. */
  setPieceIds: Set<number>;
  firstGw: number;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function load(): Promise<LoadedData> {
  const db = createAdminClient();

  const [players, teams, fixtures, gw] = await Promise.all([
    db
      .from('players')
      .select(
        'id, code, web_name, team_id, position, now_cost, status, chance_of_playing_next_round, ' +
          'minutes, starts, expected_goals_per_90, expected_assists_per_90, ' +
          'expected_goals_conceded_per_90, saves_per_90, defensive_contribution_per_90, ' +
          'bps, form, selected_by_percent, yellow_cards, penalties_order, ' +
          'direct_freekicks_order, corners_and_indirect_freekicks_order, cost_change_event, ' +
          'transfers_in_event, transfers_out_event',
      )
      .limit(1000),
    db
      .from('teams')
      .select(
        'id, short_name, strength_overall_home, strength_overall_away, strength_attack_home, ' +
          'strength_attack_away, strength_defence_home, strength_defence_away',
      ),
    db.from('fixtures').select('event, team_h, team_a'),
    db.from('gameweeks').select('id').or('is_next.eq.true,is_current.eq.true').order('id').limit(1),
  ]);

  if (players.error) throw new Error(`load players: ${players.error.message}`);
  if (teams.error) throw new Error(`load teams: ${teams.error.message}`);
  if (fixtures.error) throw new Error(`load fixtures: ${fixtures.error.message}`);
  if (!players.data?.length) {
    throw new Error('No players in the database. Run `npm run ingest all` first.');
  }

  // No generated database types in this project, and supabase-js cannot infer
  // row shapes from a multi-line select string, so the shapes are declared
  // explicitly below (RawPlayer / RawTeam) and asserted here.
  const raw = players.data as unknown as RawPlayer[];
  const rawTeams = (teams.data ?? []) as unknown as RawTeam[];

  return {
    players: raw.map((p) => ({
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
    })),
    teams: rawTeams.map((t) => ({
      id: t.id,
      strength_overall_home: t.strength_overall_home ?? 0,
      strength_overall_away: t.strength_overall_away ?? 0,
      strength_attack_home: t.strength_attack_home ?? 0,
      strength_attack_away: t.strength_attack_away ?? 0,
      strength_defence_home: t.strength_defence_home ?? 0,
      strength_defence_away: t.strength_defence_away ?? 0,
    })),
    fixtures: (fixtures.data ?? []) as unknown as LoadedData['fixtures'],
    meta: new Map(
      raw.map((p) => [
        p.id,
        { web_name: p.web_name, team_id: p.team_id, status: p.status, code: p.code },
      ]),
    ),
    teamShort: new Map(rawTeams.map((t) => [t.id, t.short_name])),
    // Already present in the rows we selected — no second query needed.
    setPieceIds: new Set(
      raw
        .filter(
          (p) =>
            p.penalties_order !== null ||
            p.direct_freekicks_order !== null ||
            p.corners_and_indirect_freekicks_order !== null,
        )
        .map((p) => p.id),
    ),
    firstGw: gw.data?.[0]?.id ?? 1,
  };
}

interface RawPlayer {
  id: number;
  code: number;
  web_name: string;
  team_id: number;
  position: number;
  now_cost: number;
  status: string | null;
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
  penalties_order: number | null;
  direct_freekicks_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  cost_change_event: number | null;
  transfers_in_event: number | null;
  transfers_out_event: number | null;
}

interface RawTeam {
  id: number;
  short_name: string;
  strength_overall_home: number | null;
  strength_overall_away: number | null;
  strength_attack_home: number | null;
  strength_attack_away: number | null;
  strength_defence_home: number | null;
  strength_defence_away: number | null;
}

// ---------------------------------------------------------------------------
// Stage 1 — deterministic filter
// ---------------------------------------------------------------------------

/**
 * Ownership ceiling implied by the risk slider, when not set explicitly.
 *
 * The slider sits at 0.5 by default, so the middle of the range must mean "no
 * opinion" — an earlier version imposed a 40% cap there and made the default
 * build fail outright. Only a deliberate push towards maverick narrows anything.
 */
function ownershipCeiling(f: ResolvedSquadFilters): number | undefined {
  if (f.maxOwnership !== undefined) return f.maxOwnership;
  if (f.riskAppetite === undefined || f.riskAppetite <= 0.6) return undefined;
  return f.riskAppetite <= 0.8 ? 30 : 15;
}

/**
 * How available a player is, on a 0-1 scale.
 *
 * Deliberately NOT start probability. `pStart` folds in how often someone
 * starts, so filtering on it made "fully fit only" mean "started every single
 * match", which excluded almost the entire league. Fitness and role are
 * different questions and only fitness belongs here.
 */
function availability(p: PlayerInput): number {
  if (p.status === 'i' || p.status === 's' || p.status === 'u' || p.status === 'n') return 0;
  if (p.chance_of_playing_next_round !== null) return p.chance_of_playing_next_round / 100;
  if (p.status === 'd') return 0.5;
  return 1;
}

const AVAILABILITY_FLOOR: Record<
  NonNullable<ResolvedSquadFilters['injuryTolerance']>,
  number
> = {
  strict: 1, // no flag of any kind
  moderate: 0.75,
  relaxed: 0.25,
};

/** Candidates per position we want before the optimiser has real freedom. */
const MIN_POOL_PER_POSITION: Record<Position, number> = { 1: 5, 2: 9, 3: 9, 4: 6 };

function selectCandidates(
  data: LoadedData,
  filters: ResolvedSquadFilters,
  xpts: Map<number, number>,
  pStart: Map<number, number>,
): { candidates: Candidate[]; relaxations: string[] } {
  const relaxations: string[] = [];
  const excluded = new Set<number>(filters.mustExcludeIds ?? []);

  // A rival club is a hard exclusion of every one of their players.
  if (filters.rivalTeamId) {
    for (const p of data.players) if (p.team_id === filters.rivalTeamId) excluded.add(p.id);
  }

  const mustInclude = new Set(filters.mustIncludeIds ?? []);
  const ceiling = ownershipCeiling(filters);
  const floor = filters.injuryTolerance
    ? AVAILABILITY_FLOOR[filters.injuryTolerance]
    : 0.25;

  const toCandidate = (p: PlayerInput): Candidate => ({
    id: p.id,
    position: p.position,
    team_id: p.team_id,
    cost: p.now_cost,
    xpts: xpts.get(p.id) ?? 0,
    ownership: p.selected_by_percent,
    web_name: data.meta.get(p.id)?.web_name ?? String(p.id),
  });

  /** Hard filters — never relaxed, because the user named these explicitly. */
  const passesHard = (p: PlayerInput) => {
    if (excluded.has(p.id)) return false;
    if (filters.minStartProbability !== undefined) {
      if ((pStart.get(p.id) ?? 0) < filters.minStartProbability) return false;
    }
    // Keepers are exempt: none take set pieces, and a legal squad needs two.
    if (filters.setPieceTakersOnly && p.position !== 1 && !data.setPieceIds.has(p.id)) {
      return false;
    }
    return true;
  };

  /** Soft filters — narrowed first, widened only if a legal squad needs it. */
  const passesSoft = (p: PlayerInput) => {
    if (availability(p) < floor) return false;
    if (ceiling !== undefined && p.selected_by_percent > ceiling) return false;
    return true;
  };

  const hardPool = data.players.filter(passesHard);
  const candidates = new Map<number, Candidate>();

  for (const pos of [1, 2, 3, 4] as Position[]) {
    const all = hardPool.filter((p) => p.position === pos);
    const preferred = all.filter(passesSoft);

    const take = (list: PlayerInput[]) => {
      const byPoints = [...list].sort((a, b) => (xpts.get(b.id) ?? 0) - (xpts.get(a.id) ?? 0));
      const byPrice = [...list].sort((a, b) => a.now_cost - b.now_cost);
      for (const p of byPoints.slice(0, 30)) candidates.set(p.id, toCandidate(p));
      for (const p of byPrice.slice(0, 12)) candidates.set(p.id, toCandidate(p));
    };

    take(preferred);

    // A squad needs bodies in every position, and the cheap ones tend to be
    // exactly what an ownership cap or a fitness filter strips out. Rather than
    // fail, top up from the wider pool and say so — a differential squad is
    // about your starting XI, not your third-choice keeper.
    const have = [...candidates.values()].filter((c) => c.position === pos).length;
    const need = MIN_POOL_PER_POSITION[pos];
    if (have < need && all.length > preferred.length) {
      const topUp = all
        .filter((p) => !candidates.has(p.id))
        .sort((a, b) => a.now_cost - b.now_cost)
        .slice(0, need - have);
      for (const p of topUp) candidates.set(p.id, toCandidate(p));
      if (topUp.length) {
        relaxations.push(
          `not enough ${POSITION_NAME[pos]} options passed your filters, so cheaper ones were allowed in`,
        );
      }
    }
  }

  // Locked players must be in the pool even if they would not have qualified.
  for (const id of mustInclude) {
    const p = data.players.find((x) => x.id === id);
    if (p) candidates.set(id, toCandidate(p));
  }

  return { candidates: [...candidates.values()], relaxations };
}

/**
 * Catch contradictions in the hard constraints before searching, so the user
 * gets told what is actually wrong instead of a shrug.
 */
function findContradiction(
  data: LoadedData,
  filters: ResolvedSquadFilters,
): string | null {
  const wantFromClub = filters.favouriteTeamId ? (filters.favouriteTeamCount ?? 1) : 0;
  if (wantFromClub > filters.maxPerClub) {
    const club = TEAM_LABEL(data, filters.favouriteTeamId);
    return `You asked for ${wantFromClub} ${club} players but capped every club at ${filters.maxPerClub}. Raise the club limit or ask for fewer.`;
  }

  if (filters.favouriteTeamId && filters.rivalTeamId === filters.favouriteTeamId) {
    return 'Your favourite club and your rival club are the same team.';
  }

  const locked = filters.mustIncludeIds ?? [];
  if (locked.length > 15) return 'You locked in more than 15 players.';

  const lockedPlayers = locked
    .map((id) => data.players.find((p) => p.id === id))
    .filter((p): p is PlayerInput => Boolean(p));

  const perPosition = new Map<Position, number>();
  for (const p of lockedPlayers) {
    perPosition.set(p.position, (perPosition.get(p.position) ?? 0) + 1);
  }
  for (const [pos, n] of perPosition) {
    if (n > SQUAD_QUOTA[pos]) {
      return `You locked in ${n} ${POSITION_NAME[pos]} players but a squad only holds ${SQUAD_QUOTA[pos]}.`;
    }
  }

  const perClub = new Map<number, number>();
  for (const p of lockedPlayers) perClub.set(p.team_id, (perClub.get(p.team_id) ?? 0) + 1);
  for (const [teamId, n] of perClub) {
    if (n > filters.maxPerClub) {
      return `You locked in ${n} ${TEAM_LABEL(data, teamId)} players but capped clubs at ${filters.maxPerClub}.`;
    }
  }

  const lockedCost = lockedPlayers.reduce((s, p) => s + p.now_cost, 0);
  const budget = filters.budget - (filters.bankReserve ?? 0);
  if (lockedCost > budget) {
    return `Your locked-in players alone cost £${(lockedCost / 10).toFixed(1)}m, more than the £${(budget / 10).toFixed(1)}m available.`;
  }

  const bannedOverlap = (filters.mustExcludeIds ?? []).filter((id) => locked.includes(id));
  if (bannedOverlap.length) {
    const names = bannedOverlap.map((id) => data.meta.get(id)?.web_name ?? id).join(', ');
    return `${names} is both locked in and banned.`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const TEAM_LABEL = (data: LoadedData, id?: number) =>
  id ? (data.teamShort.get(id) ?? `team ${id}`) : '';

/** Describe only the filters the user actually set. */
function describeFilters(data: LoadedData, f: ResolvedSquadFilters): string {
  const lines: string[] = [`- Budget: £${(f.budget / 10).toFixed(1)}m`];

  if (f.bankReserve) lines.push(`- Leave £${(f.bankReserve / 10).toFixed(1)}m in the bank`);
  if (f.premiumStrategy) lines.push(`- Premium strategy: ${f.premiumStrategy}`);
  if (f.favouriteTeamId) {
    lines.push(
      `- Supports ${TEAM_LABEL(data, f.favouriteTeamId)} — wants ${f.favouriteTeamCount ?? 1} of their players`,
    );
  }
  if (f.rivalTeamId) {
    lines.push(`- Refuses to own any ${TEAM_LABEL(data, f.rivalTeamId)} player`);
  }
  if (f.mustIncludeIds?.length) {
    const names = f.mustIncludeIds.map((id) => data.meta.get(id)?.web_name ?? id).join(', ');
    lines.push(`- Building around: ${names} (already locked into every squad below)`);
  }
  if (f.riskAppetite !== undefined) {
    const label =
      f.riskAppetite < 0.34 ? 'template-safe' : f.riskAppetite < 0.67 ? 'balanced' : 'maverick';
    lines.push(`- Risk appetite: ${label} (${f.riskAppetite.toFixed(2)})`);
  }
  if (f.maxOwnership !== undefined) lines.push(`- Nobody owned above ${f.maxOwnership}%`);
  if (f.injuryTolerance) lines.push(`- Injury tolerance: ${f.injuryTolerance}`);
  if (f.emphasis) lines.push(`- Emphasis: ${f.emphasis}`);
  if (f.formationPreference) lines.push(`- Prefers formation ${f.formationPreference}`);
  if (f.maxPerClub < 3) lines.push(`- At most ${f.maxPerClub} players per club`);
  if (f.benchPolicy) lines.push(`- Bench policy: ${f.benchPolicy}`);
  if (f.rotationStyle) lines.push(`- Management style: ${f.rotationStyle}`);
  if (f.formWeighting !== undefined) {
    lines.push(
      `- Weighting: ${f.formWeighting > 0.6 ? 'recent form over season stats' : f.formWeighting < 0.4 ? 'season stats over recent form' : 'form and season stats equally'}`,
    );
  }
  if (f.fixtureBias) lines.push('- Favour teams with the kindest upcoming fixtures');
  if (f.setPieceTakersOnly) lines.push('- Outfield players must be set-piece takers');
  if (f.priceRiseHunter) lines.push('- Favour players likely to rise in price');
  if (f.chipContext) {
    lines.push(`- Building toward a ${f.chipContext.chip} in GW${f.chipContext.gameweek}`);
  }
  if (f.vibes) lines.push(`- In their own words: "${f.vibes}"`);

  return lines.join('\n');
}

function describeSquads(
  data: LoadedData,
  pool: Map<number, Candidate>,
  squads: { style: string; squad: Squad }[],
  pStart: Map<number, number>,
): string {
  return squads
    .map((entry, i) => {
      const rows = entry.squad.playerIds
        .map((id) => {
          const c = pool.get(id)!;
          const meta = data.meta.get(id);
          const flag = meta?.status && meta.status !== 'a' ? ` FLAG:${meta.status}` : '';
          const xi = entry.squad.startingXI.includes(id) ? 'XI ' : 'BEN';
          return (
            `    ${xi} ${POSITION_NAME[c.position]} ${c.web_name} (${TEAM_LABEL(data, c.team_id)}) ` +
            `£${(c.cost / 10).toFixed(1)}m xPts=${c.xpts.toFixed(1)} own=${c.ownership.toFixed(1)}% ` +
            `pStart=${(pStart.get(id) ?? 0).toFixed(2)}${flag}`
          );
        })
        .join('\n');

      return (
        `SQUAD ${i} (${entry.style}) — £${(entry.squad.cost / 10).toFixed(1)}m, ` +
        `formation ${entry.squad.formation}, projected ${entry.squad.xpts} pts\n${rows}`
      );
    })
    .join('\n\n');
}

const SYSTEM_PROMPT = `You are an expert Fantasy Premier League analyst helping one manager build a squad.

You will be given several complete, already-legal 15-player squads and a list of what
the manager asked for. Your job:

1. Choose the squad that best fits what they actually asked for. Weigh their stated
   preferences above raw projected points — a squad with slightly fewer points that
   honours their wishes is the better answer.
2. Optionally request up to 4 swaps to fit their preferences better. You may only swap
   a player for another of the SAME POSITION that appears in the candidate list. Do not
   swap out any player described as locked.
3. Pick a captain and vice-captain from the starting XI. The captain should be a high
   projection with a good fixture; the vice a genuinely independent backup.
4. Name the squad — short, memorable, a bit of personality.
5. Explain the strategy in 2-4 sentences, in plain confident English. No hedging, no
   bullet lists.
6. State the single biggest risk honestly.
7. Write one short note for the notable picks, explaining why that player is there.

Rules you must respect: budget, exactly 2 GK / 5 DEF / 5 MID / 3 FWD, and the max
players-per-club limit are already satisfied by every squad given to you. Keep them
satisfied — any swap must be like-for-like by position and must not break the club limit.

Refer to players by the ids given. Never invent a player or an id.`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function buildSquad(input: SquadFilters): Promise<BuiltSquad> {
  const filters = squadFiltersSchema.parse(input);
  const data = await load();

  const matches = inferMatchesPlayed(data.players);
  const span = HORIZON_GAMEWEEKS[filters.horizon];
  const fromGw = data.firstGw;
  const toGw = Math.min(38, fromGw + span - 1);

  const xpts = projectRange(data.players, data.teams, data.fixtures, fromGw, toGw, matches);
  const pStart = new Map(
    projectGameweek(data.players, data.teams, data.fixtures, fromGw, matches).map((p) => [
      p.player_id,
      p.p_start,
    ]),
  );

  // Contradictions in the hard constraints can be reported precisely, and no
  // amount of searching will fix them.
  const contradiction = findContradiction(data, filters);
  if (contradiction) throw new ImpossibleConstraintsError(contradiction);

  // Stage 1
  const { candidates, relaxations } = selectCandidates(data, filters, xpts, pStart);

  // Stage 2
  const constraints: Constraints = {
    budget: filters.budget - (filters.bankReserve ?? 0),
    maxPerClub: filters.maxPerClub,
    mustInclude: filters.mustIncludeIds ?? [],
    mustExclude: filters.mustExcludeIds ?? [],
    minFromClub: filters.favouriteTeamId
      ? { teamId: filters.favouriteTeamId, count: filters.favouriteTeamCount ?? 1 }
      : undefined,
  };

  let built = buildSquads(candidates, constraints);
  let pool = new Map(candidates.map((c) => [c.id, c]));

  // Last resort: drop the preference filters entirely rather than hand back
  // nothing. The hard constraints — budget, locked players, club limits — are
  // still respected, and we tell the user exactly what gave way.
  if (built.length === 0) {
    const widened = selectCandidates(
      data,
      { ...filters, maxOwnership: undefined, riskAppetite: undefined, injuryTolerance: 'relaxed' },
      xpts,
      pStart,
    );
    built = buildSquads(widened.candidates, constraints);
    if (built.length > 0) {
      pool = new Map(widened.candidates.map((c) => [c.id, c]));
      relaxations.length = 0;
      relaxations.push(
        'your ownership and fitness preferences had to be set aside to find a legal 15',
      );
    }
  }

  if (built.length === 0) {
    throw new ImpossibleConstraintsError(
      `No legal squad fits a £${((filters.budget - (filters.bankReserve ?? 0)) / 10).toFixed(1)}m budget ` +
        `with a limit of ${filters.maxPerClub} per club. Try raising the budget or the club limit.`,
    );
  }

  // Stage 3
  const prompt = [
    "THE MANAGER'S REQUEST",
    describeFilters(data, filters),
    '',
    `HORIZON: gameweeks ${fromGw}-${toGw} (projections below cover this span)`,
    '',
    'CANDIDATE SQUADS (all legal — pick one)',
    describeSquads(data, pool, built, pStart),
    '',
    'AVAILABLE FOR SWAPS (position, name, club, price, projection, ownership)',
    candidates
      .slice()
      .sort((a, b) => a.position - b.position || b.xpts - a.xpts)
      .map(
        (c) =>
          `  id=${c.id} ${POSITION_NAME[c.position]} ${c.web_name} (${TEAM_LABEL(data, c.team_id)}) ` +
          `£${(c.cost / 10).toFixed(1)}m xPts=${c.xpts.toFixed(1)} own=${c.ownership.toFixed(1)}%`,
      )
      .join('\n'),
  ].join('\n');

  let choice;
  let provider = 'optimiser';
  let model = 'none';
  let cached = false;
  let fallbackReason: string | undefined;

  try {
    const result = await generateWithFallback({
      kind: 'squad',
      // The cache key must capture everything that changes the answer, including
      // the squads themselves — prices move, so yesterday's answer is not today's.
      input: { filters, fromGw, toGw, squads: built.map((b) => b.squad.playerIds) },
      schema: squadChoiceSchema,
      system: SYSTEM_PROMPT,
      prompt,
    });
    choice = result.object;
    provider = result.provider;
    model = result.model;
    cached = result.cached;
  } catch (err) {
    // The LLM is an enhancement, not a dependency. Without it the user still gets
    // the optimiser's best legal squad.
    fallbackReason = err instanceof Error ? err.message : String(err);
    console.error('squad builder: LLM unavailable, using optimiser result:', fallbackReason);
  }

  // Stage 4
  return assemble({
    data, pool, built, choice, filters, constraints, fromGw, toGw,
    provider, model, cached, fallbackReason, relaxations,
  });
}

export class ImpossibleConstraintsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImpossibleConstraintsError';
  }
}

interface AssembleArgs {
  data: LoadedData;
  pool: Map<number, Candidate>;
  built: { style: string; squad: Squad }[];
  choice?: SquadChoice;
  filters: ResolvedSquadFilters;
  constraints: Constraints;
  fromGw: number;
  toGw: number;
  provider: string;
  model: string;
  cached: boolean;
  fallbackReason?: string;
  relaxations: string[];
}

/**
 * Stage 4: apply the LLM's choice, then verify. Anything invalid is discarded in
 * favour of the optimiser's own best squad — the user never sees an illegal squad,
 * regardless of what the model returned.
 */
function assemble(args: AssembleArgs): BuiltSquad {
  const { data, pool, built, choice, filters, constraints, fromGw, toGw } = args;

  const best = built[0];
  let squad = best.squad;
  let name = `${best.style[0].toUpperCase()}${best.style.slice(1)} XI`;
  let strategy =
    `Optimised for projected points across gameweeks ${fromGw}-${toGw} within a ` +
    `£${(filters.budget / 10).toFixed(1)}m budget.`;
  let keyRisk = 'Projections assume current form and minutes hold up.';
  let notes = new Map<number, string>();
  let captainId = squad.captainId;
  let viceCaptainId = squad.viceCaptainId;
  let fallbackReason = args.fallbackReason;

  if (choice) {
    const picked = built[Math.min(choice.chosenSquadIndex, built.length - 1)] ?? best;
    let ids = [...picked.squad.playerIds];

    // Apply only swaps that are legal and within the pool.
    for (const swap of choice.swaps ?? []) {
      const out = pool.get(swap.outPlayerId);
      const inc = pool.get(swap.inPlayerId);
      if (!out || !inc) continue;
      if (out.position !== inc.position) continue;
      if (constraints.mustInclude.includes(out.id)) continue;
      if (ids.includes(inc.id) || !ids.includes(out.id)) continue;

      const next = ids.map((id) => (id === out.id ? inc.id : id));
      if (validateSquad(next, pool, constraints).valid) ids = next;
    }

    const check = validateSquad(ids, pool, constraints);
    if (check.valid) {
      const members = ids.map((id) => pool.get(id)!);
      const { xi, bench } = rebuild(members);
      const inXI = new Set(xi.map((p) => p.id));

      // Captaincy must land on someone actually starting.
      const cap = inXI.has(choice.captainId) ? choice.captainId : xi[0].id;
      const viceCandidate = inXI.has(choice.viceCaptainId) ? choice.viceCaptainId : xi[1].id;

      squad = {
        playerIds: ids,
        startingXI: xi.map((p) => p.id),
        bench: bench.map((p) => p.id),
        captainId: cap,
        viceCaptainId: viceCandidate === cap ? (xi.find((p) => p.id !== cap)?.id ?? cap) : viceCandidate,
        cost: members.reduce((s, p) => s + p.cost, 0),
        xpts: Math.round(members.reduce((s, p) => s + p.xpts, 0) * 10) / 10,
        formation: formation(xi),
      };
      captainId = squad.captainId;
      viceCaptainId = squad.viceCaptainId;
      name = choice.squadName;
      strategy = choice.strategy;
      keyRisk = choice.keyRisk;
      notes = new Map(choice.playerNotes.map((n) => [n.playerId, n.note]));
    } else {
      fallbackReason = `LLM squad failed validation (${check.errors.join('; ')}), used optimiser result instead`;
      console.error('squad builder:', fallbackReason);
    }
  }

  const order: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3 };
  const players = squad.playerIds
    .map((id) => {
      const c = pool.get(id)!;
      const meta = data.meta.get(id);
      return {
        ...c,
        note: notes.get(id),
        teamShort: data.teamShort.get(c.team_id) ?? '',
        status: meta?.status ?? null,
      };
    })
    .sort((a, b) => order[a.position] - order[b.position] || b.xpts - a.xpts);

  return {
    name,
    strategy,
    keyRisk,
    squad,
    players,
    captainId,
    viceCaptainId,
    horizonGameweeks: [fromGw, toGw],
    provider: args.provider,
    model: args.model,
    cached: args.cached,
    fallbackReason,
    relaxations: args.relaxations,
  };
}

// Local copies of the XI logic, so assemble does not need the optimiser's internals.
const XI_MIN: Record<Position, number> = { 1: 1, 2: 3, 3: 2, 4: 1 };
const XI_MAX: Record<Position, number> = { 1: 1, 2: 5, 3: 5, 4: 3 };

function rebuild(squad: Candidate[]): { xi: Candidate[]; bench: Candidate[] } {
  const byPos = new Map<Position, Candidate[]>();
  for (const p of squad) {
    if (!byPos.has(p.position)) byPos.set(p.position, []);
    byPos.get(p.position)!.push(p);
  }
  for (const list of byPos.values()) list.sort((a, b) => b.xpts - a.xpts);

  const xi: Candidate[] = [];
  const spare: Candidate[] = [];
  for (const pos of [1, 2, 3, 4] as Position[]) {
    const list = byPos.get(pos) ?? [];
    xi.push(...list.slice(0, XI_MIN[pos]));
    if (pos !== 1) spare.push(...list.slice(XI_MIN[pos], XI_MAX[pos]));
  }
  spare.sort((a, b) => b.xpts - a.xpts);
  xi.push(...spare.slice(0, 11 - xi.length));

  const inXI = new Set(xi.map((p) => p.id));
  return { xi, bench: squad.filter((p) => !inXI.has(p.id)).sort((a, b) => b.xpts - a.xpts) };
}

function formation(xi: Candidate[]): string {
  const c = (pos: Position) => xi.filter((p) => p.position === pos).length;
  return `${c(2)}-${c(3)}-${c(4)}`;
}
