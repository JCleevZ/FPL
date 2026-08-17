-- FPL Dashboard — initial schema
-- Reference tables mirror the official FPL API. Ingest writes with the service role;
-- authenticated users get read-only access. User tables are owner-scoped via RLS.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table if not exists teams (
  id                     smallint primary key,          -- FPL team id (1-20)
  code                   smallint not null,             -- stable code, used for badge URLs
  name                   text not null,
  short_name             text not null,
  strength               smallint,
  strength_overall_home  smallint,
  strength_overall_away  smallint,
  strength_attack_home   smallint,
  strength_attack_away   smallint,
  strength_defence_home  smallint,
  strength_defence_away  smallint,
  position               smallint,
  played                 smallint,
  win                    smallint,
  draw                   smallint,
  loss                   smallint,
  points                 smallint,
  updated_at             timestamptz not null default now()
);

create table if not exists gameweeks (
  id                       smallint primary key,        -- 1..38
  name                     text not null,
  deadline_time            timestamptz not null,
  is_current               boolean not null default false,
  is_next                  boolean not null default false,
  is_previous              boolean not null default false,
  finished                 boolean not null default false,
  data_checked             boolean not null default false,
  average_entry_score      integer,
  highest_score            integer,
  most_selected            integer,
  most_transferred_in       integer,
  most_captained           integer,
  most_vice_captained      integer,
  top_element              integer,
  transfers_made           integer,
  chip_plays               jsonb,
  updated_at               timestamptz not null default now()
);

create table if not exists players (
  id                        integer primary key,        -- FPL element id
  code                      integer not null,           -- stable code, used for photo URLs
  first_name                text,
  second_name               text,
  web_name                  text not null,
  team_id                   smallint not null references teams(id),
  position                  smallint not null,          -- 1 GK, 2 DEF, 3 MID, 4 FWD
  now_cost                  integer not null,           -- tenths of a million (55 = £5.5m)
  cost_change_start         integer default 0,
  cost_change_event         integer default 0,

  -- availability
  status                    text,                       -- a d i s u n
  news                      text,
  news_added                timestamptz,
  chance_of_playing_this_round integer,
  chance_of_playing_next_round integer,

  -- season totals
  total_points              integer default 0,
  points_per_game           numeric,
  form                      numeric,
  minutes                   integer default 0,
  starts                    integer default 0,
  goals_scored              integer default 0,
  assists                   integer default 0,
  clean_sheets              integer default 0,
  goals_conceded            integer default 0,
  own_goals                 integer default 0,
  penalties_saved           integer default 0,
  penalties_missed          integer default 0,
  yellow_cards              integer default 0,
  red_cards                 integer default 0,
  saves                     integer default 0,
  bonus                     integer default 0,
  bps                       integer default 0,

  -- defensive contribution (2025/26+ scoring)
  defensive_contribution    integer default 0,
  clearances_blocks_interceptions integer default 0,
  recoveries                integer default 0,
  tackles                   integer default 0,

  -- underlying numbers
  expected_goals            numeric default 0,
  expected_assists          numeric default 0,
  expected_goal_involvements numeric default 0,
  expected_goals_conceded   numeric default 0,
  expected_goals_per_90     numeric default 0,
  expected_assists_per_90   numeric default 0,
  expected_goal_involvements_per_90 numeric default 0,
  expected_goals_conceded_per_90 numeric default 0,
  starts_per_90             numeric default 0,
  clean_sheets_per_90       numeric default 0,
  saves_per_90              numeric default 0,
  defensive_contribution_per_90 numeric default 0,

  -- ICT
  influence                 numeric default 0,
  creativity                numeric default 0,
  threat                    numeric default 0,
  ict_index                 numeric default 0,

  -- market
  selected_by_percent       numeric default 0,
  transfers_in              integer default 0,
  transfers_out             integer default 0,
  transfers_in_event        integer default 0,
  transfers_out_event       integer default 0,
  value_form                numeric,
  value_season              numeric,
  ep_this                   numeric,
  ep_next                   numeric,

  -- set pieces: 1 = first choice. Null = not on the list.
  penalties_order                    smallint,
  direct_freekicks_order             smallint,
  corners_and_indirect_freekicks_order smallint,

  updated_at                timestamptz not null default now()
);

