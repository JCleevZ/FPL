import { createClient } from '@/lib/supabase/server';
import { getInsights } from '@/lib/model/recommendations';
import { DraftsList, type DraftRow } from './drafts-list';
import type { CandidatePlayer } from '@/components/candidate-picker';

export const metadata = { title: 'Drafts' };
export const dynamic = 'force-dynamic';

interface RawSquadRow {
  id: string;
  name: string;
  formation: string | null;
  total_cost: number | null;
  budget: number | null;
  source: string;
  created_at: string;
  player_ids: number[];
  captain_id: number | null;
  vice_captain_id: number | null;
}

interface RawPlayerRow {
  id: number;
  web_name: string;
  position: number;
  team_id: number;
  now_cost: number;
  status: string | null;
  news: string | null;
  teams: { short_name: string } | null;
}

export default async function DraftsPage() {
  const supabase = await createClient();

  const [{ data: rows }, { data: teams }, insights] = await Promise.all([
    supabase
      .from('squads')
      .select(
        'id, name, formation, total_cost, budget, source, created_at, player_ids, ' +
          'captain_id, vice_captain_id, reasoning',
      )
      .order('created_at', { ascending: false }),
    supabase.from('teams').select('id, short_name, name').order('name'),
    // Same computation My Team uses for its candidate pool, so a draft edit
    // and a live-team edit show identical projections and tags.
    getInsights(),
  ]);

  const drafts = (rows ?? []) as unknown as (RawSquadRow & {
    reasoning: { xpts?: number } | null;
  })[];

  // One query for every player in every draft, rather than one per draft.
  const allIds = [...new Set(drafts.flatMap((d) => d.player_ids ?? []))];
  const { data: players } =
    allIds.length > 0
      ? await supabase
          .from('players')
          .select('id, web_name, position, team_id, now_cost, status, news, teams(short_name)')
          .in('id', allIds)
      : { data: [] };

  const byId = new Map(((players ?? []) as unknown as RawPlayerRow[]).map((p) => [p.id, p]));

  const draftRows: DraftRow[] = drafts.map((d) => ({
    id: d.id,
    name: d.name,
    formation: d.formation ?? '',
    totalCost: d.total_cost ?? 0,
    budget: d.budget ?? 1000,
    createdAt: d.created_at,
    xpts: typeof d.reasoning?.xpts === 'number' ? d.reasoning.xpts : null,
    captainId: d.captain_id,
    viceCaptainId: d.vice_captain_id,
    players: (d.player_ids ?? [])
      .map((id) => {
        const p = byId.get(id);
        if (!p) return null;
        return {
          id: p.id,
          web_name: p.web_name,
          position: p.position,
          team_id: p.team_id,
          team_short: p.teams?.short_name ?? '',
          now_cost: p.now_cost,
          status: p.status,
          news: p.news,
          is_captain: p.id === d.captain_id,
          is_vice_captain: p.id === d.vice_captain_id,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null),
  }));

  // The full candidate pool for editing — same columns My Team's "Add players"
  // panel uses, so filtering/sorting behaves identically on both pages.
  const { data: allPlayers } = await supabase
    .from('players')
    .select(
      'id, web_name, position, team_id, now_cost, status, news, form, total_points, ' +
        'selected_by_percent, minutes, starts, penalties_order, direct_freekicks_order, ' +
        'corners_and_indirect_freekicks_order',
    )
    .order('total_points', { ascending: false })
    .limit(1000);

  return (
    <DraftsList
      drafts={draftRows}
      candidatePlayers={(allPlayers ?? []) as unknown as CandidatePlayer[]}
      teams={(teams ?? []) as { id: number; short_name: string; name: string }[]}
      insights={Object.fromEntries(insights.byId)}
    />
  );
}
