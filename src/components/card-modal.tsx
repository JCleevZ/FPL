'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { playerPhotoUrl, teamBadgeUrl } from '@/lib/fpl/client';
import { POSITION_NAME, type Position } from '@/lib/fpl/types';
import { difficultyClass, Explain, FixtureLabel, Stat, StatStrip } from '@/components/ui';
import { money } from '@/lib/team/my-team';
import type { GlossaryKey } from '@/lib/glossary';

/**
 * Click-to-open player/team detail popups, wired in everywhere a card, name or
 * badge appears. One provider mounted at the root layout owns two things every
 * card needs: the id -> photo/badge code lookup (loaded once — a few hundred
 * small rows, far cheaper than a query per card) and the open/close state for
 * whichever popup is currently showing.
 */

interface MetaMaps {
  playerCode: Map<number, number>;
  teamCode: Map<number, number>;
  teamShort: Map<number, string>;
}

const EMPTY_MAPS: MetaMaps = { playerCode: new Map(), teamCode: new Map(), teamShort: new Map() };

interface CardModalContextValue extends MetaMaps {
  openPlayer: (id: number) => void;
  openTeam: (id: number) => void;
}

const CardModalContext = createContext<CardModalContextValue | null>(null);

export function useCardModal(): CardModalContextValue {
  const ctx = useContext(CardModalContext);
  if (!ctx) throw new Error('useCardModal must be used within CardModalProvider');
  return ctx;
}

type Active = { type: 'player' | 'team'; id: number };

export function CardModalProvider({ children }: { children: React.ReactNode }) {
  const [maps, setMaps] = useState<MetaMaps>(EMPTY_MAPS);
  const [active, setActive] = useState<Active | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const loadMaps = () => {
      Promise.all([
        supabase.from('players').select('id, code'),
        supabase.from('teams').select('id, code, short_name'),
      ]).then(([players, teams]) => {
        if (cancelled || !players.data?.length) return;
        setMaps({
          playerCode: new Map(players.data.map((p) => [p.id as number, p.code as number])),
          teamCode: new Map((teams.data ?? []).map((t) => [t.id as number, t.code as number])),
          teamShort: new Map((teams.data ?? []).map((t) => [t.id as number, t.short_name as string])),
        });
      });
    };

    loadMaps();
    // Right after a fresh sign-in, this provider can mount a beat before the
    // session cookie is actually readable, so RLS blocks that first attempt —
    // this event fires once the client confirms a session and retries it.
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadMaps());

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const openPlayer = useCallback((id: number) => setActive({ type: 'player', id }), []);
  const openTeam = useCallback((id: number) => setActive({ type: 'team', id }), []);
  const close = useCallback(() => setActive(null), []);

  const value = useMemo<CardModalContextValue>(
    () => ({ ...maps, openPlayer, openTeam }),
    [maps, openPlayer, openTeam],
  );

  return (
    <CardModalContext.Provider value={value}>
      {children}
      {active && (
        <DetailModal
          active={active}
          onClose={close}
          onOpenPlayer={openPlayer}
          onOpenTeam={openTeam}
          teamShort={maps.teamShort}
        />
      )}
    </CardModalContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Small presentational pieces used both inside the popups and on cards
// elsewhere in the app.
// ---------------------------------------------------------------------------

/**
 * A player's name, clickable to open their profile — for the plain-text spots
 * that don't already go through `PlayerCard` or `PlayerIdentity` (news feeds,
 * squad previews, per-player notes).
 */
export function PlayerNameLink({
  id,
  children,
  className = '',
}: {
  id: number;
  children: React.ReactNode;
  className?: string;
}) {
  const { openPlayer } = useCardModal();
  return (
    <button
      type="button"
      onClick={() => openPlayer(id)}
      className={`hover:underline ${className}`}
    >
      {children}
    </button>
  );
}

/** Club crest. Renders nothing until its code has loaded, rather than a broken image. */
export function TeamBadge({
  teamId,
  size = 20,
  className = '',
  clickable = true,
}: {
  teamId: number;
  size?: number;
  className?: string;
  clickable?: boolean;
}) {
  const { teamCode, openTeam } = useCardModal();
  const [broken, setBroken] = useState(false);
  const code = teamCode.get(teamId);
  if (!code || broken) return null;

  const img = (
    <img
      src={teamBadgeUrl(code, 25)}
      alt=""
      width={size}
      height={size}
      className={`inline-block shrink-0 object-contain ${className}`}
      onError={() => setBroken(true)}
    />
  );

  if (!clickable) return img;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openTeam(teamId);
      }}
      title="View team"
      className="inline-flex shrink-0 align-middle"
    >
      {img}
    </button>
  );
}

