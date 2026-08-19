'use client';

import { useState } from 'react';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { SQUAD_QUOTA } from '@/lib/model/optimiser';
import { money, type MyTeam } from '@/lib/team/my-team';
import { PlayerCard } from '@/components/player-card';
import { useCardModal } from '@/components/card-modal';

/**
 * The editable squad pitch. Used identically by My Team and by an expanded
 * draft, so the two interaction models can never drift apart — this is the
 * one place either page's squad grid is drawn.
 *
 * Three ways to change a slot, all converging on the same `onDropCandidate`
 * callback: the red badge removes a player outright; clicking a card opens an
 * inline "swap" confirmation that hands off to the caller's candidate picker;
 * dragging a candidate row from that picker onto any slot of the same
 * position drops it straight in. With `editable={false}` this renders as a
 * plain read-only pitch — no badges, no empty-slot ghosts, nothing clickable.
 */

const STATUS_LABEL: Record<string, string> = {
  d: 'Doubt',
  i: 'Injured',
  s: 'Susp',
  u: 'Unavail',
  n: 'Out',
};

export interface ActiveSwap {
  position: Position;
  /** null means filling an empty slot rather than replacing someone. */
  outId: number | null;
}

export interface EditablePitchProps {
  team: MyTeam;
  editable: boolean;
  pending?: boolean;
  activeSwap?: ActiveSwap | null;
  onStartSwap?: (position: Position, outId: number | null) => void;
  onCancelSwap?: () => void;
  onRemove?: (id: number) => void;
  onDropCandidate?: (position: Position, outId: number | null, candidateId: number) => void;
  onSetCaptain?: (id: number) => void;
  onSetVice?: (id: number) => void;
  /** Position of the candidate currently being dragged, so matching slots light up. */
  draggingPosition?: Position | null;
  className?: string;
}

const noop = () => {};

