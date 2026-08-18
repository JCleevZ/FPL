'use client';

import { useMemo, useState } from 'react';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';

export interface PlayerRow {
  id: number;
  web_name: string;
  team_id: number;
  position: number;
  now_cost: number;
  total_points: number;
  form: number | null;
  points_per_game: number | null;
  selected_by_percent: number | null;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  expected_goals: number | null;
  expected_assists: number | null;
  expected_goal_involvements: number | null;
  expected_goals_per_90: number | null;
  expected_assists_per_90: number | null;
  defensive_contribution: number;
  ict_index: number | null;
  bonus: number;
  bps: number;
  status: string | null;
  news: string | null;
  chance_of_playing_next_round: number | null;
  cost_change_event: number | null;
  transfers_in_event: number | null;
  transfers_out_event: number | null;
  penalties_order: number | null;
  direct_freekicks_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
}

interface TeamRow {
  id: number;
  name: string;
  short_name: string;
}

interface Col {
  key: string;
  label: string;
  title?: string;
  get: (p: PlayerRow) => number;
  format?: (n: number) => string;
  /** Whether a per-90 toggle applies to this column. */
  per90?: boolean;
}

const compact = (n: number) =>
  Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));

const COLUMNS: Col[] = [
  { key: 'now_cost', label: 'Price', get: (p) => p.now_cost, format: (n) => (n / 10).toFixed(1) },
  { key: 'total_points', label: 'Pts', title: 'Total points', get: (p) => p.total_points },
  { key: 'form', label: 'Form', get: (p) => Number(p.form ?? 0), format: (n) => n.toFixed(1) },
  {
    key: 'points_per_game',
    label: 'PPG',
    title: 'Points per game',
    get: (p) => Number(p.points_per_game ?? 0),
    format: (n) => n.toFixed(1),
  },
  {
    key: 'selected_by_percent',
    label: 'Own',
    title: 'Selected by percent',
    get: (p) => Number(p.selected_by_percent ?? 0),
    format: (n) => n.toFixed(1),
  },
  { key: 'minutes', label: 'Mins', get: (p) => p.minutes },
  { key: 'starts', label: 'St', title: 'Starts', get: (p) => p.starts },
  { key: 'goals_scored', label: 'G', title: 'Goals', get: (p) => p.goals_scored },
  { key: 'assists', label: 'A', title: 'Assists', get: (p) => p.assists },
  { key: 'clean_sheets', label: 'CS', title: 'Clean sheets', get: (p) => p.clean_sheets },
  {
    key: 'expected_goals',
    label: 'xG',
    get: (p) => Number(p.expected_goals ?? 0),
    format: (n) => n.toFixed(2),
    per90: true,
  },
  {
    key: 'expected_assists',
    label: 'xA',
    get: (p) => Number(p.expected_assists ?? 0),
    format: (n) => n.toFixed(2),
    per90: true,
  },
  {
    key: 'defensive_contribution',
    label: 'DC',
    title: 'Defensive contribution',
    get: (p) => p.defensive_contribution,
    per90: true,
  },
  { key: 'bonus', label: 'B', title: 'Bonus points', get: (p) => p.bonus },
  { key: 'bps', label: 'BPS', title: 'Bonus points system', get: (p) => p.bps },
  {
    key: 'ict_index',
    label: 'ICT',
    get: (p) => Number(p.ict_index ?? 0),
    format: (n) => n.toFixed(1),
  },
  {
    key: 'net_transfers',
    label: 'Net T',
    title: 'Net transfers this gameweek',
    get: (p) => Number(p.transfers_in_event ?? 0) - Number(p.transfers_out_event ?? 0),
    format: (n) => (n > 0 ? `+${compact(n)}` : compact(n)),
  },
  {
    key: 'value',
    label: 'Val',
    title: 'Points per million',
    get: (p) => (p.now_cost > 0 ? (p.total_points / p.now_cost) * 10 : 0),
    format: (n) => n.toFixed(1),
  },
];

const POSITION_CHIP: Record<Position, string> = {
  1: 'bg-pos-gk/15 text-pos-gk',
  2: 'bg-pos-def/15 text-pos-def',
  3: 'bg-pos-mid/15 text-pos-mid',
  4: 'bg-pos-fwd/15 text-pos-fwd',
};

const STATUS_LABEL: Record<string, string> = {
  d: 'Doubtful',
  i: 'Injured',
  s: 'Suspended',
  u: 'Unavailable',
  n: 'Not in squad',
};

/** Which set pieces a player is first choice for. */
function setPieces(p: PlayerRow): string | null {
  const roles: string[] = [];
  if (p.penalties_order === 1) roles.push('Penalties');
  if (p.direct_freekicks_order === 1) roles.push('Free kicks');
  if (p.corners_and_indirect_freekicks_order === 1) roles.push('Corners');
  return roles.length ? roles.join(', ') : null;
}

