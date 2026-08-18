'use client';

import { useState, useTransition } from 'react';
import type { Position } from '@/lib/fpl/types';
import { addPlayer } from '@/lib/team/actions';
import { PlayerLine } from '@/components/player-line';
import type { RecommendationSet } from '@/lib/model/recommendations';

const TABS: { pos: Position | 0; label: string }[] = [
  { pos: 0, label: 'All' },
  { pos: 1, label: 'GKP' },
  { pos: 2, label: 'DEF' },
  { pos: 3, label: 'MID' },
  { pos: 4, label: 'FWD' },
];

export function Recommendations({
  set,
  bank,
  canAddMore,
  limit = 10,
}: {
  set: RecommendationSet;
  bank: number;
  canAddMore: boolean;
  limit?: number;
}) {
  const [tab, setTab] = useState<Position | 0>(0);
  const [error, setError] = useState<string | null>(null);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [pending, startTransition] = useTransition();

  const source = tab === 0 ? set.overall : set.byPosition[tab];
  const list = (affordableOnly ? source.filter((r) => r.now_cost <= bank) : source).slice(0, limit);

  const add = (id: number) => {
    setError(null);
    startTransition(async () => {
      const result = await addPlayer(id);
      if (result.error) setError(result.error);
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-2 border-border bg-surface">
      <div className="flex shrink-0 items-center gap-1 border-b border-divider px-2">
        {TABS.map((t) => (
          <button
            key={t.pos}
            type="button"
            onClick={() => setTab(t.pos)}
            className={`border-b-2 px-2.5 py-2.5 font-mono text-xs transition-colors ${
              tab === t.pos
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 pr-1 text-[11px] text-fg-muted">
          <input
            type="checkbox"
            checked={affordableOnly}
            onChange={(e) => setAffordableOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
          />
          Affordable
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="shrink-0 border-b border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <ul className="min-h-0 flex-1 divide-y divide-divider overflow-y-auto">
        {list.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-fg-dim">
            Nothing here within your budget.
          </li>
        )}
        {list.map((r, i) => {
          const affordable = r.now_cost <= bank && canAddMore;
          return (
            <li key={r.id} className="px-3 py-3 transition-colors hover:bg-surface-2">
              <PlayerLine
                insight={r}
                rank={i + 1}
                actions={
                  <button
                    type="button"
                    onClick={() => add(r.id)}
                    disabled={!affordable || pending}
                    title={
                      affordable
                        ? `Add ${r.web_name} to your squad`
                        : 'Too expensive, or your squad is full'
                    }
                    className="border border-accent/50 px-2.5 py-1 text-xs font-medium text-accent
                               transition-colors hover:bg-accent/10 disabled:cursor-not-allowed
                               disabled:border-border/40 disabled:text-fg-dim disabled:hover:bg-transparent"
                  >
                    Add
                  </button>
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
