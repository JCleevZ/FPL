import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { money, type MyTeam } from '@/lib/team/my-team';
import { PlayerCard } from '@/components/player-card';

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
      className={`space-y-2 rounded-xl border border-border bg-surface px-3 py-5 sm:px-6 ${className}`}
    >
      {rows.map(({ pos, players }, i) => (
        <div key={pos}>
          {i === 2 && <div className="mx-auto mb-2 h-px w-2/3 bg-fg/10" />}
          <div
            className={`flex flex-wrap items-center justify-center gap-2 rounded-lg py-2 sm:gap-3 ${
              i % 2 === 0 ? 'bg-fg/[0.03]' : ''
            }`}
          >
            {players.length === 0 ? (
              <span className="text-xs text-fg-dim">No {POSITION_NAME[pos]} yet</span>
            ) : (
              players.map((p) => {
                const drift = p.now_cost - p.purchase_price;
                return (
                  <PlayerCard
                    key={p.id}
                    id={p.id}
                    teamId={p.team_id}
                    name={p.web_name}
                    team={p.team_short}
                    position={p.position}
                    price={money(p.now_cost)}
                    metric={
                      drift !== 0 ? (
                        <span
                          className={drift > 0 ? 'text-accent' : 'text-danger'}
                          title={`Bought at ${money(p.purchase_price)}`}
                        >
                          {drift > 0 ? '▲' : '▼'}
                          {(Math.abs(drift) / 10).toFixed(1)}
                        </span>
                      ) : undefined
                    }
                    flag={p.status && p.status !== 'a' ? STATUS_LABEL[p.status] : null}
                    flagTitle={p.news ?? undefined}
                    isCaptain={p.is_captain}
                    isVice={p.is_vice_captain}
                  />
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
