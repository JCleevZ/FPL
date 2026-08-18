'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { SQUAD_QUOTA, SQUAD_SIZE } from '@/lib/model/optimiser';
import { canAdd, money, signedMoney, MAX_PER_CLUB, type MyTeam } from '@/lib/team/my-team';
import { addPlayer, clearTeam, removePlayer, setArmband } from '@/lib/team/actions';
import { InfoNote, SectionHeader, Stat, StatStrip } from '@/components/ui';
import { PlayerLine } from '@/components/player-line';
import type { Recommendation, RecommendationSet } from '@/lib/model/recommendations';

export interface PickablePlayer {
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

export function TeamEditor({
  team,
  players,
  teams,
  suggestions,
  insights,
  budgetByPosition,
  needs,
}: {
  team: MyTeam;
  players: PickablePlayer[];
  teams: { id: number; short_name: string; name: string }[];
  suggestions: RecommendationSet;
  /** Projections and tags for every player, keyed by id. */
  insights: Record<number, Recommendation>;
  budgetByPosition: Record<Position, number>;
  needs: { position: Position; count: number }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // filters
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
  const owned = useMemo(() => new Set(team.players.map((p) => p.id)), [team.players]);

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  };

  const blockedReason = useCallback(
    (p: PickablePlayer) =>
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
        if (owned.has(p.id)) return false;
        if (term && !p.web_name.toLowerCase().includes(term)) return false;
        if (position && p.position !== position) return false;
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
    players, owned, search, position, clubId, maxPrice, minForm, maxOwnership,
    fitOnly, setPiecesOnly, eligibleOnly, sortKey, blockedReason,
  ]);

  /**
   * Only ever suggest players that can be added right now.
   *
   * Ranking purely by projected points produced a list where every option was
   * disabled — too expensive for the slot, or a fourth player from a club. A
   * suggestion you cannot act on is just noise, so filter first, then rank.
   */
  const suggestionList = useMemo(() => {
    const wanted = needs.length ? needs.map((n) => n.position) : ([1, 2, 3, 4] as Position[]);
    return wanted
      .flatMap((pos) =>
        suggestions.byPosition[pos]
          .filter((r) => {
            if (r.now_cost > budgetByPosition[pos]) return false;
            return (
              canAdd(team, {
                id: r.id,
                position: r.position,
                team_id: r.team_id,
                now_cost: r.now_cost,
                web_name: r.web_name,
              }) === null
            );
          })
          .slice(0, 3),
      )
      .sort((a, b) => b.xpts - a.xpts);
  }, [needs, suggestions, budgetByPosition, team]);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-6 py-10 md:px-8 md:py-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium">My team</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            Pick your 15. FPL rules are enforced: {SQUAD_QUOTA[1]} keepers, {SQUAD_QUOTA[2]}{' '}
            defenders, {SQUAD_QUOTA[3]} midfielders, {SQUAD_QUOTA[4]} forwards, and no more
            than {MAX_PER_CLUB} from any one club.
          </p>
        </div>
        {team.players.length > 0 && (
          <button
            type="button"
            onClick={() => run(clearTeam)}
            disabled={pending}
            className="border border-danger/40 px-4 py-2 text-sm text-danger transition-colors
                       hover:bg-danger/10 disabled:opacity-50"
          >
            Clear squad
          </button>
        )}
      </header>

      <div className="mb-8">
        <StatStrip>
          <Stat
            label="In the bank"
            term="bank"
            value={money(team.bank)}
            tone={team.bank < 0 ? 'danger' : 'accent'}
          />
          <Stat label="Squad value" term="squadValue" value={money(team.value)} />
          <Stat
            label="Price change"
            term="priceChange"
            value={signedMoney(team.profit)}
            tone={team.profit > 0 ? 'accent' : team.profit < 0 ? 'danger' : undefined}
          />
          <Stat label="Picked" value={`${team.players.length} / ${SQUAD_SIZE}`} />
        </StatStrip>
      </div>

