'use client';

import { difficultyClass, Explain, FixtureLabel } from '@/components/ui';
import { useCardModal, PlayerNameLink, TeamBadge } from '@/components/card-modal';
import type { ClubFixtures } from '@/lib/model/team-fixtures';

/**
 * Next few fixtures for every club you own a player from, kindest run first.
 * Blank cells are blank gameweeks — the thing worth spotting early.
 */
export function SquadFixtures({
  clubs,
  gameweeks,
}: {
  clubs: ClubFixtures[];
  gameweeks: number[];
}) {
  const { openTeam } = useCardModal();

  if (clubs.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-2">
          <tr>
            <th className="sticky left-0 z-10 bg-surface-2 px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted">
              Club
            </th>
            <th className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted">
              Your players
            </th>
            {gameweeks.map((gw) => (
              <th
                key={gw}
                className="px-2 py-2.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted"
              >
                GW{gw}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-fg-muted">
              <Explain term="fdr">Avg</Explain>
            </th>
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => (
            <tr key={club.teamId} className="border-t border-divider">
              <td className="sticky left-0 z-[1] whitespace-nowrap bg-base px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => openTeam(club.teamId)}
                  className="flex items-center gap-1.5 hover:underline"
                >
                  <TeamBadge teamId={club.teamId} size={16} clickable={false} />
                  {club.short}
                </button>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted">
                {club.owned.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ', '}
                    <PlayerNameLink id={p.id}>{p.web_name}</PlayerNameLink>
                  </span>
                ))}
              </td>

              {gameweeks.map((gw) => {
                const inWeek = club.fixtures.filter((f) => f.gw === gw);
                return (
                  <td key={gw} className="px-1 py-1.5">
                    {inWeek.length === 0 ? (
                      <div
                        title="Blank gameweek — this club does not play"
                        className="rounded-md border border-dashed border-border py-1 text-center text-[10px] text-fg-dim"
                      >
                        —
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {inWeek.map((f, i) => (
                          <div
                            key={i}
                            title={`${f.home ? 'Home' : 'Away'} vs ${f.opponent} · difficulty ${f.difficulty} of 5`}
                            className={`rounded-md py-1 text-center text-[11px] font-medium ${difficultyClass(f.difficulty)}`}
                          >
                            <FixtureLabel opponent={f.opponent} home={f.home} />
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                );
              })}

              <td className="tnum px-3 py-2 text-right text-fg-muted">
                {club.averageDifficulty.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
