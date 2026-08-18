import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { loadMyTeam } from '@/lib/team/actions';
import { getRecommendations } from '@/lib/model/recommendations';
import { getSquadFixtures } from '@/lib/model/team-fixtures';
import { money, signedMoney } from '@/lib/team/my-team';
import { SQUAD_SIZE } from '@/lib/model/optimiser';
import { TeamPitch } from '@/components/team-pitch';
import { Recommendations } from '@/components/recommendations';
import { SquadFixtures } from '@/components/squad-fixtures';
import { KeyLegend, SectionHeader, Stat, StatStrip } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();
  // One timestamp for the whole page, so the deadline countdown and the
  // "refreshed N ago" stamps cannot disagree with each other.
  //
  // react-hooks/purity guards against values that change between client
  // re-renders. This is an async Server Component marked force-dynamic: it runs
  // once per request and never re-renders, so reading the clock here is correct.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const [{ data: nextGw }, team] = await Promise.all([
    supabase.from('gameweeks').select('id, name, deadline_time').eq('is_next', true).maybeSingle(),
    loadMyTeam(),
  ]);

  const [recommendations, squadFixtures] = await Promise.all([
    getRecommendations({ excludeIds: team.players.map((p) => p.id), perPosition: 12 }),
    getSquadFixtures(team.players.map((p) => ({ team_id: p.team_id, web_name: p.web_name }))),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1500px] px-6 py-10 md:px-8 md:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-medium">Dashboard</h1>
          <p className="mt-1.5 text-sm text-fg-muted">
            {nextGw
              ? `${nextGw.name} deadline · ${formatDeadline(nextGw.deadline_time)}`
              : 'No upcoming deadline'}
            {recommendations.dataUpdatedAt && (
              <span className="text-fg-dim">
                {' '}
                · data refreshed {relativeTime(recommendations.dataUpdatedAt, now)}
              </span>
            )}
          </p>
        </div>
        <Countdown deadline={nextGw?.deadline_time ?? null} now={now} />
      </header>

      <section className="mb-6">
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
          <Stat label="Squad size" value={`${team.players.length} / ${SQUAD_SIZE}`} />
        </StatStrip>
      </section>

      <div className="mb-8">
        <KeyLegend />
      </div>

      {team.players.length === 0 && <EmptyTeam />}

      {!team.complete && team.players.length > 0 && (
        <p className="mb-5 border border-amber/40 bg-amber/10 px-4 py-2.5 text-sm text-amber">
          Squad incomplete — still need {team.missing.join(', ')}.{' '}
          <Link href="/my-team" className="underline">
            Finish it
          </Link>
        </p>
      )}

      {/*
        Split panel. My Team keeps its natural height and sets the row height;
        the recommendation panel is pinned to fill exactly that space, so both
        tops and bottoms line up and the list scrolls inside a fixed-size box.

        The absolute positioning is what stops a long list from stretching the
        row — an absolutely positioned child contributes no height to the grid.
        Below `lg` the columns stack, so it falls back to a fixed height there.
      */}
      <div className="mb-12 grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-w-0 flex-col">
          <SectionHeader title="My team" action={{ href: '/my-team', label: 'Edit squad' }} />
          {team.players.length > 0 ? (
            <TeamPitch team={team} />
          ) : (
            <div className="flex items-center justify-center border-2 border-dashed border-border py-16 text-sm text-fg-dim">
              Your squad will appear here.
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-col">
          <SectionHeader
            title="Recommended players"
            hint={`GW${recommendations.fromGw}–${recommendations.toGw}`}
            info={
              <>
                Ranked by projected points over the next{' '}
                {recommendations.toGw - recommendations.fromGw + 1} gameweeks, combining
                expected goals and assists, expected minutes, opponent strength and
                clean-sheet odds. Tags flag the reasons — hover any of them. Refreshes as
                prices move and injury news lands.
              </>
            }
          />
          <div className="relative min-h-[24rem] flex-1 lg:min-h-0">
            <div className="h-full lg:absolute lg:inset-0">
              <Recommendations
                set={recommendations}
                bank={team.bank}
                canAddMore={team.players.length < SQUAD_SIZE}
                limit={40}
              />
            </div>
          </div>
        </section>
      </div>

      {squadFixtures.clubs.length > 0 && (
        <section className="mb-12">
          <SectionHeader
            title="Your upcoming fixtures"
            hint="kindest run first · (H) home, (A) away"
            action={{ href: '/fixtures', label: 'View all fixtures' }}
          />
          <SquadFixtures clubs={squadFixtures.clubs} gameweeks={squadFixtures.gameweeks} />
        </section>
      )}

      {recommendations.latestNews.length > 0 && (
        <section>
          <SectionHeader title="Latest injury news" hint="straight from FPL" />
          <ul className="divide-y divide-divider border-2 border-border">
            {recommendations.latestNews.map((n, i) => (
              <li key={i} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="font-medium">{n.web_name}</span>
                <span className="font-mono text-[11px] text-fg-dim">{n.team_short}</span>
                <span className="text-fg-muted">{n.news}</span>
                <span className="ml-auto font-mono text-[11px] text-fg-dim">
                  {relativeTime(n.added, now)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function EmptyTeam() {
  return (
    <div className="mb-8 border-2 border-dashed border-border px-8 py-12 text-center">
      <h2 className="text-lg font-medium">No squad yet</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-muted">
        Build your 15 by hand, or let the AI put one together and import it in one click.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          href="/my-team"
          className="border border-accent px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
        >
          Build my squad
        </Link>
        <Link
          href="/squad-builder"
          className="border-2 border-border px-5 py-2.5 text-sm text-fg-muted transition-colors hover:border-border-bright hover:text-fg"
        >
          Use the AI builder
        </Link>
      </div>
    </div>
  );
}

/**
 * FPL deadlines are set in UK time, so pin the timezone explicitly.
 *
 * This renders on the server, which means an unpinned format would use the
 * SERVER's timezone — UTC on Vercel — and quietly show the wrong hour to a UK
 * user for the eight months of the season that BST is in effect.
 */
function formatDeadline(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Countdown({ deadline, now }: { deadline: string | null; now: number }) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return null;

  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);

  return (
    <div className="border-2 border-border px-5 py-3 text-right">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim">
        Deadline in
      </div>
      <div className="tnum mt-1 text-xl font-medium text-accent">
        {days > 0 ? `${days}d ${hours}h` : `${hours}h`}
      </div>
    </div>
  );
}
