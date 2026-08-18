# UI Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle all main pages to be calmer and less monotonous, refine the dark-purple theme, and make the vice-captain "V" badge white like the captain "C" badge.

**Architecture:** Token-first restyle: calm the design tokens in `globals.css`, restyle the shared primitives in `ui.tsx`, merge the two duplicated player cards into one `PlayerCard` component, then per-page presentation passes. No functional changes.

**Tech Stack:** Next.js, Tailwind CSS v4 (tokens in `@theme` block in `src/app/globals.css`), TypeScript, React.

**Spec:** `docs/superpowers/specs/2026-08-18-ui-restyle-design.md`

## Global Constraints

- No functional changes: no data-fetching, props-contract, or route behavior changes (the card merge must preserve both current behaviors).
- Information architecture unchanged — presentation and arrangement only.
- Tailwind CSS v4; theme tokens live in the `@theme {}` block in `src/app/globals.css`. There is no `tailwind.config`.
- This is a pure styling change; there is no UI test suite. The test cycle per task is: `npm run build` must pass (typecheck + lint + compile), plus the visual check in the final task.
- Commit after every task.

---

### Task 1: Calm the global tokens (`globals.css`)

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: nothing.
- Produces: redefined `--color-border`, `--color-border-bright`, `--color-divider` tokens used by every later task.

- [ ] **Step 1: Replace border/divider tokens with low-alpha tints**

In `src/app/globals.css`, replace lines 23–27:

```css
  /* borders — light blue, and thick enough to read as a frame */
  --color-border: #7fc4ec;
  --color-border-bright: #b6e2ff;
  /* Internal hairlines. A full-strength blue on every table row would be a cage. */
  --color-divider: rgba(127, 196, 236, 0.22);
```

with:

```css
  /* borders — quiet white tints; structure comes from surface contrast, not outlines */
  --color-border: rgba(246, 243, 255, 0.10);
  --color-border-bright: rgba(246, 243, 255, 0.24);
  /* Internal hairlines, quieter still. */
  --color-divider: rgba(246, 243, 255, 0.07);
```

- [ ] **Step 2: Tame the animated background**

Replace the `background:` block of `body::before` (lines 83–88):

```css
  background:
    radial-gradient(42% 38% at 18% 22%, rgba(147, 92, 246, 0.5), transparent 70%),
    radial-gradient(38% 34% at 80% 16%, rgba(86, 66, 205, 0.48), transparent 70%),
    radial-gradient(46% 42% at 64% 74%, rgba(178, 96, 240, 0.36), transparent 72%),
    radial-gradient(44% 40% at 10% 76%, rgba(96, 62, 190, 0.42), transparent 70%),
    radial-gradient(52% 46% at 46% 46%, rgba(64, 38, 116, 0.55), transparent 74%);
```

with:

```css
  background:
    radial-gradient(42% 38% at 18% 22%, rgba(147, 92, 246, 0.38), transparent 70%),
    radial-gradient(38% 34% at 80% 16%, rgba(86, 66, 205, 0.36), transparent 70%),
    radial-gradient(46% 42% at 64% 74%, rgba(178, 96, 240, 0.27), transparent 72%),
    radial-gradient(44% 40% at 10% 76%, rgba(96, 62, 190, 0.32), transparent 70%),
    radial-gradient(52% 46% at 46% 46%, rgba(64, 38, 116, 0.42), transparent 74%);
```

And in `body::after` (line 112), change `opacity: 0.22;` to `opacity: 0.16;`.

- [ ] **Step 3: Update the header comment**

Replace the file-top comment (lines 3–11):

```css
/*
 * Purple cloud aesthetic.
 *
 * A drifting purple field sits behind everything, and the content rides on top
 * in near-opaque panels edged in light blue. The panels stay mostly solid on
 * purpose: this app is full of dense tables, and text over a moving gradient is
 * unreadable. The background shows through the gaps between panels, not behind
 * the numbers.
 */
```

