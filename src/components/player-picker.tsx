'use client';

import { useRef, useState } from 'react';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import type { PlayerOption } from '@/app/squad-builder/builder';

/**
 * Multi-select player picker built on a native <datalist>.
 *
 * The browser gives us type-ahead over 590 players for free — no combobox
 * library, no virtualisation, and it stays keyboard-accessible by default.
 * Selections are submitted as a comma-separated hidden field.
 */
export function PlayerPicker({
  name,
  players,
  teamName,
  placeholder,
  accent = 'accent',
}: {
  name: string;
  players: PlayerOption[];
  teamName: Map<number, string>;
  placeholder?: string;
  accent?: 'accent' | 'danger';
}) {
  const [chosen, setChosen] = useState<PlayerOption[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${name}-options`;

  // Label must be unique per option, since a datalist matches on value.
  const labelFor = (p: PlayerOption) =>
    `${p.web_name} · ${teamName.get(p.team_id) ?? '???'} · ${POSITION_NAME[p.position as Position]} · £${(p.now_cost / 10).toFixed(1)}m`;

  const byLabel = new Map(players.map((p) => [labelFor(p), p]));

  const add = (raw: string) => {
    const match =
      byLabel.get(raw) ??
      players.find((p) => p.web_name.toLowerCase() === raw.trim().toLowerCase());
    if (!match || chosen.some((c) => c.id === match.id)) return;
    setChosen([...chosen, match]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const ring = accent === 'danger' ? 'border-danger/40 text-danger' : 'border-accent/40 text-accent';

  return (
    <div>
      <input type="hidden" name={name} value={chosen.map((c) => c.id).join(',')} />

      <input
        ref={inputRef}
        list={listId}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          // Selecting from a datalist fires change with the full option value.
          if (byLabel.has(e.target.value)) add(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(e.currentTarget.value);
          }
        }}
        className="w-full rounded-none border border-border/50 bg-surface px-3 py-2 text-sm text-fg
                   outline-none transition-colors placeholder:text-fg-dim
                   focus:border-accent focus:ring-1 focus:ring-accent"
      />

      <datalist id={listId}>
        {players.map((p) => (
          <option key={p.id} value={labelFor(p)} />
        ))}
      </datalist>

      {chosen.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {chosen.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setChosen(chosen.filter((c) => c.id !== p.id))}
                className={`flex items-center gap-1.5 rounded-full border bg-surface-2 px-2.5 py-1
                            text-xs transition-colors hover:bg-surface-3 ${ring}`}
                aria-label={`Remove ${p.web_name}`}
              >
                {p.web_name}
                <span aria-hidden className="text-fg-dim">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
