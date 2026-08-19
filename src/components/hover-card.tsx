'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hover explanation that can never be clipped or run off screen.
 *
 * An earlier version was pure CSS, positioned absolutely next to its trigger.
 * That breaks the moment a tooltip appears inside a scrolling panel: an
 * `overflow: auto` ancestor clips it, and no amount of positioning rescues it.
 * Tooltips near a window edge were cut off the same way.
 *
 * So the card is rendered through a portal into <body> and positioned `fixed`.
 * That escapes every overflow container and any transformed ancestor, and lets
 * us measure the card and clamp it inside the viewport before it is painted:
 * it opens below the trigger, flips above when there is no room, and is pulled
 * back from either edge rather than being allowed to overflow.
 */

/** Keep this far from the viewport edge. */
const MARGIN = 8;
/** Gap between the trigger and the card. */
const GAP = 8;

export function HoverCard({
  children,
  content,
  wide = false,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  wide?: boolean;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Null until the card has been measured at least once. Nothing needs
  // resetting on close: the card unmounts, and the layout effect re-places it
  // before the next paint, so a stale position can never be seen.
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!trigger || !card) return;

    const t = trigger.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    // clientWidth excludes the scrollbar, which innerWidth does not.
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    // Centre under the trigger, then pull back inside both edges.
    let left = t.left + t.width / 2 - c.width / 2;
    left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, vw - c.width - MARGIN));

    // Prefer below. Flip above when it would overflow the bottom, and if it
    // fits in neither direction, sit against the bottom edge.
    let top = t.bottom + GAP;
    if (top + c.height > vh - MARGIN) {
      const above = t.top - GAP - c.height;
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - c.height - MARGIN);
    }

    // Bail out when nothing moved, so scroll and resize handlers do not
    // re-render on every frame.
    setCoords((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, []);

  // Runs before paint, so the card is never painted at the wrong position.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => place();
    // Capture phase catches scrolling inside panels, not just the window.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, place]);

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        className="relative inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>

      {/*
        `open` only becomes true from a pointer or focus event, so this never
        evaluates during server rendering and needs no mounted flag.
      */}
      {open &&
        createPortal(
          <div
            ref={cardRef}
            role="tooltip"
            style={{
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              width: wide ? 320 : 240,
              visibility: coords ? 'visible' : 'hidden',
            }}
            className="pointer-events-none fixed z-[200] rounded-lg border border-border-bright bg-popover
                       px-3 py-2.5 text-left text-xs font-normal normal-case leading-relaxed
                       tracking-normal text-fg-muted shadow-xl"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
