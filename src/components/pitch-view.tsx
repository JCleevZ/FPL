import type { Position } from '@/lib/fpl/types';
import type { BuiltSquad } from '@/lib/ai/squad-builder';
import { PlayerCard } from '@/components/player-card';

/** Availability flags worth surfacing on the card. */
const STATUS_LABEL: Record<string, string> = {
  d: 'Doubt',
  i: 'Injured',
  s: 'Susp',
  u: 'Unavail',
  n: 'Not in squad',
};

type SquadPlayer = BuiltSquad['players'][number];

export function PitchView({
  squad,
  teamName,
}: {
  squad: BuiltSquad;
  teamName: Map<number, string>;
}) {
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const xi = squad.squad.startingXI.map((id) => byId.get(id)!).filter(Boolean);
  const bench = squad.squad.bench.map((id) => byId.get(id)!).filter(Boolean);

  const rows: SquadPlayer[][] = ([1, 2, 3, 4] as Position[]).map((pos) =>
    xi.filter((p) => p.position === pos).sort((a, b) => b.xpts - a.xpts),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Faint row bands and a centre-line motif between DEF and MID make the
          rows read as a pitch formation instead of a bare card grid. */}
      <div className="space-y-2 px-3 py-5 sm:px-6">
        {rows.map((row, i) => (
          <div key={i}>
            {i === 2 && <div className="mx-auto mb-2 h-px w-2/3 bg-fg/10" />}
            <div
              className={`flex flex-wrap justify-center gap-2 rounded-lg py-2 sm:gap-3 ${
                i % 2 === 0 ? 'bg-fg/[0.03]' : ''
              }`}
            >
              {row.map((p) => (
                <PlayerCard
                  key={p.id}
                  id={p.id}
                  teamId={p.team_id}
                  name={p.web_name}
                  team={teamName.get(p.team_id) ?? ''}
                  position={p.position as Position}
                  price={`£${(p.cost / 10).toFixed(1)}`}
                  metric={<span className="text-accent">{p.xpts.toFixed(1)}</span>}
                  flag={p.status && p.status !== 'a' ? STATUS_LABEL[p.status] : null}
                  isCaptain={p.id === squad.captainId}
                  isVice={p.id === squad.viceCaptainId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-divider bg-base/60 px-3 py-4 sm:px-6">
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-dim">
          Bench · in autosub order
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
          {bench.map((p) => (
            <PlayerCard
              key={p.id}
              name={p.web_name}
              team={teamName.get(p.team_id) ?? ''}
              position={p.position as Position}
              price={`£${(p.cost / 10).toFixed(1)}`}
              metric={<span className="text-accent">{p.xpts.toFixed(1)}</span>}
              flag={p.status && p.status !== 'a' ? STATUS_LABEL[p.status] : null}
              muted
            />
          ))}
        </div>
      </div>
    </div>
  );
}