export function PlayersTable({ players, teams }: { players: PlayerRow[]; teams: TeamRow[] }) {
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState(0);
  const [teamId, setTeamId] = useState(0);
  const [maxCost, setMaxCost] = useState(160);
  const [sortKey, setSortKey] = useState('total_points');
  const [ascending, setAscending] = useState(false);
  const [per90, setPer90] = useState(false);
  const [fitOnly, setFitOnly] = useState(false);

  const teamName = useMemo(() => new Map(teams.map((t) => [t.id, t.short_name])), [teams]);

  /**
   * Per-90 divides a season total by minutes played. Below a full match the
   * result is noise, so those players show 0 rather than a wildly inflated rate.
   */
  const displayValue = useMemo(
    () => (p: PlayerRow, col: Col) => {
      const raw = col.get(p);
      if (!per90 || !col.per90) return raw;
      return p.minutes >= 90 ? (raw / p.minutes) * 90 : 0;
    },
    [per90],
  );

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey) ?? COLUMNS[1];
    const term = search.trim().toLowerCase();

    return players
      .filter((p) => {
        if (term && !p.web_name.toLowerCase().includes(term)) return false;
        if (position && p.position !== position) return false;
        if (teamId && p.team_id !== teamId) return false;
        if (p.now_cost > maxCost) return false;
        if (fitOnly && p.status && p.status !== 'a') return false;
        return true;
      })
      .sort((a, b) =>
        ascending
          ? displayValue(a, col) - displayValue(b, col)
          : displayValue(b, col) - displayValue(a, col),
      );
  }, [players, search, position, teamId, maxCost, sortKey, ascending, fitOnly, displayValue]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setAscending(!ascending);
    } else {
      setSortKey(key);
      setAscending(false);
    }
  };

  const control =
    'rounded-none border border-border/50 bg-surface px-3 py-2 text-sm text-fg outline-none ' +
    'transition-colors focus:border-accent focus:ring-1 focus:ring-accent';

  return (
    <div className="mx-auto w-full max-w-[1600px] px-6 py-10 md:px-8 md:py-14">
      <header className="mb-5">
        <h1 className="text-3xl font-medium">Players</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Showing {rows.length} of {players.length}. Click a column heading to sort.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player…"
          aria-label="Search player"
          className={`${control} w-52`}
        />

        <select
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-label="Filter by position"
          className={control}
        >
          <option value={0}>All positions</option>
          <option value={1}>Goalkeepers</option>
          <option value={2}>Defenders</option>
          <option value={3}>Midfielders</option>
          <option value={4}>Forwards</option>
        </select>

        <select
          value={teamId}
          onChange={(e) => setTeamId(Number(e.target.value))}
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

        <label className="flex flex-col text-xs text-fg-muted">
          <span className="mb-1">Max £{(maxCost / 10).toFixed(1)}m</span>
          <input
            type="range"
            min={38}
            max={160}
            step={1}
            value={maxCost}
            onChange={(e) => setMaxCost(Number(e.target.value))}
            className="w-40 accent-[var(--color-accent)]"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={per90}
            onChange={(e) => setPer90(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Per 90
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={fitOnly}
            onChange={(e) => setFitOnly(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Fit only
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-fg-muted">Player</th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-fg-muted">Team</th>
              <th className="px-2 py-2.5 text-left text-xs font-semibold text-fg-muted">Pos</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-2 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    title={c.title ?? c.label}
                    className={`text-xs font-semibold transition-colors hover:text-fg ${
                      sortKey === c.key ? 'text-accent' : 'text-fg-muted'
                    }`}
                  >
                    {c.label}
                    {per90 && c.per90 ? '/90' : ''}
                    {sortKey === c.key ? (ascending ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const sp = setPieces(p);
              return (
                <tr key={p.id} className="border-t border-divider transition-colors hover:bg-surface">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    <span className="flex items-center gap-1.5">
                      {p.web_name}
                      {sp && (
                        <span
                          title={sp}
                          className="rounded bg-violet/20 px-1 text-[9px] font-bold text-violet"
                        >
                          SP
                        </span>
                      )}
                      {p.status && p.status !== 'a' && (
                        <span
                          title={p.news || STATUS_LABEL[p.status] || 'Unavailable'}
                          className="rounded bg-danger/20 px-1 text-[9px] font-bold text-danger"
                        >
                          {p.chance_of_playing_next_round ?? 0}%
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-fg-muted">{teamName.get(p.team_id)}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${POSITION_CHIP[p.position as Position]}`}
                    >
                      {POSITION_NAME[p.position as Position]}
                    </span>
                  </td>
                  {COLUMNS.map((c) => {
                    const v = displayValue(p, c);
                    return (
                      <td
                        key={c.key}
                        className={`tnum px-2 py-2 text-right ${
                          sortKey === c.key ? 'font-semibold text-accent' : 'text-fg-muted'
                        }`}
                      >
                        {c.format ? c.format(v) : Math.round(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