      {error && (
        <p role="alert" className="mb-5 border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      {/* ---------------- suggested next picks ---------------- */}
      <section className="mb-10">
        <SectionHeader
          title={needs.length ? 'Suggested next picks' : 'Upgrade ideas'}
          hint={
            needs.length
              ? `you still need ${needs.map((n) => `${n.count} ${POSITION_NAME[n.position]}`).join(', ')}`
              : 'squad complete — these would strengthen it'
          }
        />
        <div className="mb-3">
          <InfoNote title="Based on">
            Your squad&apos;s gaps and what you can actually afford. Spending power per
            position accounts for the slots you still have to fill — with {SQUAD_SIZE - team.players.length}{' '}
            spaces left, the maximum for one player is less than your bank balance. Ranked
            by projected points, then filtered to what fits.
          </InfoNote>
        </div>

        {suggestionList.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-dim">
            Nothing fits at the moment — every option is over budget for the slots you have
            left, or would break the {MAX_PER_CLUB}-per-club limit. Removing a pricey player
            frees things up.
          </p>
        ) : (
          <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-divider sm:grid-cols-2 xl:grid-cols-3">
            {suggestionList.map((r) => {
              const budget = budgetByPosition[r.position];
              const blocked = canAdd(team, {
                id: r.id,
                position: r.position,
                team_id: r.team_id,
                now_cost: r.now_cost,
                web_name: r.web_name,
              });
              const affordable = r.now_cost <= budget && team.players.length < SQUAD_SIZE;

              return (
                <li key={r.id} className="bg-base p-4">
                  <PlayerLine
                    insight={r}
                    maxTags={3}
                    actions={
                      <button
                        type="button"
                        onClick={() => run(() => addPlayer(r.id))}
                        disabled={pending || !affordable || blocked !== null}
                        title={
                          blocked ??
                          (affordable
                            ? `Add ${r.web_name}`
                            : `Max spend for a ${POSITION_NAME[r.position]} right now is ${money(budget)}`)
                        }
                        className="border border-accent/50 px-2.5 py-1 text-xs font-medium
                                   text-accent transition-colors hover:bg-accent/10
                                   disabled:cursor-not-allowed disabled:border-border/40
                                   disabled:text-fg-dim disabled:hover:bg-transparent"
                      >
                        Add
                      </button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ---------------- current squad ---------------- */}
        <section>
          <SectionHeader title="Your squad" hint="C and V set captain and vice" />
          <div className="space-y-3">
            {([1, 2, 3, 4] as Position[]).map((pos) => {
              const group = team.players.filter((p) => p.position === pos);
              return (
                <div key={pos} className="rounded-xl border border-border bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`font-mono text-xs font-semibold uppercase ${POSITION_COLOUR[pos]}`}>
                      {POSITION_NAME[pos]}
                    </span>
                    <span className="tnum text-xs text-fg-dim">
                      {group.length} / {SQUAD_QUOTA[pos]}
                    </span>
                  </div>

                  {group.length === 0 ? (
                    <p className="py-2 text-center text-xs text-fg-dim">None picked yet</p>
                  ) : (
                    <ul className="divide-y divide-divider overflow-hidden rounded-lg border border-divider">
                      {group.map((p) => {
                        const insight = insights[p.id];
                        return (
                          <li key={p.id} className="px-2.5 py-2.5">
                            {insight ? (
                              <PlayerLine
                                insight={insight}
                                purchasePrice={p.purchase_price}
                                maxTags={3}
                                actions={
                                  <Armbands
                                    isCaptain={p.is_captain}
                                    isVice={p.is_vice_captain}
                                    disabled={pending}
                                    name={p.web_name}
                                    onCaptain={() => run(() => setArmband(p.id, 'captain'))}
                                    onVice={() => run(() => setArmband(p.id, 'vice'))}
                                    onRemove={() => run(() => removePlayer(p.id))}
                                  />
                                }
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="flex-1 truncate text-sm font-medium">
                                  {p.web_name}
                                  <span className="ml-1.5 font-mono text-[10px] text-fg-dim">
                                    {p.team_short}
                                  </span>
                                </span>
                                <span className="tnum text-xs text-fg-muted">
                                  {money(p.now_cost)}
                                </span>
                                <Armbands
                                  isCaptain={p.is_captain}
                                  isVice={p.is_vice_captain}
                                  disabled={pending}
                                  name={p.web_name}
                                  onCaptain={() => run(() => setArmband(p.id, 'captain'))}
                                  onVice={() => run(() => setArmband(p.id, 'vice'))}
                                  onRemove={() => run(() => removePlayer(p.id))}
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------------- add players ---------------- */}
        <section>
          <SectionHeader title="Add players" hint={`${available.length} shown`} />

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
                value={position}
                onChange={(e) => setPosition(Number(e.target.value) as Position | 0)}
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
              <li className="px-4 py-10 text-center text-sm text-fg-dim">
                No players match those filters.
              </li>
            )}
            {available.map((p) => {
              const blocked = blockedReason(p);
              const insight = insights[p.id];
              const addButton = (
                <button
                  type="button"
                  onClick={() => run(() => addPlayer(p.id))}
                  disabled={pending || blocked !== null}
                  title={blocked ?? `Add ${p.web_name}`}
                  className="border border-accent/50 px-2 py-0.5 text-xs font-medium
                             text-accent transition-colors hover:bg-accent/10
                             disabled:cursor-not-allowed disabled:border-border/40
                             disabled:text-fg-dim disabled:hover:bg-transparent"
                >
                  Add
                </button>
              );

              return (
                <li key={p.id} className="px-3 py-2.5 hover:bg-surface-2">
                  {insight ? (
                    <PlayerLine insight={insight} maxTags={3} actions={addButton} />
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
                      <span className="tnum w-14 text-right text-xs text-fg-muted">
                        {money(p.now_cost)}
                      </span>
                      {addButton}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
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

/** Captain / vice / remove controls, shared by every squad row. */
function Armbands({
  isCaptain,
  isVice,
  disabled,
  name,
  onCaptain,
  onVice,
  onRemove,
}: {
  isCaptain: boolean;
  isVice: boolean;
  disabled: boolean;
  name: string;
  onCaptain: () => void;
  onVice: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onCaptain}
        disabled={disabled}
        title="Make captain — doubles their points"
        className={`h-5 w-5 rounded-md text-[10px] font-bold transition-colors ${
          isCaptain ? 'bg-accent text-base' : 'border border-border/50 text-fg-dim hover:text-fg'
        }`}
      >
        C
      </button>
      <button
        type="button"
        onClick={onVice}
        disabled={disabled}
        title="Make vice-captain — takes over if the captain does not play"
        className={`h-5 w-5 rounded-md text-[10px] font-bold transition-colors ${
          isVice ? 'bg-accent text-base' : 'border border-border/50 text-fg-dim hover:text-fg'
        }`}
      >
        V
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${name}`}
        title={`Remove ${name}`}
        className="h-5 w-5 rounded-md border border-border/50 text-xs text-fg-dim transition-colors
                   hover:border-danger hover:text-danger"
      >
        ×
      </button>
    </>
  );
}
