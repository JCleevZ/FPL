'use client';

import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { useCardModal, PlayerAvatar, TeamBadge } from '@/components/card-modal';
import { HoverCard } from '@/components/hover-card';

const POSITION_COLOUR: Record<Position, string> = {
  1: 'text-pos-gk',
  2: 'text-pos-def',
  3: 'text-pos-mid',
  4: 'text-pos-fwd',
};

const POSITION_BAR: Record<Position, string> = {
  1: 'bg-pos-gk',
  2: 'bg-pos-def',
  3: 'bg-pos-mid',
  4: 'bg-pos-fwd',
};

/**
 * The one player card. Used by the squad-builder pitch and the dashboard pitch
 * so the two can never drift apart again. The captain and vice badges share the
 * same white fill — only the letter differs.
 *
 * Pass `id` to make the card open that player's detail popup on click and show
 * their photo. Without it (or where a caller already owns the click, like the
 * editable squad pitch's swap menu) it renders as a plain, inert card.
 */
export function PlayerCard({
  id,
  teamId,
  name,
  team,
  position,
  price,
  metric,
  flag,
  flagTitle,
  isCaptain,
  isVice,
  muted,
}: {
  id?: number;
  teamId?: number;
  name: string;
  team: string;
  position: Position;
  price: string;
  metric?: React.ReactNode;
  flag?: string | null;
  flagTitle?: string;
  isCaptain?: boolean;
  isVice?: boolean;
  muted?: boolean;
}) {
  const { openPlayer } = useCardModal();

  const body = (
    <>
      {(isCaptain || isVice) && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center
                     rounded-full bg-accent text-[10px] font-bold text-base shadow-md"
          title={isCaptain ? 'Captain' : 'Vice-captain'}
        >
          {isCaptain ? 'C' : 'V'}
        </span>
      )}

      {id !== undefined ? (
        <PlayerAvatar playerId={id} position={position} size={36} />
      ) : (
        <div className={`mx-auto h-0.5 w-6 rounded-full ${POSITION_BAR[position]}`} />
      )}

      <div
        className={`mt-1 font-mono text-[9px] font-semibold uppercase tracking-wider ${POSITION_COLOUR[position]}`}
      >
        {POSITION_NAME[position]}
      </div>

      <div className="mt-1 truncate text-[13px] font-semibold" title={name}>
        {name}
      </div>

      <div className="tnum mt-1 flex items-center justify-center gap-1 text-[10px]">
        {teamId !== undefined && <TeamBadge teamId={teamId} size={12} clickable={false} />}
        <span className="text-fg-dim">{team}</span>
        <span className="text-fg-dim">·</span>
        <span className="text-fg-muted">{price}</span>
        {metric}
      </div>

      {flag && (
        <div
          className="mt-1.5 rounded-md bg-danger/15 py-0.5 text-[9px] font-semibold text-danger"
          title={flagTitle}
        >
          {flag}
        </div>
      )}
    </>
  );

  const shared = `relative w-[90px] rounded-lg border bg-surface-2 px-2 pb-2 pt-2 text-center sm:w-[108px]
                   ${isCaptain ? 'border-accent' : 'border-border'}
                   ${muted ? 'opacity-60' : ''}`;

  if (id === undefined) {
    return <div className={shared}>{body}</div>;
  }

  const button = (
    <button
      type="button"
      onClick={() => openPlayer(id)}
      className={`${shared} block transition-colors hover:border-border-bright`}
    >
      {body}
    </button>
  );

  return (
    <HoverCard
      clickToOpen={false}
      content={
        <div>
          <div className="font-semibold text-fg">{name}</div>
          <div className="mt-0.5">
            {POSITION_NAME[position]} · {team} · {price}
          </div>
          {flag && flagTitle && <div className="mt-1.5 text-danger">{flagTitle}</div>}
          <div className="mt-1.5 text-[10px] text-fg-dim">Click for full profile</div>
        </div>
      }
    >
      {button}
    </HoverCard>
  );
}
