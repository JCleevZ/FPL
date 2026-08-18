/**
 * Squad optimiser.
 *
 * Produces squads that satisfy every FPL rule exactly. The LLM is never asked to
 * respect the budget or the max-three-per-club rule — it picks between and
 * annotates squads that are already legal by construction.
 *
 * ponytail: greedy seed + local search, not an exact ILP. A proper solver is a
 *           dependency and a lot of code for a gain we cannot currently measure.
 *           Revisit only if squads visibly leave points on the table.
 */

import { POSITION, type Position } from '@/lib/fpl/types';

/** FPL squad composition: 2 GK, 5 DEF, 5 MID, 3 FWD. */
export const SQUAD_QUOTA: Record<Position, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };
export const SQUAD_SIZE = 15;

/** Legal starting XI shape. */
const XI_MIN: Record<Position, number> = { 1: 1, 2: 3, 3: 2, 4: 1 };
const XI_MAX: Record<Position, number> = { 1: 1, 2: 5, 3: 5, 4: 3 };
const XI_SIZE = 11;

/** Bench players only score via autosubs, so they are worth a fraction. */
const BENCH_WEIGHT = 0.1;

export interface Candidate {
  id: number;
  position: Position;
  team_id: number;
  cost: number; // tenths of a million
  xpts: number; // projected points over the chosen horizon
  ownership: number; // selected_by_percent
  web_name: string;
}

export interface Constraints {
  /** Tenths of a million. 1000 = £100.0m. */
  budget: number;
  maxPerClub: number;
  mustInclude: number[];
  mustExclude: number[];
  /** Minimum players from a given club (supporting your real team). */
  minFromClub?: { teamId: number; count: number };
}

