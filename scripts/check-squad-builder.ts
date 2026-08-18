/**
 * End-to-end check of the AI Squad Builder.
 *
 *   npm run check:squad
 *
 * Hits the real database and the real LLM. Proves the four stages compose, that
 * a single filter is enough to get a squad, and — most importantly — that every
 * squad returned is legal no matter what the model said.
 */

import assert from 'node:assert/strict';
import 'dotenv/config';
import { config } from 'dotenv';

config({ path: '.env.local', override: true });

async function main() {
  const { buildSquad, ImpossibleConstraintsError } = await import('../src/lib/ai/squad-builder');
  const { validateSquad } = await import('../src/lib/model/optimiser');
  const { createAdminClient } = await import('../src/lib/supabase/admin');
  const { POSITION_NAME } = await import('../src/lib/fpl/types');

  const db = createAdminClient();
  const { data: teams } = await db.from('teams').select('id, short_name, name');
  const teamByShort = new Map((teams ?? []).map((t) => [t.short_name as string, t.id as number]));

  // A recognisable premium to build around, chosen from real data.
  const { data: anchor } = await db
    .from('players')
    .select('id, web_name, now_cost')
    .order('now_cost', { ascending: false })
    .limit(1)
    .single();

  const show = (label: string, built: Awaited<ReturnType<typeof buildSquad>>) => {
    console.log(`\n--- ${label} ---`);
    console.log(
      `"${built.name}"  £${(built.squad.cost / 10).toFixed(1)}m  ${built.squad.formation}  ` +
        `${built.squad.xpts} xPts  GW${built.horizonGameweeks[0]}-${built.horizonGameweeks[1]}  ` +
        `[${built.provider}/${built.model}${built.cached ? ', cached' : ''}]`,
    );
    if (built.fallbackReason) console.log(`  ! fell back: ${built.fallbackReason}`);
    console.log(`  strategy: ${built.strategy}`);
    console.log(`  risk:     ${built.keyRisk}`);
    for (const p of built.players) {
      const role =
        p.id === built.captainId ? '(C)' : p.id === built.viceCaptainId ? '(V)' : '   ';
      const starting = built.squad.startingXI.includes(p.id) ? ' ' : '·';
      console.log(
        `  ${starting}${role} ${POSITION_NAME[p.position]} ${p.web_name.padEnd(14)} ${p.teamShort.padEnd(4)} ` +
          `£${(p.cost / 10).toFixed(1)}m ${p.xpts.toFixed(1)}xp` +
          (p.note ? `  — ${p.note}` : ''),
      );
    }
  };

  /** Independent re-verification, not trusting the builder's own validator. */
  const assertLegal = (label: string, built: Awaited<ReturnType<typeof buildSquad>>, budget = 1000) => {
    const pool = new Map(built.players.map((p) => [p.id, p]));
    const result = validateSquad(built.squad.playerIds, pool, {
      budget,
      maxPerClub: 3,
      mustInclude: [],
      mustExclude: [],
    });
    assert.ok(result.valid, `${label}: illegal squad — ${result.errors.join('; ')}`);

    assert.equal(built.squad.playerIds.length, 15, `${label}: not 15 players`);
    assert.equal(built.squad.startingXI.length, 11, `${label}: XI is not 11`);
    assert.equal(built.squad.bench.length, 4, `${label}: bench is not 4`);
    assert.ok(
      built.squad.startingXI.includes(built.captainId),
      `${label}: captain is not in the starting XI`,
    );
    assert.notEqual(built.captainId, built.viceCaptainId, `${label}: captain and vice are the same`);
    assert.ok(built.name.length > 0, `${label}: squad has no name`);
    assert.ok(built.strategy.length > 20, `${label}: strategy is too thin to be useful`);

    const counts = new Map<number, number>();
    for (const p of built.players) counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
    assert.equal(counts.get(1), 2, `${label}: need exactly 2 GK`);
    assert.equal(counts.get(2), 5, `${label}: need exactly 5 DEF`);
    assert.equal(counts.get(3), 5, `${label}: need exactly 5 MID`);
    assert.equal(counts.get(4), 3, `${label}: need exactly 3 FWD`);
  };

  // 1. The headline promise: a single filter is a complete request.
  console.log('case 1: one filter only — build around the most expensive player');
  const one = await buildSquad({ mustIncludeIds: [anchor!.id] });
  show(`build around ${anchor!.web_name}`, one);
  assertLegal('case 1', one);
  assert.ok(
    one.squad.playerIds.includes(anchor!.id),
    `case 1: ${anchor!.web_name} was requested but is not in the squad`,
  );

  // 2. No filters at all.
  console.log('\ncase 2: no filters at all');
  const none = await buildSquad({});
  show('default', none);
  assertLegal('case 2', none);

  // 3. Several filters interacting, including a real club allegiance.
  const arsenal = teamByShort.get('ARS');
  const spurs = teamByShort.get('TOT');
  console.log('\ncase 3: supports Arsenal, refuses Spurs, differentials, tight budget');
  const combo = await buildSquad({
    budget: 980,
    favouriteTeamId: arsenal,
    favouriteTeamCount: 2,
    rivalTeamId: spurs,
    riskAppetite: 0.8,
    emphasis: 'attack',
    maxPerClub: 2,
    vibes: 'I want something fun that my mates will not have',
  });
  show('Arsenal fan, anti-Spurs, maverick', combo);
  assertLegal('case 3', combo, 980);

  const arsenalCount = combo.players.filter((p) => p.team_id === arsenal).length;
  assert.ok(arsenalCount >= 2, `case 3: wanted 2+ Arsenal players, got ${arsenalCount}`);
  assert.equal(
    combo.players.filter((p) => p.team_id === spurs).length,
    0,
    'case 3: excluded club appears in the squad',
  );
  const overClubLimit = [...new Map<number, number>(
    combo.players.reduce((m, p) => m.set(p.team_id, (m.get(p.team_id) ?? 0) + 1), new Map()),
  )].filter(([, n]) => n > 2);
  assert.equal(overClubLimit.length, 0, 'case 3: max 2 per club was violated');

  // 4. Impossible constraints must be refused, not fudged.
  console.log('\ncase 4: impossible constraints');
  await assert.rejects(
    () => buildSquad({ budget: 700, mustIncludeIds: [anchor!.id], maxOwnership: 0.1 }),
    (err: unknown) => err instanceof ImpossibleConstraintsError,
    'case 4: expected impossible filters to be refused with a clear error',
  );
  console.log('  ok  refused with a clear error rather than returning a broken squad');

  // 5. The cache should make an identical request free.
  console.log('\ncase 5: cache');
  const again = await buildSquad({ mustIncludeIds: [anchor!.id] });
  assert.ok(again.cached || again.provider === 'optimiser', 'case 5: expected a cache hit');
  console.log(`  ok  repeat request served from ${again.cached ? 'cache' : again.provider}`);

  // 6. The fallback chain must actually fall through.
  //
  // Regression guard: a wrong Gemini model name used to abort the whole chain, so
  // Groq was never tried and every request silently degraded to the optimiser.
  // Point Gemini at a model that cannot exist and confirm Groq answers.
  console.log('\ncase 6: provider fallback (Gemini deliberately broken)');
  const realModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_MODEL = 'gemini-does-not-exist';
  try {
    const fellThrough = await buildSquad({ budget: 995, emphasis: 'defence' });
    show('fallback to Groq', fellThrough);
    assertLegal('case 6', fellThrough, 995);
    assert.equal(
      fellThrough.provider,
      'groq',
      `expected Groq to answer when Gemini is broken, got "${fellThrough.provider}" ` +
        `(${fellThrough.fallbackReason ?? 'no reason given'})`,
    );
    console.log('  ok  Gemini failed and Groq answered');
  } finally {
    if (realModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = realModel;
  }

  // 7. Filter robustness.
  //
  // Regression guard: ordinary filter choices used to make the builder give up
  // entirely. "Fully fit only" filtered on start probability rather than
  // fitness, and any ownership cap stripped out the cheap bench players a legal
  // 15 needs. Every combination below must produce a squad.
  console.log('\ncase 7: filter robustness');
  const robustness: [string, Parameters<typeof buildSquad>[0]][] = [
    ['fully fit only', { injuryTolerance: 'strict' }],
    ['maverick risk', { riskAppetite: 1 }],
    ['maverick + fully fit', { riskAppetite: 1, injuryTolerance: 'strict' }],
    ['ownership under 5%', { maxOwnership: 5 }],
    ['set-piece takers only', { setPieceTakersOnly: true }],
    ['set-piece + fully fit', { setPieceTakersOnly: true, injuryTolerance: 'strict' }],
    ['two per club', { maxPerClub: 2 }],
    ['one per club', { maxPerClub: 1 }],
    ['tight budget', { budget: 850 }],
    ['fully fit + two per club', { injuryTolerance: 'strict', maxPerClub: 2 }],
  ];

  for (const [name, filters] of robustness) {
    const result = await buildSquad(filters);
    assertLegal(`case 7 (${name})`, result, filters.budget ?? 1000);
    const note = result.relaxations.length ? ` [relaxed: ${result.relaxations.length}]` : '';
    console.log(
      `  ok  ${name.padEnd(24)} £${(result.squad.cost / 10).toFixed(1)}m ${result.squad.formation}${note}`,
    );
  }

  // Genuinely contradictory constraints must be named, not shrugged at.
  await assert.rejects(
    () => buildSquad({ favouriteTeamId: arsenal, favouriteTeamCount: 3, maxPerClub: 2 }),
    (err: unknown) =>
      err instanceof ImpossibleConstraintsError && /capped every club at 2/.test(err.message),
    'expected a specific explanation for asking 3 from one club with a 2-per-club cap',
  );
  console.log('  ok  contradictory filters explained precisely');

  console.log('\nall squad builder checks passed');
}

main().catch((err) => {
  console.error('\nCHECK FAILED\n', err);
  process.exit(1);
});
