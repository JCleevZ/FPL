'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { canAdd, summarise, type MyTeam, type TeamPlayer } from '@/lib/team/my-team';
import type { Position } from '@/lib/fpl/types';

interface TeamRowJoin {
  player_id: number;
  purchase_price: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  bench_order: number | null;
  players: {
    web_name: string;
    position: number;
    team_id: number;
    now_cost: number;
    status: string | null;
    news: string | null;
    form: number | null;
    total_points: number;
    selected_by_percent: number | null;
    teams: { short_name: string } | null;
  } | null;
}

/** Load the signed-in user's squad. Returns an empty squad when not signed in. */
export async function loadMyTeam(): Promise<MyTeam> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return summarise([], 1000);

  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase
      .from('my_team')
      .select(
        'player_id, purchase_price, is_captain, is_vice_captain, bench_order, ' +
          'players(web_name, position, team_id, now_cost, status, news, form, total_points, ' +
          'selected_by_percent, teams(short_name))',
      )
      .order('purchase_price', { ascending: false }),
    supabase.from('profiles').select('team_budget').maybeSingle(),
  ]);

  const players: TeamPlayer[] = ((rows ?? []) as unknown as TeamRowJoin[])
    .filter((r) => r.players)
    .map((r) => ({
      id: r.player_id,
      web_name: r.players!.web_name,
      position: r.players!.position as Position,
      team_id: r.players!.team_id,
      team_short: r.players!.teams?.short_name ?? '',
      now_cost: r.players!.now_cost,
      purchase_price: r.purchase_price,
      is_captain: r.is_captain,
      is_vice_captain: r.is_vice_captain,
      bench_order: r.bench_order,
      status: r.players!.status,
      news: r.players!.news,
      form: Number(r.players!.form ?? 0),
      total_points: r.players!.total_points,
      selected_by_percent: Number(r.players!.selected_by_percent ?? 0),
    }));

  return summarise(players, profile?.team_budget ?? 1000);
}

export interface TeamActionResult {
  error?: string;
  ok?: boolean;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  return { supabase, user };
}

export async function addPlayer(playerId: number): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const { data: player } = await supabase
      .from('players')
      .select('id, web_name, position, team_id, now_cost')
      .eq('id', playerId)
      .maybeSingle();
    if (!player) return { error: 'That player does not exist.' };

    // Re-check the squad rules server-side. The UI greys out ineligible players,
    // but a form post is its own entry point and cannot be trusted.
    const team = await loadMyTeam();
    const reason = canAdd(team, {
      id: player.id,
      position: player.position as Position,
      team_id: player.team_id,
      now_cost: player.now_cost,
      web_name: player.web_name,
    });
    if (reason) return { error: reason };

    const { error } = await supabase.from('my_team').insert({
      user_id: user.id,
      player_id: player.id,
      // Locked at today's price: this is what you paid, and it must not drift.
      purchase_price: player.now_cost,
    });
    if (error) return { error: error.message };

    revalidatePath('/');
    revalidatePath('/my-team');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not add that player.' };
  }
}

export async function removePlayer(playerId: number): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from('my_team')
      .delete()
      .eq('user_id', user.id)
      .eq('player_id', playerId);
    if (error) return { error: error.message };

    revalidatePath('/');
    revalidatePath('/my-team');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not remove that player.' };
  }
}

/** Set captain or vice. The partial unique indexes allow only one of each. */
export async function setArmband(
  playerId: number,
  role: 'captain' | 'vice',
): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const column = role === 'captain' ? 'is_captain' : 'is_vice_captain';
    const other = role === 'captain' ? 'is_vice_captain' : 'is_captain';

    // Clear the existing holder first, or the unique index rejects the update.
    await supabase.from('my_team').update({ [column]: false }).eq('user_id', user.id);

    // The same player cannot wear both armbands.
    const { error } = await supabase
      .from('my_team')
      .update({ [column]: true, [other]: false })
      .eq('user_id', user.id)
      .eq('player_id', playerId);
    if (error) return { error: error.message };

    revalidatePath('/');
    revalidatePath('/my-team');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not set the armband.' };
  }
}

export async function clearTeam(): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from('my_team').delete().eq('user_id', user.id);
    if (error) return { error: error.message };

    revalidatePath('/');
    revalidatePath('/my-team');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not clear the squad.' };
  }
}

/** Import a generated AI squad into your actual team, replacing what is there. */
export async function importSquad(
  playerIds: number[],
  captainId?: number,
  viceCaptainId?: number,
): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const { data: players } = await supabase
      .from('players')
      .select('id, now_cost')
      .in('id', playerIds);
    if (!players?.length) return { error: 'Could not find those players.' };

    await supabase.from('my_team').delete().eq('user_id', user.id);

    const { error } = await supabase.from('my_team').insert(
      players.map((p) => ({
        user_id: user.id,
        player_id: p.id,
        purchase_price: p.now_cost,
        is_captain: p.id === captainId,
        is_vice_captain: p.id === viceCaptainId,
      })),
    );
    if (error) return { error: error.message };

    revalidatePath('/');
    revalidatePath('/my-team');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not import that squad.' };
  }
}
