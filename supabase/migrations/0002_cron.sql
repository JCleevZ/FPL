-- Scheduled ingest via pg_cron + pg_net.
--
-- ⚠ DEPRECATED (2026-08-18): this approach is retired. FPL's bot protection
-- 403s Vercel's datacenter IPs, so the /api/ingest endpoint this file calls
-- cannot reach the FPL API. Ingest now runs from GitHub Actions instead —
-- see .github/workflows/ingest.yml (runs `npm run ingest all` every 30 min,
-- writing directly to Supabase). The four fpl_* HTTP jobs have been
-- unscheduled; only fpl_prune (pure SQL, at the bottom of this file) is
-- still live and should be kept.
--
-- Kept for reference: the prune functions/jobs below are still in use, and
-- this documents why not Vercel Cron: the Hobby plan only allows one run per
-- day, which is useless for price snapshots and live gameweek tracking.
--
-- BEFORE RUNNING (reference only): replace the two placeholders below.
--   <APP_URL>        e.g. https://your-app.vercel.app  (no trailing slash)
--   <INGEST_SECRET>  the same value as the INGEST_SECRET env var

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper so the schedules below stay readable and the secret lives in one place.
create or replace function trigger_ingest(job text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_id bigint;
begin
  select net.http_post(
    url     := '<APP_URL>/api/ingest?job=' || job,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-ingest-secret', '<INGEST_SECRET>'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into request_id;
  return request_id;
end;
$$;

-- Remove any previous schedules so this file is safe to re-run.
do $$
declare j text;
begin
  foreach j in array array['fpl_snapshot','fpl_fixtures','fpl_live','fpl_entries'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

-- Prices and ownership: every 30 minutes. This is the irreplaceable one —
-- FPL publishes no history, so an unrecorded half hour is gone for good.
select cron.schedule('fpl_snapshot', '*/30 * * * *', $$select trigger_ingest('snapshot')$$);

-- Fixtures change rarely (rearrangements, cup-driven blanks). Daily at 03:15 UTC.
select cron.schedule('fpl_fixtures', '15 3 * * *', $$select trigger_ingest('fixtures')$$);

-- Live points. The job itself no-ops when no gameweek is current, so running it
-- every 2 minutes year-round costs nothing but is instant when matches kick off.
select cron.schedule('fpl_live', '*/2 * * * *', $$select trigger_ingest('live')$$);

-- Tracked managers' ranks, history and picks. Hourly.
select cron.schedule('fpl_entries', '7 * * * *', $$select trigger_ingest('entries')$$);

-- ---------------------------------------------------------------------------
-- Keep price_snapshots inside the 500 MB free tier.
-- 700 players every 30 min is ~12M rows/season. Full resolution is only useful
-- while a price change is pending, so thin older data out:
--   > 7 days old   -> keep one row per player per hour
--   > 30 days old  -> keep one row per player per day
-- ---------------------------------------------------------------------------

create or replace function prune_price_snapshots()
returns void
language sql
as $$
  with ranked as (
    select player_id, captured_at,
           row_number() over (
             partition by player_id, date_trunc('hour', captured_at)
             order by captured_at
           ) as rn
    from price_snapshots
    where captured_at < now() - interval '7 days'
      and captured_at >= now() - interval '30 days'
  )
  delete from price_snapshots p
  using ranked r
  where p.player_id = r.player_id and p.captured_at = r.captured_at and r.rn > 1;
$$;

create or replace function prune_price_snapshots_daily()
returns void
language sql
as $$
  with ranked as (
    select player_id, captured_at,
           row_number() over (
             partition by player_id, date_trunc('day', captured_at)
             order by captured_at
           ) as rn
    from price_snapshots
    where captured_at < now() - interval '30 days'
  )
  delete from price_snapshots p
  using ranked r
  where p.player_id = r.player_id and p.captured_at = r.captured_at and r.rn > 1;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fpl_prune') then
    perform cron.unschedule('fpl_prune');
  end if;
end $$;

select cron.schedule(
  'fpl_prune',
  '40 4 * * *',
  $$select prune_price_snapshots(); select prune_price_snapshots_daily();$$
);

-- Inspect with:  select jobname, schedule, active from cron.job;
-- Recent runs:   select * from cron.job_run_details order by start_time desc limit 20;
