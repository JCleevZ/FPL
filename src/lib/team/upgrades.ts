/**
 * Upgrade ideas for a squad that is already full.
 *
 * "Add a player" has no meaning once all 15 slots are taken — there is no spare
 * slot to add into. What actually helps is a swap: sell the weakest player in a
 * position, buy someone projected to outscore them, for a price only affordable
 * because selling freed up cash.
 */

import { canAdd, shadowTeamWithout, type MyTeam } from '@/lib/team/my-team';
import type { Position } from '@/lib/fpl/types';
import type { Recommendation } from '@/lib/model/recommendations';

export interface UpgradeIdea {
  position: Position;
  out: { id: number; web_name: string; xpts: number };
  /** Legal replacements, best first. */
  candidates: Recommendation[];
}

export function getUpgradeIdeas(
  team: MyTeam,
  insights: Map<number, Recommendation>,
  maxPerPosition = 2,
): UpgradeIdea[] {
  const ownedIds = new Set(team.players.map((p) => p.id));
  const ideas: UpgradeIdea[] = [];

  for (const pos of [1, 2, 3, 4] as Position[]) {
    const owned = team.players.filter((p) => p.position === pos);
    if (owned.length === 0) continue;

    const xptsOf = (id: number) => insights.get(id)?.xpts ?? -Infinity;
    const weakest = owned.reduce((worst, p) => (xptsOf(p.id) < xptsOf(worst.id) ? p : worst));
    const weakestXpts = xptsOf(weakest.id);

    const shadow = shadowTeamWithout(team, weakest.id);

    const candidates = [...insights.values()]
      .filter((r) => r.position === pos)
      .filter((r) => !ownedIds.has(r.id))
      .filter((r) => r.xpts > weakestXpts)
      .filter(
        (r) =>
          canAdd(shadow, {
            id: r.id,
            position: r.position,
            team_id: r.team_id,
            now_cost: r.now_cost,
            web_name: r.web_name,
          }) === null,
      )
      .sort((a, b) => b.xpts - a.xpts)
      .slice(0, maxPerPosition);

    if (candidates.length > 0) {
      ideas.push({
        position: pos,
        out: { id: weakest.id, web_name: weakest.web_name, xpts: Math.round(weakestXpts * 10) / 10 },
        candidates,
      });
    }
  }

  return ideas;
}