with:

```css
/*
 * Purple cloud aesthetic.
 *
 * A drifting purple field sits behind everything, and the content rides on top
 * in near-opaque panels edged in faint white tints. The panels stay mostly solid
 * on purpose: this app is full of dense tables, and text over a moving gradient
 * is unreadable. The background shows through the gaps between panels, not
 * behind the numbers.
 */
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: build compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "style: calm global tokens — alpha borders, tamer cloud background"
```

---

### Task 2: Restyle shared primitives (`ui.tsx`)

**Files:**
- Modify: `src/components/ui.tsx`

**Interfaces:**
- Consumes: the Task 1 tokens.
- Produces: restyled `Panel`, `SectionHeader`, `KeyLegend`, `ReasonTag`, `InfoNote`, `Stat`, `StatStrip` used on every page.

- [ ] **Step 1: Panel — rounded, thin border**

In `Panel` (line 21), replace:

```tsx
    <div className={`border-2 border-border bg-surface ${padded ? 'p-5' : ''} ${className}`}>
```

with:

```tsx
    <div className={`rounded-xl border border-border bg-surface ${padded ? 'p-5' : ''} ${className}`}>
```

- [ ] **Step 2: SectionHeader — accent tick, pill action**

Replace the `heading` constant (lines 44–52):

```tsx
  const heading = (
    <h2
      className={`font-mono text-xs uppercase tracking-[0.16em] text-fg-muted ${
        info ? 'cursor-help border-b border-dotted border-fg-dim/60' : ''
      }`}
    >
      {title}
    </h2>
  );
```

with:

```tsx
  const heading = (
    <h2
      className={`flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-fg-muted ${
        info ? 'cursor-help border-b border-dotted border-fg-dim/60' : ''
      }`}
    >
      <span className="h-3 w-0.5 rounded-full bg-accent/70" aria-hidden />
      {title}
    </h2>
  );
```

And the action link (lines 67–73), replace:

```tsx
        <Link
          href={action.href}
          className="border-2 border-border px-3 py-1 text-xs text-fg-muted transition-colors
                     hover:border-border-bright hover:text-fg"
        >
```

with:

```tsx
        <Link
          href={action.href}
          className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted transition-colors
                     hover:border-border-bright hover:text-fg"
        >
```

- [ ] **Step 3: KeyLegend — pill**

In `KeyLegend` (line 120), replace:

```tsx
      className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 border-2 border-border
                  px-3 py-1.5 text-[11px] text-fg-muted ${className}`}
```

with:

```tsx
      className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-border
                  px-3 py-1.5 text-[11px] text-fg-muted ${className}`}
```

- [ ] **Step 4: ReasonTag — pill**

In `ReasonTag` (line 104), replace:

```tsx
      <span className={`cursor-help border px-1.5 py-0.5 text-[10px] font-medium ${TONE_CLASS[tone]}`}>
```

with:

```tsx
      <span className={`cursor-help rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE_CLASS[tone]}`}>
```

- [ ] **Step 5: InfoNote — soft edge**

In `InfoNote` (line 137), replace:

```tsx
    <div className="border-l-2 border-border-bright bg-surface/60 px-4 py-3">
```

with:

```tsx
    <div className="rounded-r-lg border-l-2 border-border-bright bg-surface/60 px-4 py-3">
```

- [ ] **Step 6: StatStrip + Stat — rounded strip, hero numerals**

In `StatStrip` (line 175), replace:

```tsx
    <div className="grid gap-px border-2 border-border bg-divider sm:grid-cols-2 lg:grid-cols-4">
```

with:

```tsx
    <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-divider sm:grid-cols-2 lg:grid-cols-4">
```

In `Stat` (line 167), replace:

```tsx
      <div className={`tnum mt-2 text-2xl font-medium ${colour}`}>{value}</div>
```

with:

```tsx
      <div className={`tnum mt-2 text-3xl font-medium ${colour}`}>{value}</div>
```