create index if not exists players_team_idx     on players(team_id);
create index if not exists players_position_idx on players(position);
create index if not exists players_cost_idx     on players(now_cost);

create table if not exists fixtures (
  id                   integer primary key,
  code                 integer,
  event                smallint references gameweeks(id),  -- null for unscheduled fixtures
  team_h               smallint not null references teams(id),
  team_a               smallint not null references teams(id),
  team_h_score         smallint,
  team_a_score         smallint,
  team_h_difficulty    smallint,
  team_a_difficulty    smallint,
  kickoff_time         timestamptz,
  started              boolean default false,
  finished             boolean default false,
  finished_provisional boolean default false,
  minutes              smallint default 0,
  stats                jsonb,
  updated_at           timestamptz not null default now()
);

create index if not exists fixtures_event_idx on fixtures(event);
create index if not exists fixtures_teams_idx on fixtures(team_h, team_a);
create index if not exists fixtures_kickoff_idx on fixtures(kickoff_time);

-- Per-player, per-gameweek actuals.
create table if not exists player_gw_stats (
  player_id            integer not null references players(id) on delete cascade,
  gw                   smallint not null references gameweeks(id),
  fixture_id           integer,
  opponent_team        smallint,
  was_home             boolean,
  total_points         integer default 0,
  minutes              integer default 0,
  starts               smallint default 0,
  goals_scored         integer default 0,
  assists              integer default 0,
  clean_sheets         integer default 0,
  goals_conceded       integer default 0,
  own_goals            integer default 0,
  penalties_saved      integer default 0,
  penalties_missed     integer default 0,
  yellow_cards         integer default 0,
  red_cards            integer default 0,
  saves                integer default 0,
  bonus                integer default 0,
  bps                  integer default 0,
  defensive_contribution integer default 0,
  expected_goals       numeric default 0,
  expected_assists     numeric default 0,
  expected_goal_involvements numeric default 0,
  expected_goals_conceded numeric default 0,
  influence            numeric default 0,
  creativity           numeric default 0,
  threat               numeric default 0,
  ict_index            numeric default 0,
  value                integer,                     -- price at the time of that GW
  selected             integer,
  transfers_in         integer,
  transfers_out        integer,
  updated_at           timestamptz not null default now(),
  primary key (player_id, gw, fixture_id)
);

create index if not exists player_gw_stats_gw_idx on player_gw_stats(gw);

-- The irreplaceable table: FPL exposes no price/ownership history, so we build it.
create table if not exists price_snapshots (
  player_id           integer not null references players(id) on delete cascade,
  captured_at         timestamptz not null default now(),
  now_cost            integer not null,
  cost_change_event   integer default 0,
  selected_by_percent numeric,
  transfers_in_event  integer,
  transfers_out_event integer,
  form                numeric,
  status              text,
  primary key (player_id, captured_at)
);

create index if not exists price_snapshots_recent_idx
  on price_snapshots(player_id, captured_at desc);

-- Our own projected points, versioned so we can grade the model later.
create table if not exists predictions (
  player_id     integer not null references players(id) on delete cascade,
  gw            smallint not null references gameweeks(id),
  model_version text not null,
  xpts          numeric not null,
  p_start       numeric,
  p_clean_sheet numeric,
  x_mins        numeric,
  fixture_count smallint default 1,
  detail        jsonb,
  computed_at   timestamptz not null default now(),
  primary key (player_id, gw, model_version)
);

create index if not exists predictions_rank_idx on predictions(gw, model_version, xpts desc);