export function EditablePitch({
  team,
  editable,
  pending = false,
  activeSwap = null,
  onStartSwap = noop,
  onCancelSwap = noop,
  onRemove = noop,
  onDropCandidate = noop,
  onSetCaptain = noop,
  onSetVice = noop,
  draggingPosition = null,
  className = '',
}: EditablePitchProps) {
  const rows = ([1, 2, 3, 4] as Position[]).map((pos) => {
    const filled = team.players
      .filter((p) => p.position === pos)
      .sort((a, b) => b.now_cost - a.now_cost);
    const empties = editable ? Math.max(0, SQUAD_QUOTA[pos] - filled.length) : 0;
    return { pos, filled, empties };
  });

  return (
    <div className={`space-y-2 rounded-xl border border-border bg-surface px-3 py-5 sm:px-6 ${className}`}>
      {rows.map(({ pos, filled, empties }, i) => (
        <div key={pos}>
          {i === 2 && <div className="mx-auto mb-2 h-px w-2/3 bg-fg/10" />}
          <div
            className={`flex flex-wrap items-start justify-center gap-2 rounded-lg py-2 sm:gap-3 ${
              i % 2 === 0 ? 'bg-fg/[0.03]' : ''
            }`}
          >
            {filled.length === 0 && empties === 0 && (
              <span className="py-3 text-xs text-fg-dim">No {POSITION_NAME[pos]} yet</span>
            )}
            {filled.map((p) => (
              <FilledSlot
                key={p.id}
                player={p}
                editable={editable}
                pending={pending}
                isSwapTarget={activeSwap?.position === pos && activeSwap.outId === p.id}
                dragHighlight={editable && draggingPosition === pos}
                onOpenSwap={() => onStartSwap(pos, p.id)}
                onCancelSwap={onCancelSwap}
                onRemove={() => onRemove(p.id)}
                onDrop={(candidateId) => onDropCandidate(pos, p.id, candidateId)}
                onSetCaptain={() => onSetCaptain(p.id)}
                onSetVice={() => onSetVice(p.id)}
              />
            ))}
            {Array.from({ length: empties }).map((_, idx) => (
              <EmptySlot
                key={`empty-${pos}-${idx}`}
                position={pos}
                isSwapTarget={activeSwap?.position === pos && activeSwap.outId === null}
                dragHighlight={draggingPosition === pos}
                onOpen={() => onStartSwap(pos, null)}
                onDrop={(candidateId) => onDropCandidate(pos, null, candidateId)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SlotTeamPlayer {
  id: number;
  web_name: string;
  position: Position;
  team_id: number;
  team_short: string;
  now_cost: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  status?: string | null;
  news?: string | null;
}

type Stage = 'idle' | 'confirm' | 'loading';

function FilledSlot({
  player,
  editable,
  pending,
  isSwapTarget,
  dragHighlight,
  onOpenSwap,
  onCancelSwap,
  onRemove,
  onDrop,
  onSetCaptain,
  onSetVice,
}: {
  player: SlotTeamPlayer;
  editable: boolean;
  pending: boolean;
  isSwapTarget: boolean;
  dragHighlight: boolean;
  onOpenSwap: () => void;
  onCancelSwap: () => void;
  onRemove: () => void;
  onDrop: (candidateId: number) => void;
  onSetCaptain: () => void;
  onSetVice: () => void;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [dragOver, setDragOver] = useState(false);
  const { openPlayer } = useCardModal();

  const beginSwap = () => {
    setStage('loading');
    window.setTimeout(() => {
      setStage('idle');
      onOpenSwap();
    }, 320);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative"
        onDragOver={(e) => {
          if (dragHighlight) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const id = Number(e.dataTransfer.getData('text/x-candidate-id'));
          if (id) onDrop(id);
        }}
      >
        <PlayerCard
          id={player.id}
          teamId={player.team_id}
          name={player.web_name}
          team={player.team_short}
          position={player.position}
          price={money(player.now_cost)}
          flag={player.status && player.status !== 'a' ? STATUS_LABEL[player.status] : null}
          flagTitle={player.news ?? undefined}
          isCaptain={player.is_captain}
          isVice={player.is_vice_captain}
          muted={pending}
        />

        {editable && stage === 'idle' && !pending && (
          <button
            type="button"
            onClick={() => setStage('confirm')}
            aria-label={`Options for ${player.web_name}`}
            className="absolute inset-0 rounded-lg outline-none"
          />
        )}

        {editable && stage === 'confirm' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-lg bg-base/90 backdrop-blur-sm">
            <button
              type="button"
              onClick={beginSwap}
              className="flex items-center gap-1 rounded-md bg-cyan/15 px-2 py-1 text-[11px] font-medium text-cyan"
            >
              <SwapGlyph /> Swap
            </button>
            <button
              type="button"
              onClick={() => setStage('idle')}
              className="text-[10px] text-fg-dim hover:text-fg"
            >
              Cancel
            </button>
          </div>
        )}

        {editable && stage === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-base/90 backdrop-blur-sm">
            <SwapGlyph spinning />
          </div>
        )}

        {editable && (dragHighlight || isSwapTarget) && stage === 'idle' && (
          <div
            className={`pointer-events-none absolute inset-0 rounded-lg border-2 ${
              dragOver
                ? 'border-accent bg-accent/10'
                : isSwapTarget
                  ? 'border-cyan/60'
                  : 'border-cyan/30'
            }`}
          />
        )}
      </div>

      {editable && (
        <div className="flex gap-1">
          <ArmbandButton label="C" active={player.is_captain} disabled={pending} onClick={onSetCaptain} />
          <ArmbandButton label="V" active={player.is_vice_captain} disabled={pending} onClick={onSetVice} />
          <button
            type="button"
            onClick={() => openPlayer(player.id)}
            aria-label={`View ${player.web_name}`}
            title={`View ${player.web_name}`}
            className="flex h-4 w-4 items-center justify-center rounded border border-border-bright
                       text-[9px] font-bold leading-none text-fg-dim transition-colors hover:text-fg"
          >
            ⓘ
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            aria-label={`Remove ${player.web_name}`}
            title={`Remove ${player.web_name}`}
            className="flex h-4 w-4 items-center justify-center rounded border border-danger
                       text-[10px] font-bold leading-none text-danger transition-colors
                       hover:bg-danger/10 disabled:pointer-events-none disabled:opacity-50"
          >
            ×
          </button>
        </div>
      )}

      {/* Keeps the "cancel swap" affordance reachable if a parent-driven picker
          (rather than this card's own confirm step) opened for this slot. */}
      {editable && isSwapTarget && stage === 'idle' && (
        <button
          type="button"
          onClick={onCancelSwap}
          className="text-[9px] text-fg-dim hover:text-fg"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function EmptySlot({
  position,
  isSwapTarget,
  dragHighlight,
  onOpen,
  onDrop,
}: {
  position: Position;
  isSwapTarget: boolean;
  dragHighlight: boolean;
  onOpen: () => void;
  onDrop: (candidateId: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const open = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      onOpen();
    }, 250);
  };

  return (
    <button
      type="button"
      onClick={open}
      onDragOver={(e) => {
        if (dragHighlight) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = Number(e.dataTransfer.getData('text/x-candidate-id'));
        if (id) onDrop(id);
      }}
      className={`flex w-[96px] flex-col items-center justify-center rounded-lg border-2 border-dashed
                  px-2 py-4 text-center transition-colors sm:w-[108px] ${
                    dragOver
                      ? 'border-accent bg-accent/10'
                      : isSwapTarget
                        ? 'border-cyan/60 bg-cyan/5'
                        : 'border-border/60 hover:border-border-bright'
                  }`}
    >
      {loading ? (
        <SwapGlyph spinning />
      ) : (
        <>
          <span className="text-xl leading-none text-fg-dim">+</span>
          <span className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-fg-dim">
            {POSITION_NAME[position]}
          </span>
        </>
      )}
    </button>
  );
}

function ArmbandButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: 'C' | 'V';
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label === 'C' ? 'Make captain — doubles their points' : 'Make vice-captain'}
      className={`h-4 w-4 rounded text-[9px] font-bold leading-none transition-colors ${
        active ? 'bg-accent text-base' : 'border border-border/50 text-fg-dim hover:text-fg'
      }`}
    >
      {label}
    </button>
  );
}

/** Two curved arrows — no icon dependency, just an inline glyph that can spin. */
function SwapGlyph({ spinning = false }: { spinning?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block text-sm leading-none text-cyan ${spinning ? 'animate-spin' : ''}`}
    >
      ⇄
    </span>
  );
}
