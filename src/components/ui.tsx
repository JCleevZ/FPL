import Link from 'next/link';
import { GLOSSARY, REASONS, TONE_CLASS, type GlossaryKey, type ReasonKey } from '@/lib/glossary';
import { HoverCard } from '@/components/hover-card';

/**
 * Shared primitives. Everything on the site is built from these so panels,
 * headings, tags and hover explanations behave identically everywhere.
 */

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
    <div className={`border-2 border-border bg-surface ${padded ? 'p-5' : ''} ${className}`}>
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
}: {
  title: string;
  hint?: React.ReactNode;
  info?: React.ReactNode;
  action?: { href: string; label: string };
}) {
  const heading = (
    <h2
      className={`font-mono text-xs uppercase tracking-[0.16em] text-fg-muted ${
        info ? 'cursor-help border-b border-dotted border-fg-dim/60' : ''
      }`}
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
      {action && (
        <Link
          href={action.href}
          className="border-2 border-border px-3 py-1 text-xs text-fg-muted transition-colors
                     hover:border-border-bright hover:text-fg"
        >
          {action.label} →
        </Link>
      )}
    </div>
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
      <span className={`cursor-help border px-1.5 py-0.5 text-[10px] font-medium ${TONE_CLASS[tone]}`}>
        {label}
      </span>
    </HoverCard>
  );
}

/**
 * Compact key for the three figures that appear on every player row.
 *
 * Deliberately one line: each term already explains itself on hover wherever it
 * appears, so this is a reminder that the explanations exist, not a lesson.
 */
export function KeyLegend({ className = '' }: { className?: string }) {
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 border-2 border-border
                  px-3 py-1.5 text-[11px] text-fg-muted ${className}`}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim">Key</span>
      <Explain term="xpts" />
      <span className="text-fg-dim">·</span>
      <Explain term="fdr" />
      <span className="text-fg-dim">·</span>
      <Explain term="ownership">% owned</Explain>
      <span className="text-fg-dim">— hover any term</span>
    </div>
  );
}

/** A quiet explanatory note. For "here is how to read this" copy. */
export function InfoNote({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-border-bright bg-surface/60 px-4 py-3">
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
      <div className={`tnum mt-2 text-2xl font-medium ${colour}`}>{value}</div>
    </div>
  );
}

/** Hairline-separated strip of stats. */
export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-px border-2 border-border bg-divider sm:grid-cols-2 lg:grid-cols-4">
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
