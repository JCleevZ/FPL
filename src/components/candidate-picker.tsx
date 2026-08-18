'use client';

import { useCallback, useMemo, useState } from 'react';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { canAdd, money, type MyTeam } from '@/lib/team/my-team';
import { PlayerLine } from '@/components/player-line';
import type { Recommendation } from '@/lib/model/recommendations';

/**
 * The searchable player pool used to fill an empty slot or swap into an
 * occupied one. Shared by My Team and the draft editor so browsing, filtering
 * and dragging a player in behaves identically on both pages.
 */

export interface CandidatePlayer {
  id: number;
  web_name: string;
  position: number;
  team_id: number;
  now_cost: number;
  status: string | null;
  news: string | null;
  form: number | null;
  total_points: number;
  selected_by_percent: number | null;
  minutes: number;
  starts: number;
  penalties_order: number | null;
  direct_freekicks_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
}

const POSITION_COLOUR: Record<Position, string> = {
  1: 'text-pos-gk',
  2: 'text-pos-def',
  3: 'text-pos-mid',
  4: 'text-pos-fwd',
};

type SortKey = 'total_points' | 'now_cost' | 'form' | 'selected_by_percent' | 'minutes';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'total_points', label: 'Total points' },
  { key: 'form', label: 'Form' },
  { key: 'now_cost', label: 'Price' },
  { key: 'selected_by_percent', label: 'Ownership' },
  { key: 'minutes', label: 'Minutes' },
];

const control =
  'border border-border/50 bg-surface px-3 py-2 text-sm text-fg outline-none ' +
  'transition-colors focus:border-accent focus:ring-1 focus:ring-accent';

export interface CandidatePickerProps {
  players: CandidatePlayer[];
  teams: { id: number; short_name: string; name: string }[];
  /** Legality is checked against this team — pass the shadow team while swapping. */
  team: MyTeam;
  ownedIds: Set<number>;
  insights: Record<number, Recommendation>;
  /** Which slot is being filled, if any — locks the position filter and swaps the button to "Swap in". */
  activeSwap?: { position: Position; outId: number | null; outName?: string } | null;
  onCancelSwap?: () => void;
  onPick: (candidateId: number) => void;
  onDragStart?: (position: Position) => void;
  onDragEnd?: () => void;
  pending?: boolean;
}

