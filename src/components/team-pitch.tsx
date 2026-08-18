import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { money, type MyTeam, type TeamPlayer } from '@/lib/team/my-team';

const POSITION_COLOUR: Record<Position, string> = {
  1: 'text-pos-gk',
  2: 'text-pos-def',
  3: 'text-pos-mid',
  4: 'text-pos-fwd',
};

const STATUS_LABEL: Record<string, string> = {
  d: 'Doubt',
  i: 'Injured',
  s: 'Susp',
  u: 'Unavail',
  n: 'Out',
};

/** Read-only pitch for the dashboard. Editing lives on /my-team. */
export function TeamPitch({ team, className = '' }: { team: MyTeam; className?: string }) {
  const rows = ([1, 2, 3, 4] as Position[]).map((pos) => ({
    pos,
    players: team.players
      .filter((p) => p.position === pos)
      .sort((a, b) => b.now_cost - a.now_cost),
  }));

  return (
    <div
      className={`flex flex-col gap-5 border-2 border-border bg-surface px-3 py-6 sm:px-6 ${className}`}
    >
      {rows.map(({ pos, players }) => (
        <div key={pos} className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {players.length === 0 ? (
            <span className="text-xs text-fg-dim">No {POSITION_NAME[pos]} yet</span>
          ) : (
            players.map((p) => <Card key={p.id} player={p} />)
          )}
        </div>
      ))}
    </div>
  );
}

function Card({ player }: { player: TeamPlayer }) {
  const flag = player.status && player.status !== 'a' ? STATUS_LABEL[player.status] : null;
  const drift = player.now_cost - player.purchase_price;

  return (
    <div
      className={`relative w-[96px] rounded-none border bg-surface-2 px-2 py-2 text-center sm:w-[108px]
                  ${player.is_captain ? 'border-accent' : 'border-border'}`}
    >
      {(player.is_captain || player.is_vice_captain) && (
        <span
          className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center
                      rounded-full text-[10px] font-bold
                      ${player.is_captain ? 'bg-accent text-base' : 'border-2 border-border-bright text-fg-muted'}`}
          title={player.is_captain ? 'Captain' : 'Vice-captain'}
        >
          {player.is_captain ? 'C' : 'V'}
        </span>
      )}

      <div
        className={`font-mono text-[9px] font-semibold uppercase tracking-wider ${POSITION_COLOUR[player.position]}`}
      >
        {POSITION_NAME[player.position]}
      </div>

      <div className="mt-0.5 truncate text-xs font-semibold" title={player.web_name}>
        {player.web_name}
      </div>
      <div className="mt-0.5 text-[10px] text-fg-dim">{player.team_short}</div>

      <div className="tnum mt-1 flex items-center justify-center gap-1 text-[10px]">
        <span className="text-fg-muted">{money(player.now_cost)}</span>
        {drift !== 0 && (
          <span
            className={drift > 0 ? 'text-accent' : 'text-danger'}
            title={`Bought at ${money(player.purchase_price)}`}
          >
            {drift > 0 ? '▲' : '▼'}
            {(Math.abs(drift) / 10).toFixed(1)}
          </span>
        )}
      </div>

      {flag && (
        <div
          className="mt-1 rounded-none bg-danger/15 py-0.5 text-[9px] font-semibold text-danger"
          title={player.news ?? undefined}
        >
          {flag}
        </div>
      )}
    </div>
  );
}
