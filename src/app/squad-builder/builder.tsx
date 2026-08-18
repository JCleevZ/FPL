'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { importSquad } from '@/lib/team/actions';
import { generateSquad, type BuilderState } from './actions';
import { PitchView } from '@/components/pitch-view';
import { PlayerPicker } from '@/components/player-picker';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';

export interface TeamOption {
  id: number;
  name: string;
  short_name: string;
}

export interface PlayerOption {
  id: number;
  web_name: string;
  position: number;
  now_cost: number;
  team_id: number;
  selected_by_percent: number | null;
}

const label = 'mb-1.5 block text-xs font-medium text-fg-muted';
const control =
  'w-full rounded-none border border-border/50 bg-surface px-3 py-2 text-sm text-fg outline-none ' +
  'transition-colors focus:border-accent focus:ring-1 focus:ring-accent';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-none border border-accent px-4 py-3 text-sm font-medium
                 text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
    >
      {pending ? 'Building squad…' : 'Build my squad'}
    </button>
  );
}

/** Collapsible group, so the full filter set is available without overwhelming. */
function Section({
  title,
  hint,
  children,
  open = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="group rounded-none border-2 border-border bg-surface/60">
      <summary
        className="flex cursor-pointer items-center justify-between px-4 py-3
                   text-sm font-medium text-fg marker:content-none"
      >
        <span>
          {title}
          {hint && <span className="ml-2 text-xs font-normal text-fg-dim">{hint}</span>}
        </span>
        <span className="text-fg-dim transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="space-y-4 border-t border-divider px-4 py-4">{children}</div>
    </details>
  );
}

export function SquadBuilder({
  teams,
  players,
  defaultFavouriteTeamId,
}: {
  teams: TeamOption[];
  players: PlayerOption[];
  defaultFavouriteTeamId?: number;
}) {
  const [state, formAction] = useActionState<BuilderState, FormData>(generateSquad, {});
  const [risk, setRisk] = useState(0.5);
  const teamName = new Map(teams.map((t) => [t.id, t.short_name]));

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10 md:px-8 md:py-14">
      <header className="mb-8">
        <h1 className="text-3xl font-medium">AI Squad Builder</h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Every filter is optional. Set one, set twenty, or set none — anything you leave
          blank simply isn&apos;t considered. Squads are checked against every FPL rule
          before you see them.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        {/* ---------------- filters ---------------- */}
        <form action={formAction} className="space-y-3">
          <Section title="Budget & horizon" open>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="budget">
                  Budget (£m)
                </label>
                <input
                  id="budget"
                  name="budget"
                  type="number"
                  step="0.1"
                  min="70"
                  max="120"
                  defaultValue="100.0"
                  className={control}
                />
              </div>
              <div>
                <label className={label} htmlFor="horizon">
                  Planning for
                </label>
                <select id="horizon" name="horizon" defaultValue="short" className={control}>
                  <option value="next">Next gameweek</option>
                  <option value="short">Next 6 gameweeks</option>
                  <option value="medium">Next 12 gameweeks</option>
                  <option value="season">Rest of season</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="Build around" hint="who's the core?" open>
            <PlayerPicker
              name="mustIncludeIds"
              players={players}
              teamName={teamName}
              placeholder="Search a player to lock in…"
              accent="accent"
            />
            <div>
              <span className={label}>Never pick these</span>
              <PlayerPicker
                name="mustExcludeIds"
                players={players}
                teamName={teamName}
                placeholder="Search a player to ban…"
                accent="danger"
              />
            </div>
          </Section>

          <Section title="Club loyalty">
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <div>
                <label className={label} htmlFor="favouriteTeamId">
                  Team you support
                </label>
                <select
                  id="favouriteTeamId"
                  name="favouriteTeamId"
                  defaultValue={defaultFavouriteTeamId ?? ''}
                  className={control}
                >
                  <option value="">No preference</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="favouriteTeamCount">
                  How many
                </label>
                <select id="favouriteTeamCount" name="favouriteTeamCount" defaultValue="1" className={control}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
            </div>
            <div>
              <label className={label} htmlFor="rivalTeamId">
                Rivals you refuse to own
              </label>
              <select id="rivalTeamId" name="rivalTeamId" defaultValue="" className={control}>
                <option value="">None</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          <Section title="Risk">
            <div>
              <label className={label} htmlFor="riskAppetite">
                Template-safe ←→ maverick
                <span className="ml-2 font-mono text-accent">{risk.toFixed(2)}</span>
              </label>
              <input
                id="riskAppetite"
                name="riskAppetite"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={risk}
                onChange={(e) => setRisk(Number(e.target.value))}
                className="w-full accent-[var(--color-accent)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="maxOwnership">
                  Max ownership %
                </label>
                <input
                  id="maxOwnership"
                  name="maxOwnership"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="any"
                  className={control}
                />
              </div>
              <div>
                <label className={label} htmlFor="injuryTolerance">
                  Injury tolerance
                </label>
                <select id="injuryTolerance" name="injuryTolerance" defaultValue="moderate" className={control}>
                  <option value="strict">Fully fit only</option>
                  <option value="moderate">Allow slight doubts</option>
                  <option value="relaxed">Gamble on doubts</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="Shape & style">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="emphasis">
                  Emphasis
                </label>
                <select id="emphasis" name="emphasis" defaultValue="balanced" className={control}>
                  <option value="attack">Attack-heavy</option>
                  <option value="balanced">Balanced</option>
                  <option value="defence">Defence-heavy</option>
                </select>
              </div>
              <div>
                <label className={label} htmlFor="maxPerClub">
                  Max per club
                </label>
                <select id="maxPerClub" name="maxPerClub" defaultValue="3" className={control}>
                  <option value="3">3 (FPL limit)</option>
                  <option value="2">2</option>
                  <option value="1">1</option>
                </select>
              </div>
              <div>
                <label className={label} htmlFor="benchPolicy">
                  Bench
                </label>
                <select id="benchPolicy" name="benchPolicy" defaultValue="balanced" className={control}>
                  <option value="fodder">Cheap fodder</option>
                  <option value="balanced">Balanced</option>
                  <option value="strong">Strong (Bench Boost)</option>
                </select>
              </div>
              <div>
                <label className={label} htmlFor="premiumStrategy">
                  Premiums
                </label>
                <select id="premiumStrategy" name="premiumStrategy" defaultValue="balanced" className={control}>
                  <option value="none">No premiums</option>
                  <option value="one">One premium</option>
                  <option value="two">Two premiums</option>
                  <option value="balanced">Whatever works</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Toggle name="fixtureBias" text="Favour kind upcoming fixtures" />
              <Toggle name="setPieceTakersOnly" text="Set-piece takers only" />
              <Toggle name="priceRiseHunter" text="Favour likely price risers" />
            </div>
          </Section>

          <Section title="Anything else" hint="in your own words">
            <textarea
              name="vibes"
              rows={3}
              placeholder="e.g. make it chaotic, I hate owning goalkeepers from newly promoted teams"
              className={control}
            />
          </Section>

          <div className="pt-1">
            <Submit />
          </div>
        </form>

        {/* ---------------- result ---------------- */}
        <div>
          {state.error && (
            <div
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {state.error}
            </div>
          )}

          {!state.squad && !state.error && (
            <div className="flex h-full min-h-80 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
              <p className="max-w-sm text-sm text-fg-muted">
                Set as few or as many filters as you like, then build. Try just{' '}
                <span className="text-fg">Build around: Haaland</span> and nothing else.
              </p>
            </div>
          )}

          {state.squad && <Result squad={state.squad} teamName={teamName} />}
        </div>
      </div>
    </div>
  );
}