const RING: Record<Position, string> = {
  1: 'ring-pos-gk',
  2: 'ring-pos-def',
  3: 'ring-pos-mid',
  4: 'ring-pos-fwd',
};

/** Player headshot with a position-coloured ring. Falls back to a position initial. */
export function PlayerAvatar({
  playerId,
  position,
  size = 40,
}: {
  playerId: number;
  position: Position;
  size?: number;
}) {
  const { playerCode } = useCardModal();
  const [broken, setBroken] = useState(false);
  const code = playerCode.get(playerId);

  if (!code || broken) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`mx-auto flex items-center justify-center rounded-full bg-surface-3 font-mono
                    text-[10px] font-bold text-fg-dim ring-2 ${RING[position]}`}
      >
        {POSITION_NAME[position][0]}
      </div>
    );
  }

  return (
    <img
      src={playerPhotoUrl(code, '110x140')}
      alt=""
      style={{ width: size, height: size }}
      className={`mx-auto rounded-full object-cover object-top ring-2 ${RING[position]}`}
      onError={() => setBroken(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// The popup itself
// ---------------------------------------------------------------------------

function DetailModal({
  active,
  onClose,
  onOpenPlayer,
  onOpenTeam,
  teamShort,
}: {
  active: Active;
  onClose: () => void;
  onOpenPlayer: (id: number) => void;
  onOpenTeam: (id: number) => void;
  teamShort: Map<number, string>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-base/80
                 px-4 py-10 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // Key on id: switching from one player's popup straight to another
        // (via the squad list) must reset scroll and any stale local state.
        key={`${active.type}-${active.id}`}
        className="w-full max-w-2xl rounded-2xl border border-border-bright bg-surface p-6 shadow-2xl"
      >
        {active.type === 'player' ? (
          <PlayerDetail
            id={active.id}
            onClose={onClose}
            onOpenTeam={onOpenTeam}
            teamShort={teamShort}
          />
        ) : (
          <TeamDetail id={active.id} onClose={onClose} onOpenPlayer={onOpenPlayer} teamShort={teamShort} />
        )}
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="float-right -mr-1 -mt-1 rounded-full p-1.5 text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
    >
      ✕
    </button>
  );
}

function MiniStat({ label, value, term }: { label: string; value: string; term?: GlossaryKey }) {
  return (
    <div className="rounded-lg bg-surface-2/60 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-dim">
        {term ? <Explain term={term}>{label}</Explain> : label}
      </div>
      <div className="tnum mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

interface FixtureRow {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number | null;
  team_a_difficulty: number | null;
}

/** The next few unfinished fixtures for a club, difficulty-coloured. */
function UpcomingFixtures({ teamId, fixtures, teamShort }: { teamId: number; fixtures: FixtureRow[]; teamShort: Map<number, string> }) {
  if (fixtures.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim">Next fixtures</div>
      <div className="flex flex-wrap gap-1.5">
        {fixtures.map((f) => {
          const home = f.team_h === teamId;
          const oppId = home ? f.team_a : f.team_h;
          const difficulty = (home ? f.team_h_difficulty : f.team_a_difficulty) ?? 3;
          return (
            <div
              key={f.id}
              title={`GW${f.event ?? '?'}`}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${difficultyClass(difficulty)}`}
            >
              <FixtureLabel opponent={teamShort.get(oppId) ?? '???'} home={home} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function loadFixtures(teamId: number): Promise<FixtureRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('fixtures')
    .select('id, event, team_h, team_a, team_h_difficulty, team_a_difficulty')
    .or(`team_h.eq.${teamId},team_a.eq.${teamId}`)
    .eq('finished', false)
    .order('event', { ascending: true })
    .limit(5);
  return (data ?? []) as unknown as FixtureRow[];
}

// ---------------------------------------------------------------------------
// Player detail
// ---------------------------------------------------------------------------

interface PlayerRow {
  id: number;
  first_name: string | null;
  second_name: string | null;
  web_name: string;
  team_id: number;
  position: number;
  now_cost: number;
  cost_change_event: number | null;
  status: string | null;
  news: string | null;
  total_points: number;
  points_per_game: number | null;
  form: number | null;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  defensive_contribution: number;
  expected_goals: number | null;
  expected_assists: number | null;
  ict_index: number | null;
  selected_by_percent: number | null;
  transfers_in_event: number | null;
  transfers_out_event: number | null;
  penalties_order: number | null;
  direct_freekicks_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  d: 'Doubtful',
  i: 'Injured',
  s: 'Suspended',
  u: 'Unavailable',
  n: 'Not in squad',
};

function PlayerDetail({
  id,
  onClose,
  onOpenTeam,
  teamShort,
}: {
  id: number;
  onClose: () => void;
  onOpenTeam: (id: number) => void;
  teamShort: Map<number, string>;
}) {
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      try {
        const { data } = await supabase.from('players').select('*').eq('id', id).maybeSingle();
        if (cancelled || !data) return;
        const p = data as unknown as PlayerRow;
        setPlayer(p);
        const fx = await loadFixtures(p.team_id);
        if (!cancelled) setFixtures(fx);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading || !player) {
    return (
      <div>
        <CloseButton onClose={onClose} />
        <div className="flex min-h-[240px] items-center justify-center text-sm text-fg-dim">Loading…</div>
      </div>
    );
  }

  const pos = player.position as Position;
  const fullName = [player.first_name, player.second_name].filter(Boolean).join(' ');
  const setPieces = [
    player.penalties_order === 1 ? 'Penalties' : null,
    player.direct_freekicks_order === 1 ? 'Free kicks' : null,
    player.corners_and_indirect_freekicks_order === 1 ? 'Corners' : null,
  ].filter((s): s is string => s !== null);

  return (
    <div>
      <CloseButton onClose={onClose} />

      <div className="flex items-center gap-4">
        <PlayerAvatar playerId={player.id} position={pos} size={72} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-semibold">{player.web_name}</div>
          {fullName && fullName !== player.web_name && (
            <div className="mt-0.5 truncate text-xs text-fg-dim">{fullName}</div>
          )}
          <button
            type="button"
            onClick={() => onOpenTeam(player.team_id)}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
          >
            <TeamBadge teamId={player.team_id} size={16} clickable={false} />
            {teamShort.get(player.team_id)}
            <span className="font-mono uppercase text-fg-dim">· {POSITION_NAME[pos]}</span>
          </button>
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum text-2xl font-semibold">{money(player.now_cost)}</div>
          {!!player.cost_change_event && (
            <div className={`tnum text-xs ${player.cost_change_event > 0 ? 'text-fdr-1' : 'text-danger'}`}>
              {player.cost_change_event > 0 ? '▲' : '▼'}
              {(Math.abs(player.cost_change_event) / 10).toFixed(1)}m today
            </div>
          )}
        </div>
      </div>

      {player.status && player.status !== 'a' && (
        <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {player.news || STATUS_LABEL[player.status] || 'Flagged unavailable'}
        </p>
      )}

      <div className="mt-5">
        <StatStrip>
          <Stat label="Total points" value={String(player.total_points)} />
          <Stat label="Form" term="form" value={(Number(player.form) || 0).toFixed(1)} />
          <Stat label="PPG" value={(Number(player.points_per_game) || 0).toFixed(1)} />
          <Stat label="Owned" term="ownership" value={`${(Number(player.selected_by_percent) || 0).toFixed(1)}%`} />
        </StatStrip>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {(
          [
            ['Mins', player.minutes],
            ['Starts', player.starts],
            ['Goals', player.goals_scored],
            ['Assists', player.assists],
            ['CS', player.clean_sheets],
            ['Bonus', player.bonus],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface-2/60 px-2 py-2 text-center">
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-dim">{label}</div>
            <div className="tnum mt-1 text-sm font-medium">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim">Underlying</div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MiniStat term="xg" label="xG" value={(Number(player.expected_goals) || 0).toFixed(2)} />
          <MiniStat term="xa" label="xA" value={(Number(player.expected_assists) || 0).toFixed(2)} />
          <MiniStat label="ICT index" value={(Number(player.ict_index) || 0).toFixed(1)} />
          <MiniStat term="bps" label="BPS" value={String(player.bps)} />
          <MiniStat term="defcon" label="DC" value={String(player.defensive_contribution)} />
          <MiniStat label="Yellow / Red" value={`${player.yellow_cards} / ${player.red_cards}`} />
          {pos === 1 && <MiniStat label="Saves" value={String(player.saves)} />}
          <MiniStat
            term="netTransfers"
            label="Net T (GW)"
            value={`${(player.transfers_in_event ?? 0) - (player.transfers_out_event ?? 0) >= 0 ? '+' : ''}${(player.transfers_in_event ?? 0) - (player.transfers_out_event ?? 0)}`}
          />
        </div>
      </div>

      {setPieces.length > 0 && (
        <div className="mt-4 rounded-lg bg-violet/10 px-3 py-2 text-xs text-violet">
          First choice: {setPieces.join(', ')}
        </div>
      )}

      <UpcomingFixtures teamId={player.team_id} fixtures={fixtures} teamShort={teamShort} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team detail
// ---------------------------------------------------------------------------

interface TeamRow {
  id: number;
  name: string;
  short_name: string;
  strength_attack_home: number | null;
  strength_attack_away: number | null;
  strength_defence_home: number | null;
  strength_defence_away: number | null;
  position: number | null;
  played: number | null;
  win: number | null;
  draw: number | null;
  loss: number | null;
  points: number | null;
}

interface SquadRow {
  id: number;
  web_name: string;
  position: number;
  now_cost: number;
  total_points: number;
  status: string | null;
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

const POSITION_TEXT: Record<Position, string> = {
  1: 'text-pos-gk',
  2: 'text-pos-def',
  3: 'text-pos-mid',
  4: 'text-pos-fwd',
};

function TeamDetail({
  id,
  onClose,
  onOpenPlayer,
  teamShort,
}: {
  id: number;
  onClose: () => void;
  onOpenPlayer: (id: number) => void;
  teamShort: Map<number, string>;
}) {
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from('teams').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('players')
        .select('id, web_name, position, now_cost, total_points, status')
        .eq('team_id', id)
        .order('total_points', { ascending: false }),
      loadFixtures(id),
    ]).then(([t, players, fx]) => {
      if (cancelled) return;
      setTeam((t.data as unknown as TeamRow) ?? null);
      setSquad((players.data ?? []) as unknown as SquadRow[]);
      setFixtures(fx);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading || !team) {
    return (
      <div>
        <CloseButton onClose={onClose} />
        <div className="flex min-h-[240px] items-center justify-center text-sm text-fg-dim">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <CloseButton onClose={onClose} />

      <div className="flex items-center gap-4">
        <TeamBadge teamId={team.id} size={56} clickable={false} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-semibold">{team.name}</div>
          <div className="text-xs text-fg-dim">{team.short_name}</div>
        </div>
        {team.position != null && (
          <div className="shrink-0 text-right">
            <div className="tnum text-2xl font-semibold">{ordinal(team.position)}</div>
            <div className="text-xs text-fg-dim">league position</div>
          </div>
        )}
      </div>

      <div className="mt-5">
        <StatStrip>
          <Stat label="Played" value={String(team.played ?? 0)} />
          <Stat label="W / D / L" value={`${team.win ?? 0} / ${team.draw ?? 0} / ${team.loss ?? 0}`} />
          <Stat label="Points" value={String(team.points ?? 0)} />
          <Stat label="Squad" value={String(squad.length)} />
        </StatStrip>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim">
          Strength (FPL rating)
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <MiniStat label="Attack (H)" value={String(team.strength_attack_home ?? '—')} />
          <MiniStat label="Attack (A)" value={String(team.strength_attack_away ?? '—')} />
          <MiniStat label="Defence (H)" value={String(team.strength_defence_home ?? '—')} />
          <MiniStat label="Defence (A)" value={String(team.strength_defence_away ?? '—')} />
        </div>
      </div>

      <UpcomingFixtures teamId={team.id} fixtures={fixtures} teamShort={teamShort} />

      <div className="mt-5">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-fg-dim">Squad</div>
        <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
          {squad.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpenPlayer(p.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5
                           text-left text-sm transition-colors hover:bg-surface-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`font-mono text-[10px] uppercase ${POSITION_TEXT[p.position as Position]}`}>
                    {POSITION_NAME[p.position as Position]}
                  </span>
                  <span className="truncate">{p.web_name}</span>
                  {p.status && p.status !== 'a' && <span className="text-danger">●</span>}
                </span>
                <span className="tnum shrink-0 text-xs text-fg-muted">
                  {money(p.now_cost)} · {p.total_points} pts
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
