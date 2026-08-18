'use client';

import Link from 'next/link';
import type { CandidatePlayer } from '@/components/candidate-picker';
import type { Recommendation } from '@/lib/model/recommendations';
import { DraftCard } from './draft-card';

export interface DraftRow {
  id: string;
  name: string;
  formation: string;
  totalCost: number;
  budget: number;
  createdAt: string;
  xpts: number | null;
  captainId: number | null;
  viceCaptainId: number | null;
  players: {
    id: number;
    web_name: string;
    position: number;
    team_id: number;
    team_short: string;
    now_cost: number;
    status: string | null;
    news: string | null;
    is_captain: boolean;
    is_vice_captain: boolean;
  }[];
}

export function DraftsList({
  drafts,
  candidatePlayers,
  teams,
  insights,
}: {
  drafts: DraftRow[];
  candidatePlayers: CandidatePlayer[];
  teams: { id: number; short_name: string; name: string }[];
  insights: Record<number, Recommendation>;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-8 md:py-12">
      <header className="mb-6">
        <Link href="/my-team" className="text-xs text-fg-muted transition-colors hover:text-fg">
          ← My team
        </Link>
        <h1 className="mt-2 text-3xl font-medium">Saved drafts</h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          Squads saved from the AI builder without making them active. Expand one to see the
          pitch, edit it the same way you edit your live squad, or activate it to replace your
          current team.
        </p>
      </header>

      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-8 py-16 text-center">
          <p className="text-sm text-fg-muted">
            No drafts yet.{' '}
            <Link href="/squad-builder" className="text-accent hover:underline">
              Build one
            </Link>{' '}
            and save it to compare later.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              candidatePlayers={candidatePlayers}
              teams={teams}
              insights={insights}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
