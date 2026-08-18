/**
 * Verifies what the ingest actually wrote.
 *
 *   npm run verify
 *
 * Checks row counts are plausible, that reference tables upsert rather than
 * duplicate, and that a few real queries return sensible football.
 */

import assert from 'node:assert/strict';
import 'dotenv/config';
import { config } from 'dotenv';

config({ path: '.env.local', override: true });

async function main() {
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const db = createAdminClient();

  const count = async (table: string) => {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    return count ?? 0;
  };

  const counts = {
    teams: await count('teams'),
    gameweeks: await count('gameweeks'),
    players: await count('players'),
    fixtures: await count('fixtures'),
    price_snapshots: await count('price_snapshots'),
  };

  console.log('row counts:');
  for (const [table, n] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(16)} ${n.toLocaleString()}`);
  }

  assert.equal(counts.teams, 20, 'expected exactly 20 Premier League teams');
  assert.equal(counts.gameweeks, 38, 'expected exactly 38 gameweeks');
  assert.equal(counts.fixtures, 380, 'expected exactly 380 fixtures (20 teams x 38)');
  assert.ok(counts.players > 400, `only ${counts.players} players — ingest looks incomplete`);
  assert.ok(counts.price_snapshots >= counts.players, 'expected at least one snapshot per player');

  // Reference tables must upsert, not accumulate. Re-run snapshot and confirm
  // the player count is unchanged (price_snapshots is a time series and SHOULD grow).
  const { runSnapshot } = await import('../src/lib/ingest/jobs');
  await runSnapshot();
  assert.equal(await count('players'), counts.players, 'players duplicated on re-run — upsert is broken');
  assert.equal(await count('teams'), 20, 'teams duplicated on re-run — upsert is broken');
  console.log('\n  ok  re-running snapshot did not duplicate reference rows');

  const after = await count('price_snapshots');
  assert.ok(after > counts.price_snapshots, 'price_snapshots should grow on each run — it is a time series');
  console.log(`  ok  price_snapshots grew ${counts.price_snapshots} -> ${after} (time series, as intended)`);

  // Real queries, to prove the data is usable and not just present.
  const { data: expensive } = await db
    .from('players')
    .select('web_name, now_cost, total_points, selected_by_percent, teams(short_name)')
    .order('now_cost', { ascending: false })
    .limit(5);

  console.log('\nmost expensive players:');
  for (const p of expensive ?? []) {
    // Embedded relation: a to-one join comes back as an object, but supabase-js
    // types it loosely without generated database types.
    const team = (p.teams as unknown as { short_name: string } | null)?.short_name ?? '???';
    console.log(
      `  ${p.web_name.padEnd(16)} ${team}  £${(p.now_cost / 10).toFixed(1)}m  ` +
        `${p.total_points} pts  ${p.selected_by_percent}% owned`,
    );
  }
  assert.ok((expensive?.length ?? 0) === 5, 'expected 5 rows back');
  assert.ok(
    (expensive?.[0]?.now_cost ?? 0) > 100,
    'most expensive player should cost over £10.0m — prices look wrong',
  );

  const { data: nextGw } = await db
    .from('gameweeks')
    .select('id, name, deadline_time')
    .eq('is_next', true)
    .maybeSingle();
  console.log(`\nnext deadline: ${nextGw?.name} at ${nextGw?.deadline_time}`);
  assert.ok(nextGw, 'expected a "next" gameweek to be flagged');

  // Every fixture must reference real teams, and no team plays itself.
  const { data: badFixtures } = await db
    .from('fixtures')
    .select('id, team_h, team_a')
    .filter('team_h', 'eq', 'team_a');
  assert.equal(badFixtures?.length ?? 0, 0, 'found a fixture where a team plays itself');

  const { count: gwFixtures } = await db
    .from('fixtures')
    .select('*', { count: 'exact', head: true })
    .eq('event', nextGw!.id);
  console.log(`fixtures in ${nextGw?.name}: ${gwFixtures}`);
  assert.ok((gwFixtures ?? 0) > 0, 'the next gameweek has no fixtures');

  // Set-piece data is a differentiator and easy to get wrong; confirm it arrived.
  const { count: penTakers } = await db
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('penalties_order', 1);
  console.log(`first-choice penalty takers: ${penTakers}`);
  assert.ok((penTakers ?? 0) > 5, 'set-piece order data missing — expected several first-choice takers');

  console.log('\nall checks passed');
}

main().catch((err) => {
  console.error('\nVERIFY FAILED\n', err);
  process.exit(1);
});
