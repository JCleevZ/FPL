import { createClient } from '@/lib/supabase/server';
import { SquadBuilder } from './builder';

export const metadata = { title: 'Squad Builder' };
export const dynamic = 'force-dynamic';

export default async function SquadBuilderPage() {
  const supabase = await createClient();

  const [{ data: teams }, { data: players }, { data: profile }] = await Promise.all([
    supabase.from('teams').select('id, name, short_name').order('name'),
    supabase
      .from('players')
      .select('id, web_name, position, now_cost, team_id, selected_by_percent')
      .order('now_cost', { ascending: false })
      .limit(1000),
    supabase.from('profiles').select('favourite_team_id').maybeSingle(),
  ]);

  return (
    <SquadBuilder
      teams={teams ?? []}
      players={players ?? []}
      defaultFavouriteTeamId={profile?.favourite_team_id ?? undefined}
    />
  );
}
