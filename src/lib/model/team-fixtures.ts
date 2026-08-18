/**
 * Upcoming fixtures for the clubs you actually own players from.
 *
 * The full ticker covers all 20 clubs; this is the slice that matters to your
 * squad, ordered so the kindest runs sit at the top.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface ClubFixtures {
  teamId: number;
  short: string;
  name: string;
  /** Players you own from this club. */
  owned: string[];
  fixtures: {
    gw: number;
    opponent: string;
    home: boolean;
    difficulty: number;
    kickoff: string | null;
  }[];
  /** Mean difficulty across the window. Blanks count as hardest. */
  averageDifficulty: number;
}

interface FixtureRow {
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number | null;
  team_a_difficulty: number | null;
  kickoff_time: string | null;
}

export async function getSquadFixtures(
  players: { team_id: number; web_name: string }[],
  span = 5,
): Promise<{ fromGw: number; gameweeks: number[]; clubs: ClubFixtures[] }> {
  const teamIds = [...new Set(players.map((p) => p.team_id))];
  if (teamIds.length === 0) return { fromGw: 1, gameweeks: [], clubs: [] };

  const db = createAdminClient();
  const [teams, fixtures, gw] = await Promise.all([
    db.from('teams').select('id, short_name, name').in('id', teamIds),
    db
      .from('fixtures')
      .select('event, team_h, team_a, team_h_difficulty, team_a_difficulty, kickoff_time')
      .not('event', 'is', null),
    db.from('gameweeks').select('id').or('is_next.eq.true,is_current.eq.true').order('id').limit(1),
  ]);

  const fromGw = (gw.data?.[0]?.id as number | undefined) ?? 1;
  const gameweeks = Array.from({ length: span }, (_, i) => fromGw + i).filter((n) => n <= 38);
  const rows = (fixtures.data ?? []) as unknown as FixtureRow[];
  const allShort = new Map(
    ((teams.data ?? []) as { id: number; short_name: string }[]).map((t) => [t.id, t.short_name]),
  );

  // Opponent short names may be clubs we do not own, so resolve them separately.
  const { data: everyTeam } = await db.from('teams').select('id, short_name');
  const shortById = new Map(
    ((everyTeam ?? []) as { id: number; short_name: string }[]).map((t) => [t.id, t.short_name]),
  );

  const ownedByTeam = new Map<number, string[]>();
  for (const p of players) {
    if (!ownedByTeam.has(p.team_id)) ownedByTeam.set(p.team_id, []);
    ownedByTeam.get(p.team_id)!.push(p.web_name);
  }

  const clubs: ClubFixtures[] = ((teams.data ?? []) as {
    id: number;
    short_name: string;
    name: string;
  }[]).map((team) => {
    const own: ClubFixtures['fixtures'] = [];

    for (const f of rows) {
      if (f.event === null || !gameweeks.includes(f.event)) continue;
      if (f.team_h === team.id) {
        own.push({
          gw: f.event,
          opponent: shortById.get(f.team_a) ?? '???',
          home: true,
          difficulty: f.team_h_difficulty ?? 3,
          kickoff: f.kickoff_time,
        });
      } else if (f.team_a === team.id) {
        own.push({
          gw: f.event,
          opponent: shortById.get(f.team_h) ?? '???',
          home: false,
          difficulty: f.team_a_difficulty ?? 3,
          kickoff: f.kickoff_time,
        });
      }
    }

    own.sort((a, b) => a.gw - b.gw);

    // A blank gameweek is the worst possible outcome for that week, so score it
    // as maximum difficulty rather than skipping it.
    let total = 0;
    for (const week of gameweeks) {
      const inWeek = own.filter((f) => f.gw === week);
      if (inWeek.length === 0) total += 5;
      else total += inWeek.reduce((s, f) => s + f.difficulty, 0) / inWeek.length;
    }

    return {
      teamId: team.id,
      short: allShort.get(team.id) ?? team.short_name,
      name: team.name,
      owned: ownedByTeam.get(team.id) ?? [],
      fixtures: own,
      averageDifficulty: gameweeks.length ? total / gameweeks.length : 5,
    };
  });

  clubs.sort((a, b) => a.averageDifficulty - b.averageDifficulty);
  return { fromGw, gameweeks, clubs };
}