-- ---------------------------------------------------------------------------
-- User data
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           text not null unique,
  fpl_entry_id       integer,
  favourite_team_id  smallint references teams(id),
  created_at         timestamptz not null default now()
);

-- FPL managers we track (yours, plus anyone you want to watch).
create table if not exists entries (
  id            integer primary key,          -- FPL entry id
  player_name   text,
  team_name     text,
  started_event smallint,
  overall_rank  integer,
  total_points  integer,
  updated_at    timestamptz not null default now()
);

create table if not exists entry_gw (
  entry_id         integer not null references entries(id) on delete cascade,
  gw               smallint not null,
  points           integer,
  total_points     integer,
  rank             integer,
  overall_rank     integer,
  bank             integer,
  value            integer,
  event_transfers  integer,
  event_transfers_cost integer,
  points_on_bench  integer,
  chip             text,
  primary key (entry_id, gw)
);

create table if not exists entry_picks (
  entry_id   integer not null references entries(id) on delete cascade,
  gw         smallint not null,
  player_id  integer not null,
  position   smallint not null,   -- 1-11 starters, 12-15 bench
  multiplier smallint not null,   -- 0 bench, 1 playing, 2 captain, 3 triple captain
  is_captain boolean default false,
  is_vice_captain boolean default false,
  primary key (entry_id, gw, player_id)
);

-- Saved squad drafts, from the AI builder or built by hand.
create table if not exists squads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  player_ids  integer[] not null,
  captain_id  integer,
  vice_captain_id integer,
  formation   text,
  budget      integer,
  total_cost  integer,
  source      text not null default 'manual',   -- 'ai' | 'manual'
  filters     jsonb,                            -- the spec that produced it
  reasoning   jsonb,                            -- LLM narrative + per-player rationale
  created_at  timestamptz not null default now()
);

create index if not exists squads_user_idx on squads(user_id, created_at desc);

create table if not exists watchlist (
  user_id    uuid not null references auth.users(id) on delete cascade,
  player_id  integer not null references players(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, player_id)
);

-- Cache for LLM output, keyed on a hash of the input spec. Keeps us inside free quotas.
create table if not exists ai_generations (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,               -- 'squad' | 'transfers' | 'captain' | ...
  input_hash  text not null unique,
  input       jsonb not null,
  output      jsonb not null,
  provider    text,
  model       text,
  created_at  timestamptz not null default now()
);

create index if not exists ai_generations_kind_idx on ai_generations(kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever an auth user is created.
-- Doing this in a trigger (not app code) means a signup can never leave a user
-- without a profile row.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Reference data: any signed-in user may read. Writes only via the service role,
-- which bypasses RLS entirely, so no write policy is needed.
alter table teams           enable row level security;
alter table gameweeks       enable row level security;
alter table players         enable row level security;
alter table fixtures        enable row level security;
alter table player_gw_stats enable row level security;
alter table price_snapshots enable row level security;
alter table predictions     enable row level security;
alter table entries         enable row level security;
alter table entry_gw        enable row level security;
alter table entry_picks     enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'teams','gameweeks','players','fixtures','player_gw_stats',
    'price_snapshots','predictions','entries','entry_gw','entry_picks'
  ] loop
    execute format(
      'drop policy if exists %I on %I; create policy %I on %I for select to authenticated using (true);',
      t || '_read', t, t || '_read', t
    );
  end loop;
end $$;

-- Owner-scoped tables.
alter table profiles  enable row level security;
alter table squads    enable row level security;
alter table watchlist enable row level security;

drop policy if exists profiles_own on profiles;
create policy profiles_own on profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists squads_own on squads;
create policy squads_own on squads
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists watchlist_own on watchlist;
create policy watchlist_own on watchlist
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- AI cache: readable by any signed-in user (it holds no personal data and sharing
-- cache hits across users is the point). Written only by the service role.
alter table ai_generations enable row level security;
drop policy if exists ai_generations_read on ai_generations;
create policy ai_generations_read on ai_generations
  for select to authenticated using (true);
