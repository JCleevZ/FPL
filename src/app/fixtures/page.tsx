import { createClient } from '@/lib/supabase/server';
import { FixtureTicker, type FixtureRow, type TickerTeam } from './ticker';

export const metadata = { title: 'Fixtures' };
export const dynamic = 'force-dynamic';

export default async function FixturesPage() {
  const supabase = await createClient();

  const [{ data: teams }, { data: fixtures }, { data: gw }] = await Promise.all([
    supabase.from('teams').select('id, name, short_name').order('name'),
    supabase
      .from('fixtures')
      .select('event, team_h, team_a, team_h_difficulty, team_a_difficulty, kickoff_time')
      .not('event', 'is', null)
      .order('event'),
    supabase
      .from('gameweeks')
      .select('id')
      .or('is_next.eq.true,is_current.eq.true')
      .order('id')
      .limit(1),
  ]);

  return (
    <FixtureTicker
      teams={(teams ?? []) as TickerTeam[]}
      fixtures={(fixtures ?? []) as unknown as FixtureRow[]}
      startGw={gw?.[0]?.id ?? 1}
    />
  );
}
