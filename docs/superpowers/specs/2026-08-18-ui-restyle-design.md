# UI Restyle: Calmer, More Expressive Design — Design Spec

Date: 2026-08-18
Status: Approved by user (all 4 sections)

## Goal

Restyle all main pages (dashboard `/`, `/squad-builder`, `/my-team`, `/players`, `/fixtures`) to:

1. Make the vice-captain "V" badge the same white style as the captain "C" badge.
2. Reduce visual busyness / overstimulation.
3. Break layout monotony — every page currently uses the same bordered-panel + divide-y-list pattern.

## Constraints

- Refine the existing dark-purple "night sky" identity — do not replace the theme.
- Bolder layout changes are allowed (user approved).
- No functional changes: no data-fetching, props-contract, or route behavior changes, except the player-card component merge which must preserve both current behaviors (read-only dashboard card vs squad-builder card).
- Information architecture (what data appears where) is unchanged — presentation and arrangement only.

## Approach (chosen: "Calm system, expressive surfaces")

System-wide token refinement plus per-page layout character.

### 1. Global foundation (`src/app/globals.css`)

- Shift borders from solid `--color-border #7fc4ec` at 2px to low-alpha white tints (`border` ≈ 10% alpha, `border-bright` ≈ 22% alpha); drop `border-2` to `border` on most panels. Structure comes from surface contrast, not outlines.
- Introduce a radius scale replacing blanket `rounded-none`: `rounded-lg` on cards/panels, `rounded-full` kept for badges/chips.
- Keep the animated purple-cloud background + grain overlay, but reduce opacity/contrast slightly so it reads as ambience.
- Type rhythm: player names in Inter (larger, dominant); meta (position, team, price) in JetBrains Mono, muted.
- V badge: same `bg-accent text-base` white fill as C, distinguished only by the letter.

### 2. Shared primitives & player card

- Extract one shared `PlayerCard` component used by both `src/components/pitch-view.tsx` and `src/components/team-pitch.tsx` (currently ~95% duplicated). Props cover the read-only vs interactive difference.
- Card hierarchy: slim colored position chip (existing `--color-pos-*` tokens) at top; player name dominant; team + price as one muted meta line. Captain card keeps white ring; C/V badges get a subtle shadow.
- Panels in `src/components/ui.tsx`: soft filled surfaces, faint border, more inner padding; quieter `divide-y` dividers with more row padding.
- `SectionHeader`: small accent tick/label treatment for section distinction.
- Stat strip: larger numerals, small uppercase muted labels.

### 3. Page-by-page layout

- **Squad-builder & dashboard pitch views:** player rows sit on a pitch-inspired backdrop — deep-toned panel with faint horizontal bands per position row (GK/DEF/MID/FWD) and a thin center-line motif. Bench stays a quieter strip below.
- **Dashboard (`/`):** hero stat band (bank, squad value, price changes as big numerals), then two-column rhythm: pitch dominant on one side, recommendations/fixtures stacked on the other.
- **Players (`/players`):** keep the dense table; calm it with sticky subdued header, hover row tint (no zebra), right-aligned tabular numerals, position column as colored chips. Column count/config untouched.
- **Fixtures:** FDR grid keeps difficulty colors; cells get radius and spacing; legend moves into the header row.
- **My-team:** quieter editor rows; C/V square buttons get radius; V active state goes white to match badge language.

### 4. Verification & risks

- `npm run build` (lint/typecheck) must pass after each phase.
- Visual spot-check of every page via dev server + Playwright screenshots before completion.
- Implementation order: tokens → shared primitives/card → pitch views → per-page passes, for easy isolation.
- Risk: alpha borders may wash out on the animated background — mitigated by keeping surface fills near-opaque.
- Risk: players-table density — changes stay conservative to avoid breaking its ~30 columns.

## Files expected to change

- `src/app/globals.css` — tokens, background, radius helpers
- `src/components/ui.tsx` — panel, SectionHeader, Stat/StatStrip styles
- `src/components/pitch-view.tsx`, `src/components/team-pitch.tsx` — use new shared PlayerCard, pitch backdrop
- New: shared player card component (e.g. `src/components/player-card.tsx`)
- `src/app/page.tsx` — dashboard hero band + two-column layout
- `src/app/players/players-table.tsx` — table calming
- `src/app/fixtures/ticker.tsx` (and page) — grid breathing, legend placement
- `src/app/my-team/editor.tsx` — row treatment, C/V button styling
- `src/app/squad-builder/builder.tsx` — layout polish around pitch view
