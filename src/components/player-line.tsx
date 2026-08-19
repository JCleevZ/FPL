'use client';

import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { money } from '@/lib/team/my-team';
import { Explain, ReasonTag, difficultyClass } from '@/components/ui';
import { useCardModal, TeamBadge } from '@/components/card-modal';
import type { Recommendation } from '@/lib/model/recommendations';

/**
 * The one way a player is displayed anywhere in the app.
 *
 * Every list — dashboard recommendations, My Team suggestions, the add-player
 * picker, your own squad — renders this, so a player shows the same figures and
 * the same tags on every page. Previously each list built its own row and they
 * drifted: a player flagged "Rotation risk" on the dashboard showed nothing at
 * all on My Team.
 */

const POSITION_COLOUR: Record<Position, string> = {
  1: 'text-pos-gk',
  2: 'text-pos-def',
  3: 'text-pos-mid',
  4: 'text-pos-fwd',
};

export interface PlayerLineProps {
  insight: Recommendation;
  /** Price paid, when it differs from the current price. */
  purchasePrice?: number;
  /** Rank number shown to the left. */
  rank?: number;
  /** Buttons rendered on the right. */
  actions?: React.ReactNode;
  /** Hide the reason tags in very tight layouts. */
  showTags?: boolean;
  maxTags?: number;
  /** Show the FPL injury/status note underneath. */
  showNews?: boolean;
}

export function PlayerLine({
  insight,
  purchasePrice,
  rank,
  actions,
  showTags = true,
  maxTags = 4,
  showNews = true,
}: PlayerLineProps) {
  const drift = purchasePrice !== undefined ? insight.now_cost - purchasePrice : 0;

  return (
    <div className="flex items-start gap-2.5">
      {rank !== undefined && (
        <span className="tnum mt-0.5 w-4 shrink-0 text-right font-mono text-[11px] text-fg-dim">
          {rank}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <PlayerIdentity insight={insight} />
        <PlayerMetrics insight={insight} drift={drift} purchasePrice={purchasePrice} />

        {showTags && insight.reasons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {insight.reasons.slice(0, maxTags).map((reason) => (
              <ReasonTag key={reason} reason={reason} />
            ))}
          </div>
        )}

        {showNews && insight.news && (
          <p className="mt-1.5 text-[11px] leading-snug text-fg-dim">{insight.news}</p>
        )}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

/** Name, position and club — the identifying line. */
export function PlayerIdentity({ insight }: { insight: Recommendation }) {
  const { openPlayer } = useCardModal();
  return (
    <div className="flex items-baseline gap-1.5">
      <button
        type="button"
        onClick={() => openPlayer(insight.id)}
        title={`View ${insight.web_name}`}
        className="truncate text-sm font-medium hover:underline"
      >
        {insight.web_name}
      </button>
      <span className={`font-mono text-[10px] uppercase ${POSITION_COLOUR[insight.position]}`}>
        {POSITION_NAME[insight.position]}
      </span>
      <TeamBadge teamId={insight.team_id} size={12} />
      <span className="font-mono text-[10px] text-fg-dim">{insight.team_short}</span>
    </div>
  );
}

/** Price, projection, fixture difficulty and ownership — always in this order. */
export function PlayerMetrics({
  insight,
  drift = 0,
  purchasePrice,
}: {
  insight: Recommendation;
  drift?: number;
  purchasePrice?: number;
}) {
  return (
    <div className="tnum mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
      <span className="flex items-center gap-1">
        {money(insight.now_cost)}
        {drift !== 0 && (
          <span
            className={drift > 0 ? 'text-fdr-1' : 'text-danger'}
            title={`Bought at ${money(purchasePrice ?? insight.now_cost)}`}
          >
            {drift > 0 ? '▲' : '▼'}
            {(Math.abs(drift) / 10).toFixed(1)}
          </span>
        )}
      </span>

      <span className="text-accent">
        <Explain term="xpts">{insight.xpts} xPts</Explain>
      </span>

      <span className="flex items-center gap-1">
        <Explain term="fdr">FDR</Explain>
        <span
          className={`px-1 ${difficultyClass(insight.fixtureDifficulty)}`}
          title={`Average difficulty ${insight.fixtureDifficulty} of 5`}
        >
          {insight.fixtureDifficulty}
        </span>
      </span>

      <span>
        <Explain term="ownership">{insight.selected_by_percent}% owned</Explain>
      </span>
    </div>
  );
}
