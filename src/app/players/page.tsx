import { createClient } from '@/lib/supabase/server';
import { PlayersTable, type PlayerRow } from './players-table';

export const metadata = { title: 'Players' };
export const dynamic = 'force-dynamic';

export default async function PlayersPage() {
  const supabase = await createClient();

  const [{ data: players }, { data: teams }] = await Promise.all([
    supabase
      .from('players')
      .select(
        'id, web_name, team_id, position, now_cost, total_points, form, points_per_game, ' +
          'selected_by_percent, minutes, starts, goals_scored, assists, clean_sheets, ' +
          'expected_goals, expected_assists, expected_goal_involvements, ' +
          'expected_goals_per_90, expected_assists_per_90, defensive_contribution, ' +
          'ict_index, bonus, bps, status, news, chance_of_playing_next_round, ' +
          'cost_change_event, transfers_in_event, transfers_out_event, ' +
          'penalties_order, direct_freekicks_order, corners_and_indirect_freekicks_order',
      )
      .order('total_points', { ascending: false })
      .limit(1000),
    supabase.from('teams').select('id, name, short_name').order('name'),
  ]);

  return (
    <PlayersTable
      players={(players ?? []) as unknown as PlayerRow[]}
      teams={teams ?? []}
    />
  );
}
