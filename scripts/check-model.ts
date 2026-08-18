/**
 * Runnable check for the projections engine and the squad optimiser.
 *
 *   npm run check:model
 *
 * Hits the live FPL API — no database or API keys needed. The important
 * assertion is the last one: across many randomised filter combinations, every
 * squad the optimiser returns must be legal. If that holds, the Squad Builder
 * cannot produce an embarrassing result.
 */

import assert from 'node:assert/strict';
import { getBootstrap, getFixtures } from '../src/lib/fpl/client';
import {
  inferMatchesPlayed,
  projectGameweek,
  projectRange,
  resolveStrength,
  type PlayerInput,
  type TeamInput,
} from '../src/lib/model/projections';
import {
  buildSquads,
  validateSquad,
  SQUAD_QUOTA,
  type Candidate,
  type Constraints,
} from '../src/lib/model/optimiser';
import { POSITION_NAME, type Position } from '../src/lib/fpl/types';

const num = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function main() {
  console.log('fetching live FPL data...');
  const [bs, fixtures] = await Promise.all([getBootstrap(), getFixtures()]);

  const players: PlayerInput[] = bs.elements.map((p) => ({
    id: p.id,
    team_id: p.team,
    position: p.element_type,
    now_cost: p.now_cost,
    status: p.status,
    chance_of_playing_next_round: p.chance_of_playing_next_round,
    minutes: p.minutes,
    starts: p.starts,
    expected_goals_per_90: num(p.expected_goals_per_90),
    expected_assists_per_90: num(p.expected_assists_per_90),
    expected_goals_conceded_per_90: num(p.expected_goals_conceded_per_90),
    saves_per_90: num(p.saves_per_90),
    defensive_contribution_per_90: num(p.defensive_contribution_per_90),
    bps: p.bps,
    form: num(p.form),
    selected_by_percent: num(p.selected_by_percent),
    yellow_cards: p.yellow_cards,
  }));

  const teams: TeamInput[] = bs.teams.map((t) => ({
    id: t.id,
    strength_overall_home: t.strength_overall_home,
    strength_overall_away: t.strength_overall_away,
    strength_attack_home: t.strength_attack_home,
    strength_attack_away: t.strength_attack_away,
    strength_defence_home: t.strength_defence_home,
    strength_defence_away: t.strength_defence_away,
  }));

  const nextGw = bs.events.find((e) => e.is_next) ?? bs.events.find((e) => e.is_current);
  assert.ok(nextGw, 'expected a current or next gameweek');
  const from = nextGw.id;
  const to = Math.min(38, from + 5);

  const strength = resolveStrength(teams);
  const matches = inferMatchesPlayed(players);
  console.log(
    `projecting GW${from}-${to} for ${players.length} players ` +
      `(strength source: ${strength.source}, stats cover ~${matches} matches)\n`,
  );

  // The model must never silently fall back to flat multipliers without us
  // knowing — that is what made every projection collapse the first time.
  assert.notEqual(
    strength.source,
    'neutral',
    'no usable team strength data at all — projections would be fixture-blind',
  );
  assert.ok(matches > 0, 'no player has any starts; cannot calibrate start probability');

  // --- projections ---------------------------------------------------------

  const totals = projectRange(players, teams, fixtures, from, to);

  assert.equal(totals.size, players.length, 'every player should get a projection');
  for (const [id, xpts] of totals) {
    assert.ok(Number.isFinite(xpts), `xpts for player ${id} is not finite: ${xpts}`);
    assert.ok(xpts >= 0, `xpts for player ${id} is negative: ${xpts}`);
  }
  console.log('  ok  all projections finite and non-negative');

  const byId = new Map(players.map((p) => [p.id, p]));
  const nameById = new Map(bs.elements.map((p) => [p.id, p.web_name]));

  // A premium forward should beat cheap bench fodder. If this ever fails the
  // model is broken in a way no amount of AI polish would hide.
  const premiumFwds = players
    .filter((p) => p.position === 4 && p.now_cost >= 90)
    .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));
  const cheapDefs = players.filter((p) => p.position === 2 && p.now_cost <= 40);

  if (premiumFwds.length && cheapDefs.length) {
    const bestPremium = totals.get(premiumFwds[0].id) ?? 0;
    const bestCheap = Math.max(...cheapDefs.map((p) => totals.get(p.id) ?? 0));
    assert.ok(
      bestPremium > bestCheap,
      `premium forward (${bestPremium.toFixed(1)}) should out-project cheap defenders (${bestCheap.toFixed(1)})`,
    );
    console.log(
      `  ok  ${nameById.get(premiumFwds[0].id)} ${bestPremium.toFixed(1)} > best £4.0m def ${bestCheap.toFixed(1)}`,
    );
  }

  // --- calibration against FPL's own expected points ------------------------
  //
  // `ep_next` is a loose anchor, not truth: preseason it is deliberately
  // conservative (it rates Haaland 4.0 a gameweek when he averaged 6.8 points
  // last season). So we do not chase its absolute values — we check that our
  // *ordering* agrees within each position, and that nothing implausible has
  // floated to the top.
  const regulars = bs.elements.filter((p) => p.minutes >= 900 && parseFloat(p.ep_next ?? '0') > 0);
  assert.ok(
    regulars.length > 50,
    `expected plenty of regulars to calibrate against, got ${regulars.length}`,
  );

  const gwCount = to - from + 1;
  const perGw = (id: number) => (totals.get(id) ?? 0) / gwCount;
  const pStartById = new Map(
    projectGameweek(players, teams, fixtures, from, matches).map((p) => [p.player_id, p.p_start]),
  );

  console.log('\ncalibration vs FPL ep_next (rank correlation within position):');
  // Compared within position, because points mean different things for a
  // goalkeeper and a forward — mixing them measures scale, not agreement.
  //
  // Restricted to players our model considers nailed. `ep_next` assumes every
  // player starts, so for rotation risks it carries no ordering information at
  // all (just 10 distinct values across ~100 defenders). Measured on that
  // population rho sits near 0.37; among genuine starters, where both models
  // actually know something, it rises to 0.63-0.88.
  const nailed = regulars.filter((p) => (pStartById.get(p.id) ?? 0) >= 0.7);

  for (const pos of [2, 3, 4] as Position[]) {
    const group = nailed.filter((p) => p.element_type === pos);
    if (group.length < 15) {
      console.log(`  ${POSITION_NAME[pos]} — only ${group.length} nailed players, skipped`);
      continue;
    }
    const rho = spearman(
      group.map((p) => perGw(p.id)),
      group.map((p) => parseFloat(p.ep_next!)),
    );
    console.log(`  ${POSITION_NAME[pos]} (n=${group.length})  rho = ${rho.toFixed(3)}`);
    assert.ok(
      rho > 0.55,
      `${POSITION_NAME[pos]} projections disagree with FPL's ordering among nailed starters ` +
        `(rho=${rho.toFixed(3)}) — likely a miscalibrated term`,
    );
  }

  // Scale: we expect to sit above ep_next, but not by a wild multiple. The
  // median is used so one odd player cannot trip it.
  const ratios = regulars.map((p) => perGw(p.id) / parseFloat(p.ep_next!)).sort((a, b) => a - b);
  const medianRatio = ratios[Math.floor(ratios.length / 2)];
  console.log(`  median ratio to ep_next: ${medianRatio.toFixed(2)}x`);
  assert.ok(
    medianRatio > 0.7 && medianRatio < 2.2,
    `overall scale is off: median ${medianRatio.toFixed(2)}x FPL's estimate`,
  );

  // The failure mode that actually matters: something absurd topping the chart.
  // Every player in our top 10 must be someone FPL also rates above average.
  //
  // Deliberately run over EVERY player, not just regulars: the bug this exists
  // to catch was a squad midfielder with 100 minutes whose per-90 rates were
  // extrapolated from a single lucky shot. Filtering to regulars first would
  // have hidden exactly the player we needed to see.
  const rated = bs.elements.filter((p) => parseFloat(p.ep_next ?? '0') > 0);
  const epValues = rated.map((p) => parseFloat(p.ep_next!)).sort((a, b) => a - b);
  const medianEp = epValues[Math.floor(epValues.length / 2)];
  const ourTop10 = rated
    .slice()
    .sort((a, b) => perGw(b.id) - perGw(a.id))
    .slice(0, 10);

  for (const p of ourTop10) {
    assert.ok(
      parseFloat(p.ep_next!) >= medianEp,
      `${p.web_name} is in our top 10 but FPL rates him ${p.ep_next} (below the ${medianEp} median) — a term has run away`,
    );
  }
  console.log(`  ok  our top 10 are all rated above FPL's median (${medianEp})`);

  // And we should broadly agree with FPL about who the best players are.
  const fplTop15 = new Set(
    rated
      .slice()
      .sort((a, b) => parseFloat(b.ep_next!) - parseFloat(a.ep_next!))
      .slice(0, 15)
      .map((p) => p.id),
  );
  const overlap = ourTop10.filter((p) => fplTop15.has(p.id)).length;
  console.log(`  ok  ${overlap}/10 of our top 10 appear in FPL's top 15`);
  assert.ok(overlap >= 3, `only ${overlap} of our top 10 are in FPL's top 15 — too little agreement`);

  console.log('\ntop 10 projected:');
  [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([id, xpts], i) => {
      const p = byId.get(id)!;
      console.log(
        `  ${String(i + 1).padStart(2)}. ${(nameById.get(id) ?? '').padEnd(16)} ` +
          `${POSITION_NAME[p.position as Position]} £${(p.now_cost / 10).toFixed(1)}m  ${xpts.toFixed(1)} pts`,
      );
    });

  // --- candidate pool ------------------------------------------------------

  // Mirror the real pipeline: narrow to a manageable pool before optimising.
  const all: Candidate[] = players.map((p) => ({
    id: p.id,
    position: p.position,
    team_id: p.team_id,
    cost: p.now_cost,
    xpts: totals.get(p.id) ?? 0,
    ownership: p.selected_by_percent,
    web_name: nameById.get(p.id) ?? String(p.id),
  }));

  const candidates: Candidate[] = [];
  for (const pos of [1, 2, 3, 4] as Position[]) {
    const forPos = all.filter((c) => c.position === pos).sort((a, b) => b.xpts - a.xpts);
    // Keep the best, plus the cheapest, so budget squads remain completable.
    const best = forPos.slice(0, 30);
    const cheapest = [...forPos].sort((a, b) => a.cost - b.cost).slice(0, 12);
    const merged = new Map([...best, ...cheapest].map((c) => [c.id, c]));
    candidates.push(...merged.values());
  }
  console.log(`\ncandidate pool: ${candidates.length} players`);

  const pool = new Map(candidates.map((c) => [c.id, c]));

  // --- baseline build ------------------------------------------------------

  const baseline = buildSquads(candidates);
  assert.ok(baseline.length > 0, 'expected at least one squad with default constraints');
  console.log('\nbaseline squads:');
  for (const { style, squad } of baseline) {
    console.log(
      `  ${style.padEnd(11)} £${(squad.cost / 10).toFixed(1)}m  ${squad.formation}  ${squad.xpts} xpts  ` +
        `(C) ${pool.get(squad.captainId)?.web_name}`,
    );
  }

  // --- the important one: legality under randomised constraints -------------

  const random = rng(20260817);
  const teamIds = bs.teams.map((t) => t.id);
  let built = 0;
  let infeasible = 0;

  for (let i = 0; i < 60; i++) {
    const c: Partial<Constraints> = {};

    // Budget between £95.0m and £103.0m.
    c.budget = 950 + Math.floor(random() * 80);

    // Sometimes tighten the club limit.
    c.maxPerClub = random() < 0.25 ? 2 : 3;

    // Sometimes lock in one or two players to build around.
    const mustInclude: number[] = [];
    if (random() < 0.6) {
      const picks = 1 + Math.floor(random() * 2);
      for (let k = 0; k < picks; k++) {
        const cand = candidates[Math.floor(random() * candidates.length)];
        if (!mustInclude.includes(cand.id)) mustInclude.push(cand.id);
      }
    }
    c.mustInclude = mustInclude;

    // Sometimes ban a rival club's players outright.
    const mustExclude: number[] = [];
    if (random() < 0.4) {
      const banned = teamIds[Math.floor(random() * teamIds.length)];
      mustExclude.push(...candidates.filter((p) => p.team_id === banned).map((p) => p.id));
    }
    c.mustExclude = mustExclude;

    // Sometimes demand players from the club you support.
    if (random() < 0.35) {
      c.minFromClub = {
        teamId: teamIds[Math.floor(random() * teamIds.length)],
        count: 1 + Math.floor(random() * 2),
      };
    }

    const squads = buildSquads(candidates, c);

    if (squads.length === 0) {
      // Genuinely impossible combinations exist (tiny budget + three locked
      // premiums). What must never happen is an *illegal* squad.
      infeasible++;
      continue;
    }

    for (const { style, squad } of squads) {
      built++;
      const full: Constraints = {
        budget: c.budget!,
        maxPerClub: c.maxPerClub!,
        mustInclude: c.mustInclude!,
        mustExclude: c.mustExclude!,
        minFromClub: c.minFromClub,
      };
      const result = validateSquad(squad.playerIds, pool, full);
      assert.ok(
        result.valid,
        `case ${i} (${style}) produced an illegal squad: ${result.errors.join('; ')}`,
      );

      // XI/bench must partition the 15 exactly.
      assert.equal(squad.startingXI.length, 11, `case ${i}: XI must be 11`);
      assert.equal(squad.bench.length, 4, `case ${i}: bench must be 4`);
      assert.equal(
        new Set([...squad.startingXI, ...squad.bench]).size,
        15,
        `case ${i}: XI + bench must be the 15 distinct squad players`,
      );
      assert.ok(
        squad.startingXI.includes(squad.captainId),
        `case ${i}: captain must be in the starting XI`,
      );
      assert.notEqual(
        squad.captainId,
        squad.viceCaptainId,
        `case ${i}: captain and vice must differ`,
      );
    }
  }

  const totalQuota = Object.values(SQUAD_QUOTA).reduce((a, b) => a + b, 0);
  assert.equal(totalQuota, 15, 'squad quota must sum to 15');

  console.log(
    `\n  ok  ${built} squads across 60 randomised constraint sets, all legal ` +
      `(${infeasible} sets infeasible, correctly refused)`,
  );
  console.log('\nall checks passed');
}

/** Spearman rank correlation — compares orderings, not absolute values. */
function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]): number[] => {
    const order = xs.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const ranks = new Array<number>(xs.length);
    let i = 0;
    while (i < order.length) {
      // Average the ranks of ties, otherwise ties bias the correlation.
      let j = i;
      while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  };

  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / n;
  const ma = mean(ra);
  const mb = mean(rb);

  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

main().catch((err) => {
  console.error('\nCHECK FAILED\n', err);
  process.exit(1);
});
