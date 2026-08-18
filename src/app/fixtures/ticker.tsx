'use client';

import { useMemo, useState } from 'react';
import { FixtureLabel, difficultyClass } from '@/components/ui';

export interface TickerTeam {
  id: number;
  name: string;
  short_name: string;
}

export interface FixtureRow {
  event: number;
  team_h: number;
  team_a: number;
  team_h_difficulty: number | null;
  team_a_difficulty: number | null;
  kickoff_time: string | null;
}

interface Cell {
  opponent: string;
  home: boolean;
  difficulty: number;
}

export function FixtureTicker({
  teams,
  fixtures,
  startGw,
}: {
  teams: TickerTeam[];
  fixtures: FixtureRow[];
  startGw: number;
}) {
  const [span, setSpan] = useState(8);
  const [sortByDifficulty, setSortByDifficulty] = useState(false);

  const shortById = useMemo(() => new Map(teams.map((t) => [t.id, t.short_name])), [teams]);
  const gameweeks = useMemo(
    () => Array.from({ length: span }, (_, i) => startGw + i).filter((gw) => gw <= 38),
    [span, startGw],
  );

  /**
   * Fixtures per team per gameweek. A list rather than a single value, so
   * double gameweeks show both matches and blanks show none — the whole point
   * of a ticker is spotting exactly those.
   */
  const grid = useMemo(() => {
    const map = new Map<number, Map<number, Cell[]>>();
    for (const team of teams) map.set(team.id, new Map());

    for (const f of fixtures) {
      if (f.event < startGw || f.event > startGw + span - 1) continue;

      const push = (teamId: number, cell: Cell) => {
        const row = map.get(teamId);
        if (!row) return;
        if (!row.has(f.event)) row.set(f.event, []);
        row.get(f.event)!.push(cell);
      };

      push(f.team_h, {
        opponent: shortById.get(f.team_a) ?? '???',
        home: true,
        difficulty: f.team_h_difficulty ?? 3,
      });
      push(f.team_a, {
        opponent: shortById.get(f.team_h) ?? '???',
        home: false,
        difficulty: f.team_a_difficulty ?? 3,
      });
    }
    return map;
  }, [fixtures, teams, shortById, startGw, span]);

  /** Mean difficulty across the window. Blanks count as maximum difficulty. */
  const averageDifficulty = useMemo(() => {
    const out = new Map<number, number>();
    for (const team of teams) {
      const row = grid.get(team.id);
      let total = 0;
      let n = 0;
      for (const gw of gameweeks) {
        const cells = row?.get(gw) ?? [];
        if (cells.length === 0) {
          total += 5;
          n += 1;
        } else {
          for (const c of cells) {
            total += c.difficulty;
            n += 1;
          }
        }
      }
      out.set(team.id, n > 0 ? total / n : 5);
    }
    return out;
  }, [grid, teams, gameweeks]);

  const orderedTeams = useMemo(() => {
    if (!sortByDifficulty) return teams;
    return [...teams].sort(
      (a, b) => (averageDifficulty.get(a.id) ?? 5) - (averageDifficulty.get(b.id) ?? 5),
    );
  }, [teams, sortByDifficulty, averageDifficulty]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-6 py-10 md:px-8 md:py-14">
      <header className="mb-5">
        <h1 className="text-3xl font-medium">Fixture ticker</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Official FPL difficulty, GW{startGw} onward. (H) is home, (A) away. Two cells in
          a column is a double gameweek; an empty cell is a blank.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Next
          <select
            value={span}
            onChange={(e) => setSpan(Number(e.target.value))}
            className="rounded-md border border-border/50 bg-surface px-2.5 py-1.5 text-sm text-fg
                       outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {[4, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          gameweeks
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={sortByDifficulty}
            onChange={(e) => setSortByDifficulty(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Sort by kindest run
        </label>

        <div className="ml-auto flex items-center gap-1.5 text-xs text-fg-dim">
          <span>Easier</span>
          {[1, 2, 3, 4, 5].map((d) => (
            <span key={d} className={`h-4 w-6 rounded-sm ${difficultyClass(d)}`} />
          ))}
          <span>Harder</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-2">
            <tr>
              <th className="sticky left-0 bg-surface-2 px-3 py-2.5 text-left text-xs font-semibold text-fg-muted">
                Club
              </th>
              {gameweeks.map((gw) => (
                <th key={gw} className="px-2 py-2.5 text-center text-xs font-semibold text-fg-muted">
                  {gw}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-fg-muted">Avg</th>
            </tr>
          </thead>
          <tbody>
            {orderedTeams.map((team) => (
              <tr key={team.id} className="border-t border-divider">
                <td className="sticky left-0 bg-base px-3 py-1.5 font-medium">
                  {team.short_name}
                  <span className="ml-2 hidden text-xs text-fg-dim lg:inline">{team.name}</span>
                </td>

                {gameweeks.map((gw) => {
                  const cells = grid.get(team.id)?.get(gw) ?? [];
                  return (
                    <td key={gw} className="px-1.5 py-2">
                      {cells.length === 0 ? (
                        <div
                          title="Blank gameweek"
                          className="rounded-md border border-dashed border-border py-1 text-center text-[10px] text-fg-dim"
                        >
                          —
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {cells.map((c, i) => (
                            <div
                              key={i}
                              title={`${c.home ? 'Home' : 'Away'} vs ${c.opponent} · difficulty ${c.difficulty}`}
                              className={`rounded-md py-1.5 text-center text-[11px] font-medium ${difficultyClass(c.difficulty)}`}
                            >
                              <FixtureLabel opponent={c.opponent} home={c.home} />
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}

                <td className="tnum px-3 py-1.5 text-right font-semibold text-fg-muted">
                  {(averageDifficulty.get(team.id) ?? 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-fg-dim">
        Difficulty is FPL&apos;s own preseason rating — a rating derived from our own
        conceded and scoring data will replace it once real gameweeks have been played.
      </p>
    </div>
  );
}
