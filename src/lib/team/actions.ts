'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { canAdd, shadowTeamWithout, summarise, type MyTeam, type TeamPlayer } from '@/lib/team/my-team';
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

/**
 * Sell one player and buy another in the same position, as a single move.
 *
 * This is what "upgrade" means once a squad is full: there is no spare slot to
 * add into, so the only way to improve a position is to swap out its weakest
 * player for a legal, affordable replacement.
 */
export async function swapPlayer(
  outPlayerId: number,
  inPlayerId: number,
): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const { data: incoming } = await supabase
      .from('players')
      .select('id, web_name, position, team_id, now_cost')
      .eq('id', inPlayerId)
      .maybeSingle();
    if (!incoming) return { error: 'That player does not exist.' };

    const team = await loadMyTeam();
    const outgoing = team.players.find((p) => p.id === outPlayerId);
    if (!outgoing) return { error: 'That player is not in your squad.' };

    // Re-validate server-side against the squad as it would sit once the
    // outgoing player is sold.
    const shadow = shadowTeamWithout(team, outPlayerId);

    const reason = canAdd(shadow, {
      id: incoming.id,
      position: incoming.position as Position,
      team_id: incoming.team_id,
      now_cost: incoming.now_cost,
      web_name: incoming.web_name,
    });
    if (reason) return { error: reason };

    const { error: deleteError } = await supabase
      .from('my_team')
      .delete()
      .eq('user_id', user.id)
      .eq('player_id', outPlayerId);
    if (deleteError) return { error: deleteError.message };

    // Carry the armband across: the user is upgrading a position, not
    // deliberately stripping their captain of the role.
    const { error } = await supabase.from('my_team').insert({
      user_id: user.id,
      player_id: incoming.id,
      purchase_price: incoming.now_cost,
      is_captain: outgoing.is_captain,
      is_vice_captain: outgoing.is_vice_captain,
    });
    if (error) return { error: error.message };

    revalidatePath('/');
    revalidatePath('/my-team');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not make that swap.' };
  }
}

/** Replace the active squad with a saved draft's players and armbands. */
export async function activateDraft(draftId: string): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();

    const { data: draft, error } = await supabase
      .from('squads')
      .select('player_ids, captain_id, vice_captain_id')
      .eq('id', draftId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!draft) return { error: 'That draft could not be found.' };

    return importSquad(
      draft.player_ids as number[],
      draft.captain_id ?? undefined,
      draft.vice_captain_id ?? undefined,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not activate that draft.' };
  }
}

/** Delete a saved draft. Does not touch the active squad. */
export async function deleteDraft(draftId: string): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from('squads')
      .delete()
      .eq('id', draftId)
      .eq('user_id', user.id);
    if (error) return { error: error.message };

    revalidatePath('/my-team/drafts');
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not delete that draft.' };
  }
}

// ---------------------------------------------------------------------------
// Editing a draft in place.
//
// A draft is a `squads` row, not a `my_team` row, so it needs its own mutation
// path — but the legality rules are identical, which is why this reuses
// `canAdd`/`summarise`/`shadowTeamWithout` rather than re-deriving them. A
// draft has no separate "purchase price": today's price stands in for both,
// since a draft is a hypothetical squad, not one you actually paid for.
// ---------------------------------------------------------------------------

interface DraftPlayerRow {
  id: number;
  web_name: string;
  position: number;
  team_id: number;
  now_cost: number;
  teams: { short_name: string } | null;
}

async function loadDraft(
  draftId: string,
  userId: string,
): Promise<{ team: MyTeam; captainId: number | null; viceCaptainId: number | null } | { error: string }> {
  const supabase = await createClient();

  const { data: draft, error } = await supabase
    .from('squads')
    .select('player_ids, budget, captain_id, vice_captain_id')
    .eq('id', draftId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!draft) return { error: 'That draft could not be found.' };

  const playerIds = (draft.player_ids as number[]) ?? [];
  const { data: rows } = playerIds.length
    ? await supabase
        .from('players')
        .select('id, web_name, position, team_id, now_cost, teams(short_name)')
        .in('id', playerIds)
    : { data: [] };

  const players: TeamPlayer[] = ((rows ?? []) as unknown as DraftPlayerRow[]).map((p) => ({
    id: p.id,
    web_name: p.web_name,
    position: p.position as Position,
    team_id: p.team_id,
    team_short: p.teams?.short_name ?? '',
    now_cost: p.now_cost,
    purchase_price: p.now_cost,
    is_captain: p.id === draft.captain_id,
    is_vice_captain: p.id === draft.vice_captain_id,
    bench_order: null,
    status: null,
    news: null,
    form: 0,
    total_points: 0,
    selected_by_percent: 0,
  }));

  return {
    team: summarise(players, draft.budget ?? 1000),
    captainId: draft.captain_id,
    viceCaptainId: draft.vice_captain_id,
  };
}

