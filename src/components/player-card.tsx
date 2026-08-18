import { POSITION_NAME, type Position } from '@/lib/fpl/types';

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
 */
export function PlayerCard({
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
  return (
    <div
      className={`relative w-[96px] rounded-lg border bg-surface-2 px-2 pb-2 pt-2 text-center sm:w-[108px]
                  ${isCaptain ? 'border-accent' : 'border-border'}
                  ${muted ? 'opacity-60' : ''}`}
    >
      {(isCaptain || isVice) && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center
                     rounded-full bg-accent text-[10px] font-bold text-base shadow-md"
          title={isCaptain ? 'Captain' : 'Vice-captain'}
        >
          {isCaptain ? 'C' : 'V'}
        </span>
      )}

      {/* position tick — the one splash of colour on the card */}
      <div className={`mx-auto h-0.5 w-6 rounded-full ${POSITION_BAR[position]}`} />
      <div
        className={`mt-1 font-mono text-[9px] font-semibold uppercase tracking-wider ${POSITION_COLOUR[position]}`}
      >
        {POSITION_NAME[position]}
      </div>

      <div className="mt-1 truncate text-[13px] font-semibold" title={name}>
        {name}
      </div>

      <div className="tnum mt-1 flex items-center justify-center gap-1.5 text-[10px]">
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
    </div>
  );
}
