import { createClient } from '@/lib/supabase/server';
import { loadMyTeam } from '@/lib/team/actions';
import { getInsights, getRecommendations } from '@/lib/model/recommendations';
import { maxSpendOn, outstandingNeeds } from '@/lib/team/my-team';
import type { Position } from '@/lib/fpl/types';
import { TeamEditor, type PickablePlayer } from './editor';

export const metadata = { title: 'My Team' };
export const dynamic = 'force-dynamic';

export default async function MyTeamPage() {
  const supabase = await createClient();

  const [team, { data: players }, { data: teams }] = await Promise.all([
    loadMyTeam(),
    supabase
      .from('players')
      .select(
        'id, web_name, position, team_id, now_cost, status, news, form, total_points, ' +
          'selected_by_percent, minutes, starts, penalties_order, direct_freekicks_order, ' +
          'corners_and_indirect_freekicks_order',
      )
      .order('total_points', { ascending: false })
      .limit(1000),
    supabase.from('teams').select('id, short_name, name').order('name'),
  ]);

  const rows = (players ?? []) as unknown as PickablePlayer[];

  // Cheapest available option per position, used to work out how much can
  // actually be spent on the next pick without stranding the remaining slots.
  const cheapest = { 1: 40, 2: 40, 3: 40, 4: 40 } as Record<Position, number>;
  for (const pos of [1, 2, 3, 4] as Position[]) {
    const prices = rows.filter((p) => p.position === pos).map((p) => p.now_cost);
    if (prices.length) cheapest[pos] = Math.min(...prices);
  }

  const needs = outstandingNeeds(team);
  const budgetByPosition = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Position, number>;
  for (const pos of [1, 2, 3, 4] as Position[]) {
    budgetByPosition[pos] = maxSpendOn(team, pos, cheapest);
  }

  // Only suggest for positions still missing players; if the squad is full,
  // suggest across the board as upgrade ideas.
  const suggestionPositions = needs.length
    ? needs.map((n) => n.position)
    : ([1, 2, 3, 4] as Position[]);

  // Cap the query by the loosest per-position budget, so the ranking happens
  // WITHIN what is affordable. Ranking the whole league first and filtering
  // afterwards just returns premiums the user cannot buy — the top 60 by
  // projected points contains almost no budget players.
  const spendCeiling = Math.max(...suggestionPositions.map((pos) => budgetByPosition[pos]), 40);

  // Insights for EVERY player, so the add-list and your own squad show the same
  // figures and tags the dashboard shows. Both calls share one computation.
  const [suggestions, insights] = await Promise.all([
    getRecommendations({
      excludeIds: team.players.map((p) => p.id),
      positions: suggestionPositions,
      maxCost: spendCeiling,
      perPosition: 25,
    }),
    getInsights(),
  ]);

  return (
    <TeamEditor
      team={team}
      players={rows}
      teams={(teams ?? []) as { id: number; short_name: string; name: string }[]}
      suggestions={suggestions}
      insights={Object.fromEntries(insights.byId)}
      budgetByPosition={budgetByPosition}
      needs={needs}
    />
  );
}
