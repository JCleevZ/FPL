'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Position } from '@/lib/fpl/types';
import { money, shadowTeamWithout, summarise, type TeamPlayer } from '@/lib/team/my-team';
import {
  activateDraft,
  addDraftPlayer,
  deleteDraft,
  removeDraftPlayer,
  setDraftArmband,
  swapDraftPlayer,
} from '@/lib/team/actions';
import { EditablePitch, type ActiveSwap } from '@/components/editable-pitch';
import { CandidatePicker, type CandidatePlayer } from '@/components/candidate-picker';
import { InlineError, TipPill } from '@/components/ui';
import { PlayerNameLink } from '@/components/card-modal';
import type { Recommendation } from '@/lib/model/recommendations';
import type { DraftRow } from './drafts-list';

export function DraftCard({
  draft,
  candidatePlayers,
  teams,
  insights,
}: {
  draft: DraftRow;
  candidatePlayers: CandidatePlayer[];
  teams: { id: number; short_name: string; name: string }[];
  insights: Record<number, Recommendation>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeSwap, setActiveSwap] = useState<ActiveSwap | null>(null);
  const [draggingPosition, setDraggingPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'activate' | 'delete' | null>(null);
  const router = useRouter();

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  };

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  // A draft has no separate "purchase price" — today's price stands in for
  // both, since it is a hypothetical squad rather than one actually owned.
  const team = useMemo(() => {
    const players: TeamPlayer[] = draft.players.map((p) => ({
      id: p.id,
      web_name: p.web_name,
      position: p.position as Position,
      team_id: p.team_id,
      team_short: p.team_short,
      now_cost: p.now_cost,
      purchase_price: p.now_cost,
      is_captain: p.is_captain,
      is_vice_captain: p.is_vice_captain,
      bench_order: null,
      status: p.status,
      news: p.news,
      form: 0,
      total_points: 0,
      selected_by_percent: 0,
    }));
    return summarise(players, draft.budget);
  }, [draft.players, draft.budget]);

  const owned = useMemo(() => new Set(team.players.map((p) => p.id)), [team.players]);
  const insightsMap = useMemo(() => new Map(Object.entries(insights).map(([k, v]) => [Number(k), v])), [insights]);

  const pickerTeam = activeSwap ? shadowTeamWithout(team, activeSwap.outId) : team;
  const outName =
    activeSwap?.outId != null
      ? (draft.players.find((p) => p.id === activeSwap.outId)?.web_name ??
        insightsMap.get(activeSwap.outId)?.web_name)
      : undefined;

  const pickCandidate = (candidateId: number) => {
    if (!activeSwap) return;
    const outId = activeSwap.outId;
    if (outId === null) run(() => addDraftPlayer(draft.id, candidateId));
    else run(() => swapDraftPlayer(draft.id, outId, candidateId));
    setActiveSwap(null);
  };

  const dropCandidate = (_position: Position, outId: number | null, candidateId: number) => {
    if (outId === null) run(() => addDraftPlayer(draft.id, candidateId));
    else run(() => swapDraftPlayer(draft.id, outId, candidateId));
    setActiveSwap(null);
  };

  const activate = () => {
    setError(null);
    setBusy('activate');
    startTransition(async () => {
      const result = await activateDraft(draft.id);
      if (result.error) setError(result.error);
      else router.push('/');
      setBusy(null);
    });
  };

  const remove = () => {
    setError(null);
    setBusy('delete');
    startTransition(async () => {
      const result = await deleteDraft(draft.id);
      if (result.error) setError(result.error);
      else router.refresh();
      setBusy(null);
    });
  };

  return (
    <li className="rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2 sm:flex-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className={`mt-1 shrink-0 text-fg-dim transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            ▶
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="block w-full text-left"
            >
              <h2 className="font-medium">{draft.name}</h2>
              <p className="tnum mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                <span>{draft.formation}</span>
                <span>{money(team.value)}</span>
                {draft.xpts !== null && <span className="text-accent">{draft.xpts} xPts</span>}
                <span className="text-fg-dim">
                  {new Date(draft.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </p>
            </button>
            {!expanded && (
              <p className="mt-2 truncate text-xs leading-relaxed text-fg-dim">
                {draft.players.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ', '}
                    <PlayerNameLink id={p.id}>{p.web_name}</PlayerNameLink>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={activate}
            disabled={busy !== null}
            className="rounded-full border border-accent px-3 py-1.5 text-xs font-medium
                       text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
          >
            {busy === 'activate' ? 'Activating…' : 'Use as active team'}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy !== null}
            className="rounded-full border border-border-bright px-3 py-1.5 text-xs
                       text-fg-dim transition-colors hover:border-danger hover:text-danger
                       disabled:opacity-50"
          >
            {busy === 'delete' ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-divider p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-fg-dim">
              {editing
                ? 'Editing — drag a player in, or click a card to swap'
                : 'Squad view'}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditing((v) => !v);
                setActiveSwap(null);
              }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                editing
                  ? 'bg-cyan/15 text-cyan'
                  : 'border border-border-bright text-fg-muted hover:text-fg'
              }`}
            >
              {editing ? 'Done editing' : 'Edit draft'}
            </button>
          </div>

          {error && <InlineError message={error} className="mb-3" />}

          {editing && (
            <TipPill>
              <span className="sm:hidden">
                Use the ⇄ badge on a card to swap it, or tap an empty slot to fill it.
              </span>
              <span className="hidden sm:inline">
                You can also drag a player straight onto any slot to fill or swap it — works
                even when the squad is full.
              </span>
            </TipPill>
          )}

          <div className={editing ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]' : ''}>
            <EditablePitch
              team={team}
              editable={editing}
              pending={pending}
              activeSwap={activeSwap}
              draggingPosition={draggingPosition}
              onStartSwap={(position, outId) => setActiveSwap({ position, outId })}
              onCancelSwap={() => setActiveSwap(null)}
              onRemove={(id) => run(() => removeDraftPlayer(draft.id, id))}
              onDropCandidate={dropCandidate}
              onSetCaptain={(id) => run(() => setDraftArmband(draft.id, id, 'captain'))}
              onSetVice={(id) => run(() => setDraftArmband(draft.id, id, 'vice'))}
            />

            {editing && (
              <CandidatePicker
                players={candidatePlayers}
                teams={teams}
                team={pickerTeam}
                ownedIds={owned}
                insights={insights}
                activeSwap={activeSwap ? { ...activeSwap, outName } : null}
                onCancelSwap={() => setActiveSwap(null)}
                onPick={activeSwap ? pickCandidate : (id) => run(() => addDraftPlayer(draft.id, id))}
                onDragStart={setDraggingPosition}
                onDragEnd={() => setDraggingPosition(null)}
                pending={pending}
              />
            )}
          </div>
        </div>
      )}
    </li>
  );
}