- [ ] **Step 7: Verify build passes**

Run: `npm run build`
Expected: build compiles successfully.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui.tsx
git commit -m "style: rounded quiet panels, pill tags/legend, accent-tick headers, hero stats"
```

---

### Task 3: Unified `PlayerCard` + pitch backdrop

**Files:**
- Create: `src/components/player-card.tsx`
- Modify: `src/components/pitch-view.tsx` (full rewrite)
- Modify: `src/components/team-pitch.tsx` (full rewrite)

**Interfaces:**
- Consumes: `POSITION_NAME`/`Position` from `@/lib/fpl/types`; `BuiltSquad` from `@/lib/ai/squad-builder`; `money`, `MyTeam` from `@/lib/team/my-team`.
- Produces: `PlayerCard({ name, team, position, price, metric?, flag?, flagTitle?, isCaptain?, isVice?, muted? })` — the single card used by both pitches. `PitchView` and `TeamPitch` keep their existing exported names and props, so no call-site changes.

- [ ] **Step 1: Create the shared card**

Create `src/components/player-card.tsx`:

```tsx
import { POSITION_NAME, type Position } from '@/lib/fpl/types';

const POSITION_COLOUR: Record<Position, string> = {
  1: 'text-pos-gk',
  2: 'text-pos-def',
  3: 'text-pos-mid',
  4: 'text-pos-fwd',
};

const POSITION_BAR: Record<Position, string> = {
  1: 'bg-pos-gk',
  2: 'bg-pos-def',
  3: 'bg-pos-mid',
  4: 'bg-pos-fwd',
};

/**
 * The one player card. Used by the squad-builder pitch and the dashboard pitch
 * so the two can never drift apart again. The captain and vice badges share the
 * same white fill — only the letter differs.
 */
