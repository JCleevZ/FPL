import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import type { BuiltSquad } from '@/lib/ai/squad-builder';

const POSITION_COLOUR: Record<Position, string> = {
  1: 'text-pos-gk',
  2: 'text-pos-def',
  3: 'text-pos-mid',
  4: 'text-pos-fwd',
};

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
    <div className="overflow-hidden rounded-none border-2 border-border bg-surface">
      {/* Flat panel rather than a drawn pitch — the rows already read as lines. */}
      <div
        className="space-y-5 px-3 py-6 sm:px-6"
      >
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {row.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                team={teamName.get(p.team_id) ?? ''}
                isCaptain={p.id === squad.captainId}
                isVice={p.id === squad.viceCaptainId}
              />
            ))}
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
              player={p}
              team={teamName.get(p.team_id) ?? ''}
              muted
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({
  player,
  team,
  isCaptain,
  isVice,
  muted,
}: {
  player: SquadPlayer;
  team: string;
  isCaptain?: boolean;
  isVice?: boolean;
  muted?: boolean;
}) {
  const flag = player.status && player.status !== 'a' ? STATUS_LABEL[player.status] : null;

  return (
    <div
      className={`relative w-[92px] rounded-none border bg-surface-2 px-2 py-2 text-center sm:w-[104px]
                  ${isCaptain ? 'border-accent' : 'border-border'}
                  ${muted ? 'opacity-60' : ''}`}
    >
      {(isCaptain || isVice) && (
        <span
          className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center
                      rounded-full text-[10px] font-bold
                      ${isCaptain ? 'bg-accent text-base' : 'border-2 border-border-bright text-fg-muted'}`}
          title={isCaptain ? 'Captain' : 'Vice-captain'}
        >
          {isCaptain ? 'C' : 'V'}
        </span>
      )}

      <div
        className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${POSITION_COLOUR[player.position as Position]}`}
      >
        {POSITION_NAME[player.position as Position]}
      </div>

      <div className="mt-0.5 truncate text-xs font-semibold" title={player.web_name}>
        {player.web_name}
      </div>

      <div className="mt-0.5 text-[10px] text-fg-dim">{team}</div>

      <div className="tnum mt-1 flex items-center justify-center gap-1.5 text-[10px]">
        <span className="text-fg-muted">£{(player.cost / 10).toFixed(1)}</span>
        <span className="text-accent">{player.xpts.toFixed(1)}</span>
      </div>

      {flag && (
        <div className="mt-1 rounded-none bg-danger/15 py-0.5 text-[9px] font-semibold text-danger">
          {flag}
        </div>
      )}
    </div>
  );
}
