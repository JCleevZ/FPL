-- Your actual squad, built by hand and shown on the dashboard.
--
-- Purchase price is stored per player rather than derived, so the dashboard can
-- show what the squad cost you versus what it is worth now. FPL prices drift all
-- season and `players.now_cost` only ever holds today's number.

create table if not exists my_team (
  user_id         uuid    not null references auth.users(id) on delete cascade,
  player_id       integer not null references players(id) on delete cascade,
  /** Price when added, in tenths of a million. */
  purchase_price  integer not null,
  is_captain      boolean not null default false,
  is_vice_captain boolean not null default false,
  /** 1-4 for bench order; null means in the starting XI. */
  bench_order     smallint,
  added_at        timestamptz not null default now(),
  primary key (user_id, player_id)
);

create index if not exists my_team_user_idx on my_team(user_id);

-- Only one captain and one vice per user.
create unique index if not exists my_team_one_captain
  on my_team(user_id) where is_captain;
create unique index if not exists my_team_one_vice
  on my_team(user_id) where is_vice_captain;

-- Starting budget, so it can be adjusted if a season starts from an odd position.
alter table profiles add column if not exists team_budget integer not null default 1000;

alter table my_team enable row level security;

drop policy if exists my_team_own on my_team;
create policy my_team_own on my_team
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on my_team to authenticated;
grant all privileges on my_team to service_role;