export function PlayerCard({
  name,
  team,
  position,
  price,
  metric,
  flag,
  flagTitle,
  isCaptain,
  isVice,
  muted,
}: {
  name: string;
  team: string;
  position: Position;
  price: string;
  metric?: React.ReactNode;
  flag?: string | null;
  flagTitle?: string;
  isCaptain?: boolean;
  isVice?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`relative w-[96px] rounded-lg border bg-surface-2 px-2 pb-2 pt-2 text-center sm:w-[108px]
                  ${isCaptain ? 'border-accent' : 'border-border'}
                  ${muted ? 'opacity-60' : ''}`}
    >
      {(isCaptain || isVice) && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center
                     rounded-full bg-accent text-[10px] font-bold text-base shadow-md"
          title={isCaptain ? 'Captain' : 'Vice-captain'}
        >
          {isCaptain ? 'C' : 'V'}
        </span>
      )}

      {/* position tick — the one splash of colour on the card */}
      <div className={`mx-auto h-0.5 w-6 rounded-full ${POSITION_BAR[position]}`} />
      <div
        className={`mt-1 font-mono text-[9px] font-semibold uppercase tracking-wider ${POSITION_COLOUR[position]}`}
      >
        {POSITION_NAME[position]}
      </div>

      <div className="mt-1 truncate text-[13px] font-semibold" title={name}>
        {name}
      </div>

      <div className="tnum mt-1 flex items-center justify-center gap-1.5 text-[10px]">
        <span className="text-fg-dim">{team}</span>
        <span className="text-fg-dim">·</span>
        <span className="text-fg-muted">{price}</span>
        {metric}
      </div>

      {flag && (
        <div
          className="mt-1.5 rounded-md bg-danger/15 py-0.5 text-[9px] font-semibold text-danger"
          title={flagTitle}
        >
          {flag}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `pitch-view.tsx` on the shared card, with pitch backdrop**

Replace the entire contents of `src/components/pitch-view.tsx` with:

```tsx
import type { Position } from '@/lib/fpl/types';
import type { BuiltSquad } from '@/lib/ai/squad-builder';
import { PlayerCard } from '@/components/player-card';

/** Availability flags worth surfacing on the card. */
const STATUS_LABEL: Record<string, string> = {
  d: 'Doubt',
  i: 'Injured',
  s: 'Susp',
  u: 'Unavail',
  n: 'Not in squad',
};

type SquadPlayer = BuiltSquad['players'][number];

export function PitchView({
  squad,
  teamName,
}: {
  squad: BuiltSquad;
  teamName: Map<number, string>;
}) {
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const xi = squad.squad.startingXI.map((id) => byId.get(id)!).filter(Boolean);
  const bench = squad.squad.bench.map((id) => byId.get(id)!).filter(Boolean);

  const rows: SquadPlayer[][] = ([1, 2, 3, 4] as Position[]).map((pos) =>
    xi.filter((p) => p.position === pos).sort((a, b) => b.xpts - a.xpts),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* Faint row bands and a centre-line motif between DEF and MID make the
          rows read as a pitch formation instead of a bare card grid. */}
      <div className="space-y-2 px-3 py-5 sm:px-6">
        {rows.map((row, i) => (
          <div key={i}>
            {i === 2 && <div className="mx-auto mb-2 h-px w-2/3 bg-fg/10" />}
            <div
              className={`flex flex-wrap justify-center gap-2 rounded-lg py-2 sm:gap-3 ${
                i % 2 === 0 ? 'bg-fg/[0.03]' : ''
              }`}
            >
              {row.map((p) => (
                <PlayerCard
                  key={p.id}
                  name={p.web_name}
                  team={teamName.get(p.team_id) ?? ''}
                  position={p.position as Position}
                  price={`£${(p.cost / 10).toFixed(1)}`}
                  metric={<span className="text-accent">{p.xpts.toFixed(1)}</span>}
                  flag={p.status && p.status !== 'a' ? STATUS_LABEL[p.status] : null}
                  isCaptain={p.id === squad.captainId}
                  isVice={p.id === squad.viceCaptainId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-divider bg-base/60 px-3 py-4 sm:px-6">
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-fg-dim">
          Bench · in autosub order
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
          {bench.map((p) => (
            <PlayerCard
              key={p.id}
              name={p.web_name}
              team={teamName.get(p.team_id) ?? ''}
              position={p.position as Position}
              price={`£${(p.cost / 10).toFixed(1)}`}
              metric={<span className="text-accent">{p.xpts.toFixed(1)}</span>}
              flag={p.status && p.status !== 'a' ? STATUS_LABEL[p.status] : null}
              muted
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `team-pitch.tsx` on the shared card**

Replace the entire contents of `src/components/team-pitch.tsx` with:

```tsx
import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { money, type MyTeam } from '@/lib/team/my-team';
import { PlayerCard } from '@/components/player-card';

const STATUS_LABEL: Record<string, string> = {
  d: 'Doubt',
  i: 'Injured',
  s: 'Susp',
  u: 'Unavail',
  n: 'Out',
};

/** Read-only pitch for the dashboard. Editing lives on /my-team. */
export function TeamPitch({ team, className = '' }: { team: MyTeam; className?: string }) {
  const rows = ([1, 2, 3, 4] as Position[]).map((pos) => ({
    pos,
    players: team.players
      .filter((p) => p.position === pos)
      .sort((a, b) => b.now_cost - a.now_cost),
  }));

  return (
    <div
      className={`space-y-2 rounded-xl border border-border bg-surface px-3 py-5 sm:px-6 ${className}`}
    >
      {rows.map(({ pos, players }, i) => (
        <div key={pos}>
          {i === 2 && <div className="mx-auto mb-2 h-px w-2/3 bg-fg/10" />}
          <div
            className={`flex flex-wrap items-center justify-center gap-2 rounded-lg py-2 sm:gap-3 ${
              i % 2 === 0 ? 'bg-fg/[0.03]' : ''
            }`}
          >
            {players.length === 0 ? (
              <span className="text-xs text-fg-dim">No {POSITION_NAME[pos]} yet</span>
            ) : (
              players.map((p) => {
                const drift = p.now_cost - p.purchase_price;
                return (
                  <PlayerCard
                    key={p.id}
                    name={p.web_name}
                    team={p.team_short}
                    position={p.position}
                    price={money(p.now_cost)}
                    metric={
                      drift !== 0 ? (
                        <span
                          className={drift > 0 ? 'text-accent' : 'text-danger'}
                          title={`Bought at ${money(p.purchase_price)}`}
                        >
                          {drift > 0 ? '▲' : '▼'}
                          {(Math.abs(drift) / 10).toFixed(1)}
                        </span>
                      ) : undefined
                    }
                    flag={p.status && p.status !== 'a' ? STATUS_LABEL[p.status] : null}
                    flagTitle={p.news ?? undefined}
                    isCaptain={p.is_captain}
                    isVice={p.is_vice_captain}
                  />
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: build compiles successfully (call sites in `src/app/page.tsx` and `src/app/squad-builder/builder.tsx` need no changes).

- [ ] **Step 5: Commit**

```bash
git add src/components/player-card.tsx src/components/pitch-view.tsx src/components/team-pitch.tsx
git commit -m "style: unified PlayerCard with white V badge, pitch-style row bands"
```

---

### Task 4: Dashboard page polish (`page.tsx`)

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: restyled `StatStrip`/`Stat`/`SectionHeader` from Task 2 and restyled `TeamPitch` from Task 3 (the hero stat band and two-column rhythm come from those; this task only rounds the page-local boxes).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Incomplete-squad alert — rounded**

Replace (lines 82–83):

```tsx
        <p className="mb-5 border border-amber/40 bg-amber/10 px-4 py-2.5 text-sm text-amber">
```

with:

```tsx
        <p className="mb-5 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2.5 text-sm text-amber">
```

- [ ] **Step 2: Empty-pitch placeholder — rounded, thinner border**

Replace (line 105):

```tsx
            <div className="flex items-center justify-center border-2 border-dashed border-border py-16 text-sm text-fg-dim">
```

with:

```tsx
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-16 text-sm text-fg-dim">
```

- [ ] **Step 3: Injury news list — rounded, thinner border**

Replace (line 152):

```tsx
          <ul className="divide-y divide-divider border-2 border-border">
```

with:

```tsx
          <ul className="divide-y divide-divider overflow-hidden rounded-xl border border-border">
```

- [ ] **Step 4: EmptyTeam panel and buttons — rounded**

In `EmptyTeam`, replace (line 172):

```tsx
    <div className="mb-8 border-2 border-dashed border-border px-8 py-12 text-center">
```

with:

```tsx
    <div className="mb-8 rounded-xl border border-dashed border-border px-8 py-12 text-center">
```

Replace the "Build my squad" link className (line 180):

```tsx
          className="border border-accent px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
```

with:

```tsx
          className="rounded-full border border-accent px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
```

Replace the "Use the AI builder" link className (line 186):

```tsx
          className="border-2 border-border px-5 py-2.5 text-sm text-fg-muted transition-colors hover:border-border-bright hover:text-fg"
```

with:

```tsx
          className="rounded-full border border-border px-5 py-2.5 text-sm text-fg-muted transition-colors hover:border-border-bright hover:text-fg"
```

- [ ] **Step 5: Countdown box — rounded**

In `Countdown` (line 233), replace:

```tsx
    <div className="border-2 border-border px-5 py-3 text-right">
```

with:

```tsx
    <div className="rounded-xl border border-border bg-surface px-5 py-3 text-right">
```

- [ ] **Step 6: Verify build passes**

Run: `npm run build`
Expected: build compiles successfully.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "style: rounded dashboard panels, pill CTAs, surfaced countdown"
```

---

### Task 5: Squad-builder page polish (`builder.tsx`)

**Files:**
- Modify: `src/app/squad-builder/builder.tsx`

**Interfaces:**
- Consumes: restyled `PitchView` from Task 3.
- Produces: nothing new for other tasks.

- [ ] **Step 1: Error alert — rounded**

In the results column (~line 315), replace:

```tsx
              className="rounded-none border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
```

with:

```tsx
              className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
```

- [ ] **Step 2: Empty-state placeholder — rounded, thinner border**

Replace (~line 323):

```tsx
            <div className="flex h-full min-h-80 items-center justify-center rounded-none border-2 border-dashed border-border p-8 text-center">
```

with:

```tsx
            <div className="flex h-full min-h-80 items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
```

- [ ] **Step 3: Result header panel — rounded, thinner border**

In `Result` (~line 380), replace:

```tsx
      <div className="rounded-none border-2 border-border bg-surface p-5">
```

with:

```tsx
      <div className="rounded-xl border border-border bg-surface p-5">
```

- [ ] **Step 4: Import button — rounded**

Replace (~line 393):

```tsx
              className="mt-3 rounded-none border border-accent px-3 py-1.5 text-xs font-medium
                         text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
```

with:

```tsx
              className="mt-3 rounded-full border border-accent px-3 py-1.5 text-xs font-medium
                         text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
```

- [ ] **Step 5: Key-risk and relaxation callouts — rounded**

Replace (~line 414):

```tsx
        <div className="mt-4 rounded-none border border-amber/30 bg-amber/5 px-3 py-2.5">
```

with:

```tsx
        <div className="mt-4 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2.5">
```

Replace (~line 422):

```tsx
          <p className="mt-3 rounded-none border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs text-cyan">
```

with:

```tsx
          <p className="mt-3 rounded-lg border border-cyan/30 bg-cyan/5 px-3 py-2 text-xs text-cyan">
```

- [ ] **Step 6: "Why these picks" panel — rounded, thinner border**

Replace (~line 435):

```tsx
      <div className="rounded-none border-2 border-border bg-surface">
```

with:

```tsx
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
```

- [ ] **Step 7: Verify build passes**

Run: `npm run build`
Expected: build compiles successfully.

- [ ] **Step 8: Commit**

```bash
git add src/app/squad-builder/builder.tsx
git commit -m "style: rounded squad-builder panels and callouts, pill import CTA"
```

---

### Task 6: Calm the players table (`players-table.tsx`)

**Files:**
- Modify: `src/app/players/players-table.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: nothing new for other tasks.

- [ ] **Step 1: Add a position-chip colour map**

Near the existing `POSITION_COLOUR` map (lines 128–133), add directly below it:

```tsx
const POSITION_CHIP: Record<Position, string> = {
  1: 'bg-pos-gk/15 text-pos-gk',
  2: 'bg-pos-def/15 text-pos-def',
  3: 'bg-pos-mid/15 text-pos-mid',
  4: 'bg-pos-fwd/15 text-pos-fwd',
};
```

- [ ] **Step 2: Table wrapper — rounded, thinner border**

Replace (line 290):

```tsx
      <div className="overflow-x-auto rounded-none border-2 border-border">
```

with:

```tsx
      <div className="overflow-x-auto rounded-xl border border-border">
```

- [ ] **Step 3: Subdued sticky header**

Replace (line 292):

```tsx
          <thead className="bg-surface-2">
```

with:

```tsx
          <thead className="sticky top-0 z-10 bg-surface-2">
```

- [ ] **Step 4: Row badges — rounded**

In the player-name cell, replace both `rounded-none` badge spans (~lines 320 and 328):

```tsx
                          className="rounded-none bg-violet/20 px-1 text-[9px] font-bold text-violet"
```

with:

```tsx
                          className="rounded bg-violet/20 px-1 text-[9px] font-bold text-violet"
```

and:

```tsx
                          className="rounded-none bg-danger/20 px-1 text-[9px] font-bold text-danger"
```

with:

```tsx
                          className="rounded bg-danger/20 px-1 text-[9px] font-bold text-danger"
```

- [ ] **Step 5: Position column becomes a chip**

Replace the Pos cell (~lines 341–345):

```tsx
                  <td
                    className={`px-2 py-2 font-mono text-xs ${POSITION_COLOUR[p.position as Position]}`}
                  >
                    {POSITION_NAME[p.position as Position]}
                  </td>
```

with:

```tsx
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${POSITION_CHIP[p.position as Position]}`}
                    >
                      {POSITION_NAME[p.position as Position]}
                    </span>
                  </td>
```

Note: `POSITION_COLOUR` may now be unused in this file — if the linter flags it, delete the `POSITION_COLOUR` map; if it is still used elsewhere in the file, leave it.

- [ ] **Step 6: Verify build passes**

Run: `npm run build`
Expected: build compiles successfully.

- [ ] **Step 7: Commit**

```bash
git add src/app/players/players-table.tsx
git commit -m "style: calmer players table — sticky subdued header, position chips"
```

---

### Task 7: Fixtures ticker breathing room (`ticker.tsx`)

**Files:**
- Modify: `src/app/fixtures/ticker.tsx`

**Interfaces:**
- Consumes: Task 1 tokens, `difficultyClass` from `@/components/ui` (unchanged signature).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Gameweek span select — rounded**

Replace (~line 127):

```tsx
            className="rounded-none border border-border/50 bg-surface px-2.5 py-1.5 text-sm text-fg
                       outline-none focus:border-accent focus:ring-1 focus:ring-accent"
```

with:

```tsx
            className="rounded-md border border-border/50 bg-surface px-2.5 py-1.5 text-sm text-fg
                       outline-none focus:border-accent focus:ring-1 focus:ring-accent"
```

- [ ] **Step 2: Legend swatches — rounded**

Replace (~line 149):

```tsx
            <span key={d} className={`h-4 w-6 ${difficultyClass(d)}`} />
```

with:

```tsx
            <span key={d} className={`h-4 w-6 rounded-sm ${difficultyClass(d)}`} />
```

- [ ] **Step 3: Table wrapper — rounded, thinner border**

Replace (~line 156):

```tsx
      <div className="overflow-x-auto rounded-none border-2 border-border">
```

with:

```tsx
      <div className="overflow-x-auto rounded-xl border border-border">
```

- [ ] **Step 4: Fixture cells — rounded with spacing**

Replace the blank-gameweek cell (~line 181):

```tsx
                          className="rounded-none border-2 border-dashed border-border py-1 text-center text-[10px] text-fg-dim"
```

with:

```tsx
                          className="rounded-md border border-dashed border-border py-1 text-center text-[10px] text-fg-dim"
```

Replace the fixture cell (~line 191):

```tsx
                              className={`py-1 text-center text-[11px] font-medium ${difficultyClass(c.difficulty)}`}
```

with:

```tsx
                              className={`rounded-md py-1.5 text-center text-[11px] font-medium ${difficultyClass(c.difficulty)}`}
```

And give the cell more air — replace (~line 178):

```tsx
                    <td key={gw} className="px-1 py-1.5">
```

with:

```tsx
                    <td key={gw} className="px-1.5 py-2">
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: build compiles successfully.

- [ ] **Step 6: Commit**

```bash
git add src/app/fixtures/ticker.tsx
git commit -m "style: fixtures grid breathing room — rounded cells, softer blanks"
```

---

### Task 8: My-team editor polish (`editor.tsx`)

**Files:**
- Modify: `src/app/my-team/editor.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: nothing new for other tasks.

- [ ] **Step 1: Armbands — rounded buttons, white active V**

In the `Armbands` component (lines 556–611), replace the C button className:

```tsx
        className={`h-5 w-5 text-[10px] font-bold transition-colors ${
          isCaptain ? 'bg-accent text-base' : 'border border-border/50 text-fg-dim hover:text-fg'
        }`}
```

with:

```tsx
        className={`h-5 w-5 rounded-md text-[10px] font-bold transition-colors ${
          isCaptain ? 'bg-accent text-base' : 'border border-border/50 text-fg-dim hover:text-fg'
        }`}
```

Replace the V button className:

```tsx
        className={`h-5 w-5 text-[10px] font-bold transition-colors ${
          isVice ? 'bg-fg-muted text-base' : 'border border-border/50 text-fg-dim hover:text-fg'
        }`}
```

with:

```tsx
        className={`h-5 w-5 rounded-md text-[10px] font-bold transition-colors ${
          isVice ? 'bg-accent text-base' : 'border border-border/50 text-fg-dim hover:text-fg'
        }`}
```

Replace the remove button className:

```tsx
        className="h-5 w-5 border border-border/50 text-xs text-fg-dim transition-colors
                   hover:border-danger hover:text-danger"
```

with:

```tsx
        className="h-5 w-5 rounded-md border border-border/50 text-xs text-fg-dim transition-colors
                   hover:border-danger hover:text-danger"
```

- [ ] **Step 2: Position group panels — rounded, thinner border**

Replace (~line 293):

```tsx
                <div key={pos} className="border-2 border-border bg-surface p-3">
```

with:

```tsx
                <div key={pos} className="rounded-xl border border-border bg-surface p-3">
```

- [ ] **Step 3: Row list — rounded**

Replace (~line 307):

```tsx
                    <ul className="divide-y divide-divider border border-divider">
```

with:

```tsx
                    <ul className="divide-y divide-divider overflow-hidden rounded-lg border border-divider">
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: build compiles successfully.

- [ ] **Step 5: Commit**

```bash
git add src/app/my-team/editor.tsx
git commit -m "style: rounded my-team rows and armbands, white active vice button"
```

---

### Task 9: Visual verification of every page

**Files:**
- No file changes (fix-forward only if a defect is found).

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified pages.

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` (background, port 3000).
Expected: server starts without errors.

- [ ] **Step 2: Screenshot every page**

Use the webapp-testing (Playwright) skill to load and screenshot each route: `/`, `/squad-builder`, `/my-team`, `/players`, `/fixtures`.

- [ ] **Step 3: Check against the spec**

For each screenshot verify:
- V badge renders with the same white fill as C (dashboard pitch / squad-builder pitch when a squad is built).
- No 2px solid blue borders remain; panels are rounded with faint borders.
- Pitch views show row bands and the centre-line motif.
- Players table: position chips, sticky subdued header; all ~30 columns still render.
- Fixtures: rounded FDR cells, legend swatches rounded.
- Nothing overflows or collides at desktop width; spot-check a narrow (~768px) viewport.

- [ ] **Step 4: Fix any visual defects found**

Make targeted fixes, re-run `npm run build`, re-screenshot the affected page.

- [ ] **Step 5: Final build + commit any fixes**

Run: `npm run build`
Expected: passes.

```bash
git add -A
git commit -m "style: visual pass fixes" || true
```

---

## Self-Review Notes

- **Spec coverage:** V badge white (Tasks 3, 8) · calmer borders/surfaces (1, 2, 4–8) · radius scale (2–8) · tamed background (1) · type hierarchy (2 Stat, 3 card) · unified card (3) · panel/divider calming (2, 4–8) · SectionHeader accent tick (2) · stat strip hero numerals (2) · pitch backdrop (3) · dashboard hero band + two-column rhythm (2 StatStrip + existing grid, 4) · players table calming (6) · fixtures breathing (7) · my-team quiet rows (8) · verification (9).
- **Legend placement on fixtures:** spec said "legend moves into the header row" — the legend already sits in the controls bar directly under the header with `ml-auto`; it stays there, restyled (Task 7 Step 2). No move needed.
- **TDD:** no UI test harness exists in this project; per Global Constraints the test cycle is `npm run build` per task plus Playwright visual verification in Task 9.