export interface Squad {
  playerIds: number[];
  startingXI: number[];
  bench: number[];
  captainId: number;
  viceCaptainId: number;
  cost: number;
  xpts: number;
  formation: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export const DEFAULT_CONSTRAINTS: Constraints = {
  budget: 1000,
  maxPerClub: 3,
  mustInclude: [],
  mustExclude: [],
};

// --- Validation -------------------------------------------------------------

/**
 * The last line of defence. Everything shown to a user passes through here,
 * including anything an LLM proposed.
 */
export function validateSquad(
  playerIds: number[],
  pool: Map<number, Candidate>,
  constraints: Constraints,
): ValidationResult {
  const errors: string[] = [];
  const unique = new Set(playerIds);

  if (playerIds.length !== SQUAD_SIZE) {
    errors.push(`squad has ${playerIds.length} players, expected ${SQUAD_SIZE}`);
  }
  if (unique.size !== playerIds.length) {
    errors.push('squad contains duplicate players');
  }

  const players: Candidate[] = [];
  for (const id of unique) {
    const p = pool.get(id);
    if (!p) {
      errors.push(`unknown player id ${id}`);
      continue;
    }
    players.push(p);
  }

  const byPosition = countBy(players, (p) => p.position);
  for (const pos of [1, 2, 3, 4] as Position[]) {
    const have = byPosition.get(pos) ?? 0;
    if (have !== SQUAD_QUOTA[pos]) {
      errors.push(`position ${pos}: have ${have}, need ${SQUAD_QUOTA[pos]}`);
    }
  }

  const byClub = countBy(players, (p) => p.team_id);
  for (const [teamId, count] of byClub) {
    if (count > constraints.maxPerClub) {
      errors.push(`${count} players from club ${teamId}, max is ${constraints.maxPerClub}`);
    }
  }

  const cost = players.reduce((sum, p) => sum + p.cost, 0);
  if (cost > constraints.budget) {
    errors.push(
      `squad costs ${(cost / 10).toFixed(1)}m, budget is ${(constraints.budget / 10).toFixed(1)}m`,
    );
  }

  for (const id of constraints.mustInclude) {
    if (!unique.has(id)) errors.push(`required player ${id} is missing`);
  }
  for (const id of constraints.mustExclude) {
    if (unique.has(id)) errors.push(`excluded player ${id} is present`);
  }

  if (constraints.minFromClub) {
    const { teamId, count } = constraints.minFromClub;
    const have = byClub.get(teamId) ?? 0;
    if (have < count) {
      errors.push(`need at least ${count} players from club ${teamId}, have ${have}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// --- Starting XI ------------------------------------------------------------

/**
 * Best legal XI from a 15. Exact, not a heuristic: take the positional minimums
 * (7 players), then fill the last 4 slots with the best remaining outfielders —
 * every leftover is within its positional maximum, so the greedy choice is optimal.
 */
export function bestXI(squad: Candidate[]): { xi: Candidate[]; bench: Candidate[] } {
  const byPos = new Map<Position, Candidate[]>();
  for (const p of squad) {
    if (!byPos.has(p.position)) byPos.set(p.position, []);
    byPos.get(p.position)!.push(p);
  }
  for (const list of byPos.values()) list.sort((a, b) => b.xpts - a.xpts);

  const xi: Candidate[] = [];
  const leftovers: Candidate[] = [];

  for (const pos of [1, 2, 3, 4] as Position[]) {
    const list = byPos.get(pos) ?? [];
    xi.push(...list.slice(0, XI_MIN[pos]));
    // Only outfielders can take a discretionary slot; the second keeper cannot.
    const spare = list.slice(XI_MIN[pos], XI_MAX[pos]);
    if (pos !== POSITION.GK) leftovers.push(...spare);
  }

  leftovers.sort((a, b) => b.xpts - a.xpts);
  xi.push(...leftovers.slice(0, XI_SIZE - xi.length));

  const xiIds = new Set(xi.map((p) => p.id));
  const bench = squad.filter((p) => !xiIds.has(p.id)).sort((a, b) => b.xpts - a.xpts);

  return { xi, bench };
}

function formationOf(xi: Candidate[]): string {
  const c = countBy(xi, (p) => p.position);
  return `${c.get(2) ?? 0}-${c.get(3) ?? 0}-${c.get(4) ?? 0}`;
}

/** Squad value: the XI in full, the bench at a discount. */
function squadValue(squad: Candidate[]): number {
  const { xi, bench } = bestXI(squad);
  return (
    xi.reduce((s, p) => s + p.xpts, 0) + bench.reduce((s, p) => s + p.xpts, 0) * BENCH_WEIGHT
  );
}

// --- Building ---------------------------------------------------------------

interface BuildState {
  players: Candidate[];
  cost: number;
  clubCount: Map<number, number>;
  posCount: Map<Position, number>;
}

function canAdd(state: BuildState, p: Candidate, c: Constraints): boolean {
  if (state.players.some((x) => x.id === p.id)) return false;
  if ((state.posCount.get(p.position) ?? 0) >= SQUAD_QUOTA[p.position]) return false;
  if ((state.clubCount.get(p.team_id) ?? 0) >= c.maxPerClub) return false;
  if (state.cost + p.cost > c.budget) return false;
  return true;
}

function add(state: BuildState, p: Candidate): void {
  state.players.push(p);
  state.cost += p.cost;
  state.clubCount.set(p.team_id, (state.clubCount.get(p.team_id) ?? 0) + 1);
  state.posCount.set(p.position, (state.posCount.get(p.position) ?? 0) + 1);
}

function emptyState(): BuildState {
  return { players: [], cost: 0, clubCount: new Map(), posCount: new Map() };
}

/**
 * Greedy seed. Fills required positions by value-for-money, but reserves enough
 * budget to complete the remaining slots at the cheapest available price — the
 * classic failure mode is spending everything on premiums and being unable to
 * afford a legal 15.
 */
function seedSquad(
  candidates: Candidate[],
  c: Constraints,
  score: (p: Candidate) => number,
): Candidate[] | null {
  const state = emptyState();
  const pool = candidates.filter((p) => !c.mustExclude.includes(p.id));

  // Locked players first — they are non-negotiable.
  for (const id of c.mustInclude) {
    const p = pool.find((x) => x.id === id);
    if (!p) return null;
    if (!canAdd(state, p, c)) return null;
    add(state, p);
  }

  // Satisfy a "players from my club" requirement before general filling,
  // while budget is still plentiful.
  if (c.minFromClub) {
    const { teamId, count } = c.minFromClub;
    const fromClub = pool
      .filter((p) => p.team_id === teamId)
      .sort((a, b) => score(b) - score(a));
    for (const p of fromClub) {
      if ((state.clubCount.get(teamId) ?? 0) >= count) break;
      if (canAdd(state, p, c)) add(state, p);
    }
  }

  const cheapestByPos = new Map<Position, number>();
  for (const pos of [1, 2, 3, 4] as Position[]) {
    const costs = pool.filter((p) => p.position === pos).map((p) => p.cost);
    cheapestByPos.set(pos, costs.length ? Math.min(...costs) : Infinity);
  }

  /** Minimum cost to fill every slot still empty, excluding `skip` one of `pos`. */
  const reserveFor = (skipPos: Position): number => {
    let reserve = 0;
    for (const pos of [1, 2, 3, 4] as Position[]) {
      let needed = SQUAD_QUOTA[pos] - (state.posCount.get(pos) ?? 0);
      if (pos === skipPos) needed -= 1;
      if (needed > 0) reserve += needed * (cheapestByPos.get(pos) ?? 0);
    }
    return reserve;
  };

  const ranked = [...pool].sort((a, b) => score(b) / b.cost - score(a) / a.cost);

  while (state.players.length < SQUAD_SIZE) {
    let picked: Candidate | null = null;

    for (const p of ranked) {
      if (!canAdd(state, p, c)) continue;
      if (state.cost + p.cost + reserveFor(p.position) > c.budget) continue;
      picked = p;
      break;
    }

    if (!picked) {
      // Nothing affordable that keeps the squad completable.
      return null;
    }
    add(state, picked);
  }

  return state.players;
}

/**
 * Local search: repeatedly swap one squad player for a better candidate of the
 * same position, keeping the squad legal, until nothing improves.
 */
function improve(
  squad: Candidate[],
  candidates: Candidate[],
  c: Constraints,
  score: (p: Candidate) => number,
  maxPasses = 12,
): Candidate[] {
  const locked = new Set(c.mustInclude);
  const excluded = new Set(c.mustExclude);
  const current = [...squad];
  let currentValue = squadValue(current);

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;

    for (let i = 0; i < current.length; i++) {
      const out = current[i];
      if (locked.has(out.id)) continue;

      const inSquad = new Set(current.map((p) => p.id));
      let bestSwap: { player: Candidate; value: number } | null = null;

      for (const cand of candidates) {
        if (cand.position !== out.position) continue;
        if (inSquad.has(cand.id) || excluded.has(cand.id)) continue;

        const next = [...current];
        next[i] = cand;

        const cost = next.reduce((s, p) => s + p.cost, 0);
        if (cost > c.budget) continue;

        const clubs = countBy(next, (p) => p.team_id);
        if ([...clubs.values()].some((n) => n > c.maxPerClub)) continue;

        if (c.minFromClub) {
          const have = clubs.get(c.minFromClub.teamId) ?? 0;
          if (have < c.minFromClub.count) continue;
        }

        // Rank swaps by the caller's scoring function, but only accept a swap
        // that also improves real projected points.
        const value = squadValue(next) + (score(cand) - score(out)) * 0.001;
        if (value > currentValue + 1e-9 && (!bestSwap || value > bestSwap.value)) {
          bestSwap = { player: cand, value };
        }
      }

      if (bestSwap) {
        current[i] = bestSwap.player;
        currentValue = squadValue(current);
        improved = true;
      }
    }

    if (!improved) break;
  }

  return current;
}

function finalise(squad: Candidate[]): Squad {
  const { xi, bench } = bestXI(squad);
  const ranked = [...xi].sort((a, b) => b.xpts - a.xpts);

  return {
    playerIds: squad.map((p) => p.id),
    startingXI: xi.map((p) => p.id),
    bench: bench.map((p) => p.id),
    captainId: ranked[0]?.id ?? xi[0].id,
    viceCaptainId: ranked[1]?.id ?? xi[0].id,
    cost: squad.reduce((s, p) => s + p.cost, 0),
    xpts: Math.round(squadValue(squad) * 10) / 10,
    formation: formationOf(xi),
  };
}

/** The three squad characters we hand to the LLM to choose between. */
export type SquadStyle = 'safe' | 'balanced' | 'aggressive';

const SCORERS: Record<SquadStyle, (p: Candidate) => number> = {
  // Favours nailed, heavily-owned players — the template.
  safe: (p) => p.xpts * (1 + Math.min(p.ownership, 60) / 200),
  balanced: (p) => p.xpts,
  // Rewards low ownership, for rank-chasing differentials.
  aggressive: (p) => p.xpts * (1 + Math.max(0, 25 - p.ownership) / 100),
};

/**
 * Build up to three legal squads with different characters.
 *
 * Returns an empty array when the constraints are impossible (budget too low,
 * must-include list itself illegal) — callers should surface that rather than
 * pretend a squad exists.
 */
export function buildSquads(
  candidates: Candidate[],
  constraints: Partial<Constraints> = {},
  styles: SquadStyle[] = ['balanced', 'safe', 'aggressive'],
): { style: SquadStyle; squad: Squad }[] {
  const c: Constraints = { ...DEFAULT_CONSTRAINTS, ...constraints };
  const pool = new Map(candidates.map((p) => [p.id, p]));
  const results: { style: SquadStyle; squad: Squad }[] = [];
  const seen = new Set<string>();

  for (const style of styles) {
    const score = SCORERS[style];
    const seed = seedSquad(candidates, c, score);
    if (!seed) continue;

    const optimised = improve(seed, candidates, c, score);
    const check = validateSquad(
      optimised.map((p) => p.id),
      pool,
      c,
    );
    // A squad that fails validation is a bug in the optimiser, not something to
    // paper over — drop it rather than show an illegal squad.
    if (!check.valid) {
      console.error(`optimiser produced an invalid ${style} squad:`, check.errors);
      continue;
    }

    const key = [...optimised.map((p) => p.id)].sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ style, squad: finalise(optimised) });
  }

  return results;
}

// --- utils ------------------------------------------------------------------

function countBy<T, K>(items: T[], key: (item: T) => K): Map<K, number> {
  const map = new Map<K, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return map;
}