/** Write a draft's new player list back, keeping its cost figure honest. */
async function saveDraftPlayers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  draftId: string,
  userId: string,
  playerIds: number[],
  captainId: number | null,
  viceCaptainId: number | null,
): Promise<TeamActionResult> {
  const { data: rows } = playerIds.length
    ? await supabase.from('players').select('now_cost').in('id', playerIds)
    : { data: [] };
  const totalCost = (rows ?? []).reduce((sum, p) => sum + p.now_cost, 0);

  const { error } = await supabase
    .from('squads')
    .update({
      player_ids: playerIds,
      captain_id: captainId,
      vice_captain_id: viceCaptainId,
      total_cost: totalCost,
    })
    .eq('id', draftId)
    .eq('user_id', userId);
  if (error) return { error: error.message };

  revalidatePath('/my-team/drafts');
  return { ok: true };
}

/** Add a player into an empty slot in a draft. */
export async function addDraftPlayer(draftId: string, playerId: number): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const loaded = await loadDraft(draftId, user.id);
    if ('error' in loaded) return loaded;
    const { team, captainId, viceCaptainId } = loaded;

    const { data: incoming } = await supabase
      .from('players')
      .select('id, web_name, position, team_id, now_cost')
      .eq('id', playerId)
      .maybeSingle();
    if (!incoming) return { error: 'That player does not exist.' };

    const reason = canAdd(team, {
      id: incoming.id,
      position: incoming.position as Position,
      team_id: incoming.team_id,
      now_cost: incoming.now_cost,
      web_name: incoming.web_name,
    });
    if (reason) return { error: reason };

    return saveDraftPlayers(
      supabase,
      draftId,
      user.id,
      [...team.players.map((p) => p.id), incoming.id],
      captainId,
      viceCaptainId,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not add that player.' };
  }
}

/** Remove a player from a draft outright, leaving that slot empty. */
export async function removeDraftPlayer(draftId: string, playerId: number): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const loaded = await loadDraft(draftId, user.id);
    if ('error' in loaded) return loaded;
    const { team, captainId, viceCaptainId } = loaded;

    if (!team.players.some((p) => p.id === playerId)) {
      return { error: 'That player is not in the draft.' };
    }

    return saveDraftPlayers(
      supabase,
      draftId,
      user.id,
      team.players.filter((p) => p.id !== playerId).map((p) => p.id),
      captainId === playerId ? null : captainId,
      viceCaptainId === playerId ? null : viceCaptainId,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not remove that player.' };
  }
}

/** Sell one player from a draft and buy another in the same position. */
export async function swapDraftPlayer(
  draftId: string,
  outPlayerId: number,
  inPlayerId: number,
): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const loaded = await loadDraft(draftId, user.id);
    if ('error' in loaded) return loaded;
    const { team, captainId, viceCaptainId } = loaded;

    const outgoing = team.players.find((p) => p.id === outPlayerId);
    if (!outgoing) return { error: 'That player is not in the draft.' };

    const { data: incoming } = await supabase
      .from('players')
      .select('id, web_name, position, team_id, now_cost')
      .eq('id', inPlayerId)
      .maybeSingle();
    if (!incoming) return { error: 'That player does not exist.' };

    const shadow = shadowTeamWithout(team, outPlayerId);
    const reason = canAdd(shadow, {
      id: incoming.id,
      position: incoming.position as Position,
      team_id: incoming.team_id,
      now_cost: incoming.now_cost,
      web_name: incoming.web_name,
    });
    if (reason) return { error: reason };

    const nextIds = team.players.map((p) => (p.id === outPlayerId ? incoming.id : p.id));
    // The armband follows the slot, the same as the live-team swap: this is a
    // position upgrade, not a deliberate decision to strip the captaincy.
    return saveDraftPlayers(
      supabase,
      draftId,
      user.id,
      nextIds,
      captainId === outPlayerId ? incoming.id : captainId,
      viceCaptainId === outPlayerId ? incoming.id : viceCaptainId,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not make that swap.' };
  }
}

/** Set captain or vice-captain on a draft. */
export async function setDraftArmband(
  draftId: string,
  playerId: number,
  role: 'captain' | 'vice',
): Promise<TeamActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const loaded = await loadDraft(draftId, user.id);
    if ('error' in loaded) return loaded;
    const { team, captainId, viceCaptainId } = loaded;

    if (!team.players.some((p) => p.id === playerId)) {
      return { error: 'That player is not in the draft.' };
    }

    // The same player cannot hold both armbands, so claiming one clears the
    // other if this player happened to already hold it.
    const nextCaptain = role === 'captain' ? playerId : captainId === playerId ? null : captainId;
    const nextVice = role === 'vice' ? playerId : viceCaptainId === playerId ? null : viceCaptainId;

    return saveDraftPlayers(supabase, draftId, user.id, team.players.map((p) => p.id), nextCaptain, nextVice);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not set the armband.' };
  }
}