export function CandidatePicker({
  players,
  teams,
  team,
  ownedIds,
  insights,
  activeSwap = null,
  onCancelSwap,
  onPick,
  onDragStart,
  onDragEnd,
  pending = false,
}: CandidatePickerProps) {
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<Position | 0>(0);
  const [clubId, setClubId] = useState(0);
  const [maxPrice, setMaxPrice] = useState(160);
  const [minForm, setMinForm] = useState(0);
  const [maxOwnership, setMaxOwnership] = useState(100);
  const [fitOnly, setFitOnly] = useState(false);
  const [setPiecesOnly, setSetPiecesOnly] = useState(false);
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('total_points');

  const teamShort = useMemo(() => new Map(teams.map((t) => [t.id, t.short_name])), [teams]);
  const isSwapping = activeSwap !== null;
  const effectivePosition = activeSwap?.position ?? position;

  // Replacing an existing player is a two-step confirmation ("swap Raya for
  // Kelleher?") so the two names are visible together before anything happens.
  // Filling an empty slot has nothing to compare against, so that stays a
  // single click — the "Add" button already says exactly what it does.
  const isReplacement = isSwapping && activeSwap!.outId !== null;
  const [pendingPick, setPendingPick] = useState<CandidatePlayer | null>(null);

  // Reset the tentative pick whenever the slot being edited changes — during
  // render, per React's own guidance for adjusting state from a prop change,
  // rather than in an effect (which would cost an extra render pass here).
  const swapKey = activeSwap ? `${activeSwap.position}:${activeSwap.outId}` : null;
  const [lastSwapKey, setLastSwapKey] = useState(swapKey);
  if (swapKey !== lastSwapKey) {
    setLastSwapKey(swapKey);
    setPendingPick(null);
  }

  const blockedReason = useCallback(
    (p: CandidatePlayer) =>
      canAdd(team, {
        id: p.id,
        position: p.position as Position,
        team_id: p.team_id,
        now_cost: p.now_cost,
        web_name: p.web_name,
      }),
    [team],
  );

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return players
      .filter((p) => {
        if (ownedIds.has(p.id)) return false;
        if (term && !p.web_name.toLowerCase().includes(term)) return false;
        if (effectivePosition && p.position !== effectivePosition) return false;
        if (clubId && p.team_id !== clubId) return false;
        if (p.now_cost > maxPrice) return false;
        if (Number(p.form ?? 0) < minForm) return false;
        if (Number(p.selected_by_percent ?? 0) > maxOwnership) return false;
        if (fitOnly && p.status && p.status !== 'a') return false;
        if (
          setPiecesOnly &&
          p.penalties_order !== 1 &&
          p.direct_freekicks_order !== 1 &&
          p.corners_and_indirect_freekicks_order !== 1
        ) {
          return false;
        }
        if (eligibleOnly && blockedReason(p) !== null) return false;
        return true;
      })
      .sort((a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0))
      .slice(0, 80);
  }, [
    players, ownedIds, search, effectivePosition, clubId, maxPrice, minForm, maxOwnership,
    fitOnly, setPiecesOnly, eligibleOnly, sortKey, blockedReason,
  ]);

  return (
    <div>
      {isSwapping && pendingPick && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          <span className="text-fg">
            Swap <span className="font-medium">{activeSwap!.outName ?? 'this player'}</span> for{' '}
            <span className="font-medium">{pendingPick.web_name}</span>?
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onPick(pendingPick.id);
                setPendingPick(null);
              }}
              disabled={pending}
              className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setPendingPick(null)}
              className="text-xs text-fg-dim hover:text-fg"
            >
              Choose someone else
            </button>
          </div>
        </div>
      )}

      {isSwapping && !pendingPick && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-sm">
          <span className="text-cyan">
            {activeSwap.outId === null
              ? `Filling an empty ${POSITION_NAME[activeSwap.position]} slot`
              : `Swapping out ${activeSwap.outName ?? 'this player'}`}{' '}
            — showing {POSITION_NAME[activeSwap.position]} only
          </span>
          {onCancelSwap && (
            <button type="button" onClick={onCancelSwap} className="text-xs text-fg-dim hover:text-fg">
              Cancel
            </button>
          )}
        </div>
      )}

      <div className="mb-3 space-y-2 rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player…"
            aria-label="Search player"
            className={`${control} min-w-[140px] flex-1`}
          />
          <select
            value={effectivePosition}
            onChange={(e) => setPosition(Number(e.target.value) as Position | 0)}
            disabled={isSwapping}
            aria-label="Filter by position"
            className={`${control} disabled:opacity-60`}
          >
            <option value={0}>All positions</option>
            <option value={1}>Goalkeepers</option>
            <option value={2}>Defenders</option>
            <option value={3}>Midfielders</option>
            <option value={4}>Forwards</option>
          </select>
          <select
            value={clubId}
            onChange={(e) => setClubId(Number(e.target.value))}
            aria-label="Filter by club"
            className={control}
          >
            <option value={0}>All clubs</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort by"
            className={control}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <Slider
            label={`Max price £${(maxPrice / 10).toFixed(1)}m`}
            value={maxPrice}
            min={38}
            max={160}
            onChange={setMaxPrice}
          />
          <Slider
            label={`Min form ${minForm.toFixed(1)}`}
            value={minForm}
            min={0}
            max={10}
            step={0.5}
            onChange={setMinForm}
          />
          <Slider
            label={`Max owned ${maxOwnership}%`}
            value={maxOwnership}
            min={0}
            max={100}
            onChange={setMaxOwnership}
          />
        </div>

        <div className="flex flex-wrap gap-4 pt-1">
          <Toggle checked={eligibleOnly} onChange={setEligibleOnly} label="Only ones I can add" />
          <Toggle checked={fitOnly} onChange={setFitOnly} label="Fit only" />
          <Toggle checked={setPiecesOnly} onChange={setSetPiecesOnly} label="Set-piece takers" />
        </div>
      </div>

      <ul className="max-h-[620px] divide-y divide-divider overflow-y-auto rounded-xl border border-border">
        {available.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-fg-dim">No players match those filters.</li>
        )}
        {available.map((p) => {
          const blocked = blockedReason(p);
          const insight = insights[p.id];
          // Replacing an existing player asks for confirmation first; filling
          // an empty slot or a plain add has nothing to compare against, so it
          // stays a direct action.
          const pick = () => (isReplacement ? setPendingPick(p) : onPick(p.id));
          const pickButton = (
            <button
              type="button"
              onClick={pick}
              disabled={pending || blocked !== null}
              title={blocked ?? (isSwapping ? `Swap in ${p.web_name}` : `Add ${p.web_name}`)}
              className="border border-accent/50 px-2 py-0.5 text-xs font-medium
                         text-accent transition-colors hover:bg-accent/10
                         disabled:cursor-not-allowed disabled:border-border/40
                         disabled:text-fg-dim disabled:hover:bg-transparent"
            >
              {isSwapping ? 'Swap in' : 'Add'}
            </button>
          );

          return (
            <li
              key={p.id}
              draggable={onDragStart !== undefined}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/x-candidate-id', String(p.id));
                e.dataTransfer.effectAllowed = 'move';
                onDragStart?.(p.position as Position);
              }}
              onDragEnd={onDragEnd}
              className={`px-3 py-2.5 hover:bg-surface-2 ${onDragStart ? 'cursor-grab active:cursor-grabbing' : ''}`}
            >
              {insight ? (
                <PlayerLine insight={insight} maxTags={3} actions={pickButton} />
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className={`w-8 shrink-0 font-mono text-[10px] font-semibold uppercase ${POSITION_COLOUR[p.position as Position]}`}
                  >
                    {POSITION_NAME[p.position as Position]}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.web_name}
                    <span className="ml-1.5 font-mono text-[10px] text-fg-dim">
                      {teamShort.get(p.team_id)}
                    </span>
                  </span>
                  <span className="tnum w-14 text-right text-xs text-fg-muted">{money(p.now_cost)}</span>
                  {pickButton}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col text-[11px] text-fg-muted">
      <span className="mb-1">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-36 accent-[var(--color-accent)]"
      />
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
}
