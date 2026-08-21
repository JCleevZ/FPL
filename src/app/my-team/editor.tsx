'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { SQUAD_SIZE } from '@/lib/model/optimiser';
import { canAdd, money, shadowTeamWithout, signedMoney, MAX_PER_CLUB, type MyTeam } from '@/lib/team/my-team';
import { addPlayer, clearTeam, removePlayer, setArmband, swapPlayer } from '@/lib/team/actions';
import { CollapseToggle, InfoNote, InlineError, SectionHeader, Stat, StatStrip, TipPill } from '@/components/ui';
import { PlayerLine, PlayerIdentity, PlayerMetrics } from '@/components/player-line';
import { EditablePitch, type ActiveSwap } from '@/components/editable-pitch';
import { CandidatePicker, type CandidatePlayer } from '@/components/candidate-picker';
import type { Recommendation, RecommendationSet } from '@/lib/model/recommendations';
import type { UpgradeIdea } from '@/lib/team/upgrades';
import Link from 'next/link';

export type PickablePlayer = CandidatePlayer;

const POSITION_COLOUR: Record<Position, string> = {
  1: 'text-pos-gk',
  2: 'text-pos-def',
  3: 'text-pos-mid',
  4: 'text-pos-fwd',
};

export function TeamEditor({
  team,
  players,
  teams,
  suggestions,
  insights,
  budgetByPosition,
  needs,
  upgrades,
  draftCount,
}: {
  team: MyTeam;
  players: CandidatePlayer[];
  teams: { id: number; short_name: string; name: string }[];
  suggestions: RecommendationSet;
  /** Projections and tags for every player, keyed by id. */
  insights: Record<number, Recommendation>;
  budgetByPosition: Record<Position, number>;
  needs: { position: Position; count: number }[];
  /** Swap suggestions, populated only once the squad is complete. */
  upgrades: UpgradeIdea[];
  draftCount: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeSwap, setActiveSwap] = useState<ActiveSwap | null>(null);
  const [draggingPosition, setDraggingPosition] = useState<Position | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);

  const owned = useMemo(() => new Set(team.players.map((p) => p.id)), [team.players]);
  const insightsMap = useMemo(() => new Map(Object.entries(insights).map(([k, v]) => [Number(k), v])), [insights]);

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  };

  // Errors from the pitch/picker are shown right next to them, not at the top
  // of a page that can run well below the fold — so they need to clear
  // themselves rather than sit there once the user has moved on.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  // While a slot is being replaced, legality has to be judged against the
  // squad as it would sit once that slot's occupant is sold — not the squad as
  // it stands now, which would wrongly reject anyone only affordable once the
  // sale goes through.
  const pickerTeam = activeSwap ? shadowTeamWithout(team, activeSwap.outId) : team;
  const outName =
    activeSwap?.outId != null ? insightsMap.get(activeSwap.outId)?.web_name : undefined;

  const pickCandidate = (candidateId: number) => {
    if (!activeSwap) return;
    // Narrowed to a local so the closures below capture a plain number rather
    // than a property TS cannot guarantee is still non-null by the time an
    // async callback actually runs.
    const outId = activeSwap.outId;
    if (outId === null) run(() => addPlayer(candidateId));
    else run(() => swapPlayer(outId, candidateId));
    setActiveSwap(null);
  };

  const dropCandidate = (position: Position, outId: number | null, candidateId: number) => {
    if (outId === null) run(() => addPlayer(candidateId));
    else run(() => swapPlayer(outId, candidateId));
    setActiveSwap(null);
  };

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
            Pick your 15. FPL rules are enforced: 2 keepers, 5 defenders, 5 midfielders, 3
            forwards, and no more than {MAX_PER_CLUB} from any one club.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/my-team/drafts"
            className="rounded-md bg-surface-2 px-4 py-2 text-sm text-fg-muted transition-colors
                       hover:text-fg"
          >
            Drafts{draftCount > 0 ? ` (${draftCount})` : ''}
          </Link>
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
        </div>
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

      {/* ---------------- suggested next picks / upgrade ideas ---------------- */}
      {needs.length > 0 ? (
        <section className="mb-10">
          <SectionHeader
            title="Suggested next picks"
            hint={`you still need ${needs.map((n) => `${n.count} ${POSITION_NAME[n.position]}`).join(', ')}`}
            right={<CollapseToggle open={suggestionsOpen} onClick={() => setSuggestionsOpen((v) => !v)} />}
          />
          {suggestionsOpen && (
            <>
              <div className="mb-3">
                <InfoNote title="Based on">
                  Your squad&apos;s gaps and what you can actually afford. Spending power per
                  position accounts for the slots you still have to fill — with{' '}
                  {SQUAD_SIZE - team.players.length} spaces left, the maximum for one player is
                  less than your bank balance. Ranked by projected points, then filtered to what
                  fits.
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
            </>
          )}
        </section>
      ) : (
        <section className="mb-10">
          <SectionHeader
            title="Upgrade ideas"
            hint="squad complete — swaps that would score more"
            right={<CollapseToggle open={suggestionsOpen} onClick={() => setSuggestionsOpen((v) => !v)} />}
          />
          {suggestionsOpen && (
            <>
              <div className="mb-3">
                <InfoNote title="Based on">
                  Your squad is full, so there is no spare slot to add into — the only way to
                  improve a position is to sell its weakest player and buy a better one. Each
                  idea sells your lowest-projected player in that position and checks whether a
                  specific replacement is both legal (club limit, quota) and affordable with the
                  cash that sale would free up.
                </InfoNote>
              </div>

              {upgrades.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-dim">
                  No swap clears the bar right now — your weakest player in every position still
                  projects higher than anything you could afford by selling them. Prices and
                  projections move through the week, so check back after the next update.
                </p>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {upgrades.map((idea) => {
                    const outInsight = insightsMap.get(idea.out.id);
                    return (
                      <li key={idea.position} className="rounded-xl border border-border bg-surface p-4">
                        <div className="mb-3">
                          <span className={`font-mono text-xs font-semibold uppercase ${POSITION_COLOUR[idea.position]}`}>
                            {POSITION_NAME[idea.position]}
                          </span>
                          <div className="mt-1 text-xs text-fg-dim">
                            replacing <span className="text-fg-muted">{idea.out.web_name}</span> ·{' '}
                            {idea.out.xpts} xPts
                          </div>
                        </div>

                        {outInsight && (
                          <div className="mb-3 rounded-lg bg-surface-2/60 px-3 py-2 opacity-70">
                            <PlayerIdentity insight={outInsight} />
                            <PlayerMetrics insight={outInsight} />
                          </div>
                        )}

                        <ul className="space-y-2">
                          {idea.candidates.map((c) => (
                            <li key={c.id} className="rounded-lg border border-border bg-base p-3">
                              <PlayerLine
                                insight={c}
                                maxTags={2}
                                actions={
                                  <button
                                    type="button"
                                    onClick={() => run(() => swapPlayer(idea.out.id, c.id))}
                                    disabled={pending}
                                    title={`Sell ${idea.out.web_name}, buy ${c.web_name}`}
                                    className="border border-accent/50 px-2.5 py-1 text-xs font-medium
                                               text-accent transition-colors hover:bg-accent/10
                                               disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Swap in (+{Math.round((c.xpts - idea.out.xpts) * 10) / 10})
                                  </button>
                                }
                              />
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {error && <InlineError message={error} className="mb-4" />}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ---------------- current squad ---------------- */}
        <section>
          <SectionHeader title="Your squad" hint="C and V set captain and vice" />
          <TipPill>
            <span className="sm:hidden">
              Use the ⇄ badge on a card to swap it, or tap an empty slot to fill it.
            </span>
            <span className="hidden sm:inline">
              You can also drag a player straight onto any slot to fill or swap it — works
              even when the squad is full.
            </span>
          </TipPill>
          <EditablePitch
            team={team}
            editable
            pending={pending}
            activeSwap={activeSwap}
            draggingPosition={draggingPosition}
            onStartSwap={(position, outId) => setActiveSwap({ position, outId })}
            onCancelSwap={() => setActiveSwap(null)}
            onRemove={(id) => run(() => removePlayer(id))}
            onDropCandidate={dropCandidate}
            onSetCaptain={(id) => run(() => setArmband(id, 'captain'))}
            onSetVice={(id) => run(() => setArmband(id, 'vice'))}
          />
        </section>

        {/* ---------------- add / swap players ---------------- */}
        <section>
          <SectionHeader title="Add players" />
          <CandidatePicker
            players={players}
            teams={teams}
            team={pickerTeam}
            ownedIds={owned}
            insights={insights}
            activeSwap={activeSwap ? { ...activeSwap, outName } : null}
            onCancelSwap={() => setActiveSwap(null)}
            onPick={activeSwap ? pickCandidate : (id) => run(() => addPlayer(id))}
            onDragStart={setDraggingPosition}
            onDragEnd={() => setDraggingPosition(null)}
            pending={pending}
          />
        </section>
      </div>
    </div>
  );
}
