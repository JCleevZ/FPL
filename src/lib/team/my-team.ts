/**
 * The user's own squad: what is in it, what it cost, what it is worth now.
 *
 * Prices move all season, so three numbers matter and they are all different:
 *   spent  — what you paid (sum of purchase_price)
 *   value  — what it is worth today (sum of now_cost)
 *   bank   — budget minus what you paid, i.e. money still available
 */

import { SQUAD_QUOTA, SQUAD_SIZE } from '@/lib/model/optimiser';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';

export const MAX_PER_CLUB = 3;

export interface TeamPlayer {
  id: number;
  web_name: string;
  position: Position;
  team_id: number;
  team_short: string;
  now_cost: number;
  purchase_price: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  bench_order: number | null;
  status: string | null;
  news: string | null;
  form: number;
  total_points: number;
  selected_by_percent: number;
}

export interface MyTeam {
  players: TeamPlayer[];
  budget: number;
  /** Sum of purchase prices. */
  spent: number;
  /** Sum of current prices — what the squad is worth today. */
  value: number;
  /** Budget minus spent. */
  bank: number;
  /** Value minus spent: price rises banked so far. */
  profit: number;
  counts: Record<Position, number>;
  perClub: Map<number, number>;
  complete: boolean;
  missing: string[];
}

export function summarise(players: TeamPlayer[], budget: number): MyTeam {
  const spent = players.reduce((s, p) => s + p.purchase_price, 0);
  const value = players.reduce((s, p) => s + p.now_cost, 0);

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Position, number>;
  const perClub = new Map<number, number>();
  for (const p of players) {
    counts[p.position] += 1;
    perClub.set(p.team_id, (perClub.get(p.team_id) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const pos of [1, 2, 3, 4] as Position[]) {
    const short = SQUAD_QUOTA[pos] - counts[pos];
    if (short > 0) missing.push(`${short} ${POSITION_NAME[pos]}`);
  }

  return {
    players,
    budget,
    spent,
    value,
    bank: budget - spent,
    profit: value - spent,
    counts,
    perClub,
    complete: players.length === SQUAD_SIZE && missing.length === 0,
    missing,
  };
}

export interface AddCandidate {
  id: number;
  position: Position;
  team_id: number;
  now_cost: number;
  web_name: string;
}

/**
 * Whether a player can join the squad. Returns a reason when not.
 *
 * Enforced server-side on every add — the UI disables ineligible players, but a
 * form post is its own entry point and cannot be trusted.
 */
export function canAdd(team: MyTeam, player: AddCandidate): string | null {
  if (team.players.some((p) => p.id === player.id)) {
    return `${player.web_name} is already in your squad.`;
  }
  if (team.players.length >= SQUAD_SIZE) {
    return `Your squad already has ${SQUAD_SIZE} players.`;
  }
  if (team.counts[player.position] >= SQUAD_QUOTA[player.position]) {
    return `You already have ${SQUAD_QUOTA[player.position]} ${POSITION_NAME[player.position]} players.`;
  }
  if ((team.perClub.get(player.team_id) ?? 0) >= MAX_PER_CLUB) {
    return `You already have ${MAX_PER_CLUB} players from that club.`;
  }
  if (player.now_cost > team.bank) {
    return `${player.web_name} costs £${(player.now_cost / 10).toFixed(1)}m but you only have £${(team.bank / 10).toFixed(1)}m.`;
  }
  return null;
}

/** Formats tenths-of-a-million as a price string. */
export const money = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;

/** Signed variant, for profit and price changes. */
export const signedMoney = (tenths: number) =>
  `${tenths >= 0 ? '+' : '−'}£${(Math.abs(tenths) / 10).toFixed(1)}m`;

/**
 * The most you can spend on your next player in a given position.
 *
 * Naive affordability (`cost <= bank`) is wrong once a squad is nearly full:
 * with five slots left and £20m in the bank, a £15m striker leaves £5m for four
 * players and no legal squad. So reserve the cheapest possible fill for every
 * other empty slot first, and spend what remains.
 */
export function maxSpendOn(
  team: MyTeam,
  position: Position,
  cheapestByPosition: Record<Position, number>,
): number {
  let reserve = 0;
  for (const pos of [1, 2, 3, 4] as Position[]) {
    let stillNeeded = SQUAD_QUOTA[pos] - team.counts[pos];
    if (pos === position) stillNeeded -= 1; // the slot we are filling now
    if (stillNeeded > 0) reserve += stillNeeded * (cheapestByPosition[pos] ?? 40);
  }
  return Math.max(0, team.bank - reserve);
}

/** Positions still short of the FPL quota, with how many are missing. */
export function outstandingNeeds(team: MyTeam): { position: Position; count: number }[] {
  return ([1, 2, 3, 4] as Position[])
    .map((position) => ({ position, count: SQUAD_QUOTA[position] - team.counts[position] }))
    .filter((n) => n.count > 0);
}
