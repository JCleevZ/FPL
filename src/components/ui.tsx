import Link from 'next/link';
import { GLOSSARY, REASONS, TONE_CLASS, type GlossaryKey, type ReasonKey } from '@/lib/glossary';
import { HoverCard } from '@/components/hover-card';

/**
 * Shared primitives. Everything on the site is built from these so panels,
 * headings, tags and hover explanations behave identically everywhere.
 */

/**
 * Compact, contextual error banner. For errors triggered by an interaction in
 * a specific panel (a failed drag, a blocked swap) — placed right next to that
 * panel rather than at the top of the page, where a tall page above it would
 * put the message out of view of whatever the user was just doing.
 */
export function InlineError({ message, className = '' }: { message: string; className?: string }) {
  return (
    <p
      role="alert"
      className={`rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs text-danger ${className}`}
    >
      {message}
    </p>
  );
}

/** Small pill hint, for a secondary interaction worth mentioning once but not dwelling on. */
export function TipPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-fg/25 bg-fg/10 px-3 py-1 text-[11px] text-fg">
      <span aria-hidden>⇄</span>
      {children}
    </div>
  );
}

/** A bordered panel. The default surface for any grouped content. */
export function Panel({
  children,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface ${padded ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Small-caps mono heading with an optional hover explanation and action link.
 *
 * Fixed minimum height so two headers sitting side by side line up, whether or
 * not one of them carries a button.
 */
export function SectionHeader({
  title,
  hint,
  info,
  action,
  right,
}: {
  title: string;
  hint?: React.ReactNode;
  info?: React.ReactNode;
  action?: { href: string; label: string };
  /** Extra control on the right, e.g. a collapse toggle — for anything an `action` link can't express. */
  right?: React.ReactNode;
}) {
  // Chip-style label rather than a text underline or a coloured bar: it stands
  // out through a solid baby-blue fill, so it works identically whether or not
  // this header also carries a hover explanation or an action link. The fill is
  // fully saturated, so the label needs dark text rather than the usual light
  // text-on-dark-panel pairing — `text-base` is the app's own near-black, which
  // gives strong contrast against the light chip.
  const heading = (
    <h2
      className={`inline-flex items-center rounded-md bg-cyan px-2.5 py-1 font-mono text-xs
                  font-semibold uppercase tracking-[0.16em] text-base ${info ? 'cursor-help' : ''}`}
    >
      {title}
    </h2>
  );

  return (
    <div className="mb-3 flex min-h-[30px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex items-center gap-3">
        {info ? (
          <HoverCard content={info} wide>
            {heading}
          </HoverCard>
        ) : (
          heading
        )}
        {hint && <span className="text-xs text-fg-dim">{hint}</span>}
      </div>
      <div className="flex items-center gap-2">
        {action && (
          <Link
            href={action.href}
            className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted transition-colors
                       hover:border-border-bright hover:text-fg"
          >
            {action.label} →
          </Link>
        )}
        {right}
      </div>
    </div>
  );
}

/** Small chevron toggle for collapsing a section's body. Rotates to show state. */
export function CollapseToggle({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? 'Collapse' : 'Expand'}
      className="rounded-full border border-border-bright p-1.5 text-fg-dim transition-colors hover:text-fg"
    >
      <span className={`block text-[10px] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>
        ▶
      </span>
    </button>
  );
}

/** A term with a hover explanation. The dotted underline is the affordance. */
export function Explain({
  term,
  children,
  className = '',
}: {
  term: GlossaryKey;
  children?: React.ReactNode;
  className?: string;
}) {
  const { label, description } = GLOSSARY[term];
  return (
    <HoverCard content={description}>
      <span className={`cursor-help border-b border-dotted border-fg-dim/60 ${className}`}>
        {children ?? label}
      </span>
    </HoverCard>
  );
}

/** A recommendation tag, carrying its own explanation on hover. */
export function ReasonTag({ reason }: { reason: ReasonKey }) {
  const { label, tone, description } = REASONS[reason];
  return (
    <HoverCard content={description}>
      <span className={`cursor-help rounded-full border px-2 py-0.5 text-[10px] font-medium ${TONE_CLASS[tone]}`}>
        {label}
      </span>
    </HoverCard>
  );
}

/** A quiet explanatory note. For "here is how to read this" copy. */
export function InfoNote({ title, children }: { title?: string; children: React.ReactNode }) {
  // Distinguished by its own background rather than a side bar — consistent
  // with the rest of the palette, which builds structure from surface
  // contrast rather than outlines.
  return (
    <div className="rounded-lg bg-surface-2/70 px-4 py-3">
      {title && (
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim">
          {title}
        </div>
      )}
      <div className="text-xs leading-relaxed text-fg-muted">{children}</div>
    </div>
  );
}

/** One figure in a stat strip. */
export function Stat({
  label,
  value,
  term,
  tone,
}: {
  label: string;
  value: string;
  term?: GlossaryKey;
  tone?: 'accent' | 'danger';
}) {
  const colour =
    tone === 'accent' ? 'text-accent' : tone === 'danger' ? 'text-danger' : 'text-fg';
  return (
    <div className="bg-base px-5 py-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim">
        {term ? <Explain term={term}>{label}</Explain> : label}
      </div>
      <div className={`tnum mt-2 text-3xl font-medium ${colour}`}>{value}</div>
    </div>
  );
}

/** Hairline-separated strip of stats. */
export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-divider sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

/** Colour for an FPL difficulty rating, 1 (easy) to 5 (hard). */
export function difficultyClass(d: number): string {
  const rounded = Math.round(d);
  // Solid fills, not opacity modifiers: these sit on translucent panels, and
  // compositing made the real text contrast impossible to reason about.
  if (rounded <= 1) return 'bg-fdr-1 text-base';
  if (rounded === 2) return 'bg-fdr-2 text-base';
  if (rounded === 3) return 'bg-fdr-3 text-fg';
  if (rounded === 4) return 'bg-fdr-4 text-base';
  return 'bg-fdr-5 text-white';
}

/** Opponent label used in every fixture cell: "MCI (H)". */
export function FixtureLabel({ opponent, home }: { opponent: string; home: boolean }) {
  return (
    <>
      {opponent.toUpperCase()}
      <span className="ml-1 opacity-60">({home ? "H" : "A"})</span>
    </>
  );
}
