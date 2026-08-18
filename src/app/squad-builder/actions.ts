'use server';

import { createClient } from '@/lib/supabase/server';
import { buildSquad, ImpossibleConstraintsError, type BuiltSquad } from '@/lib/ai/squad-builder';
import type { SquadFilters } from '@/lib/ai/schemas';

export interface BuilderState {
  squad?: BuiltSquad;
  error?: string;
  /** Echoed back so the form can keep what the user chose. */
  filters?: SquadFilters;
}

const int = (v: FormDataEntryValue | null): number | undefined => {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
};

const float = (v: FormDataEntryValue | null): number | undefined => {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const str = (v: FormDataEntryValue | null): string | undefined => {
  const s = String(v ?? '').trim();
  return s.length ? s : undefined;
};

/** Comma-separated player ids from the picker inputs. */
const ids = (v: FormDataEntryValue | null): number[] | undefined => {
  const parsed = String(v ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return parsed.length ? parsed : undefined;
};

export async function generateSquad(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  // Auth gate: the middleware protects pages, but a server action is its own
  // entry point and must check for itself.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You need to be signed in.' };

  const budgetMillions = float(formData.get('budget'));

  const filters: SquadFilters = {
    budget: budgetMillions !== undefined ? Math.round(budgetMillions * 10) : 1000,
    horizon:
      (str(formData.get('horizon')) as SquadFilters['horizon'] | undefined) ?? 'short',
    maxPerClub: int(formData.get('maxPerClub')) ?? 3,
    favouriteTeamId: int(formData.get('favouriteTeamId')),
    favouriteTeamCount: int(formData.get('favouriteTeamCount')),
    rivalTeamId: int(formData.get('rivalTeamId')),
    mustIncludeIds: ids(formData.get('mustIncludeIds')),
    mustExcludeIds: ids(formData.get('mustExcludeIds')),
    riskAppetite: float(formData.get('riskAppetite')),
    maxOwnership: float(formData.get('maxOwnership')),
    injuryTolerance: str(formData.get('injuryTolerance')) as SquadFilters['injuryTolerance'],
    emphasis: str(formData.get('emphasis')) as SquadFilters['emphasis'],
    benchPolicy: str(formData.get('benchPolicy')) as SquadFilters['benchPolicy'],
    rotationStyle: str(formData.get('rotationStyle')) as SquadFilters['rotationStyle'],
    premiumStrategy: str(formData.get('premiumStrategy')) as SquadFilters['premiumStrategy'],
    formWeighting: float(formData.get('formWeighting')),
    fixtureBias: formData.get('fixtureBias') === 'on',
    setPieceTakersOnly: formData.get('setPieceTakersOnly') === 'on',
    priceRiseHunter: formData.get('priceRiseHunter') === 'on',
    vibes: str(formData.get('vibes')),
  };

  try {
    const squad = await buildSquad(filters);
    return { squad, filters };
  } catch (err) {
    if (err instanceof ImpossibleConstraintsError) {
      return { error: err.message, filters };
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('squad builder failed:', err);
    return { error: `Could not build a squad: ${message}`, filters };
  }
}

/** Save a generated squad so it can be revisited. */
export async function saveSquad(squad: BuiltSquad, filters: SquadFilters) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'You need to be signed in.' };

  const { error } = await supabase.from('squads').insert({
    user_id: user.id,
    name: squad.name,
    player_ids: squad.squad.playerIds,
    captain_id: squad.captainId,
    vice_captain_id: squad.viceCaptainId,
    formation: squad.squad.formation,
    budget: filters.budget ?? 1000,
    total_cost: squad.squad.cost,
    source: 'ai',
    filters,
    reasoning: {
      strategy: squad.strategy,
      keyRisk: squad.keyRisk,
      notes: squad.players.filter((p) => p.note).map((p) => ({ id: p.id, note: p.note })),
      // Not its own column — this is the one place a draft's projection is
      // kept, purely for display on the drafts list.
      xpts: squad.squad.xpts,
    },
  });

  return error ? { error: error.message } : { ok: true };
}