function Toggle({ name, text }: { name: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg-muted">
      <input
        type="checkbox"
        name={name}
        className="h-4 w-4 rounded-none border-border bg-surface accent-[var(--color-accent)]"
      />
      {text}
    </label>
  );
}

function Result({
  squad,
  teamName,
}: {
  squad: NonNullable<BuilderState['squad']>;
  teamName: Map<number, string>;
}) {
  const [from, to] = squad.horizonGameweeks;
  const [importing, startImport] = useTransition();
  const [importError, setImportError] = useState<string | null>(null);
  const router = useRouter();

  // Replaces whatever is currently in My Team, then sends you to the dashboard
  // so you can see it straight away.
  const onImport = () => {
    setImportError(null);
    startImport(async () => {
      const result = await importSquad(
        squad.squad.playerIds,
        squad.captainId,
        squad.viceCaptainId,
      );
      if (result.error) setImportError(result.error);
      else router.push('/');
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{squad.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-fg-dim">
              GW{from}–{to} · {squad.provider === 'optimiser' ? 'optimiser only' : squad.model}
              {squad.cached && ' · cached'}
            </p>
            <button
              type="button"
              onClick={onImport}
              disabled={importing}
              className="mt-3 rounded-full border border-accent px-3 py-1.5 text-xs font-medium
                         text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Use this as my team'}
            </button>
            {importError && (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {importError}
              </p>
            )}
          </div>
          <div className="flex gap-5 text-right">
            <Metric label="Cost" value={`£${(squad.squad.cost / 10).toFixed(1)}m`} />
            <Metric label="Formation" value={squad.squad.formation} />
            <Metric label="Projected" value={`${squad.squad.xpts}`} accent />
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-fg">{squad.strategy}</p>

        <div className="mt-4 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber">
            Key risk
          </span>
          <p className="mt-1 text-sm text-fg-muted">{squad.keyRisk}</p>
        </div>

        {squad.relaxations.length > 0 && (
          <p className="mt-3 rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs text-cyan">
            To find a legal 15, {squad.relaxations.join('; ')}.
          </p>
        )}

        {squad.fallbackReason && (
          <p className="mt-3 text-xs text-fg-dim">
            AI commentary unavailable — showing the optimiser&apos;s best legal squad.
          </p>
        )}
      </div>

      <PitchView squad={squad} teamName={teamName} />

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <h3 className="border-b border-divider px-4 py-3 text-sm font-medium">Why these picks</h3>
        <ul className="divide-y divide-divider">
          {squad.players
            .filter((p) => p.note)
            .map((p) => (
              <li key={p.id} className="flex gap-3 px-4 py-3">
                <span className="w-11 shrink-0 font-mono text-xs text-fg-dim">
                  {POSITION_NAME[p.position as Position]}
                </span>
                <span className="w-32 shrink-0 text-sm font-medium">{p.web_name}</span>
                <span className="text-sm text-fg-muted">{p.note}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-fg-dim">{label}</div>
      <div className={`tnum text-lg font-semibold ${accent ? 'text-accent' : ''}`}>{value}</div>
    </div>
  );
}
