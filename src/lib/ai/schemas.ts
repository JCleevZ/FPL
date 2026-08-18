import { z } from 'zod';

/**
 * Squad Builder filters.
 *
 * Every field is optional and independent. One filter is a valid request; zero
 * filters returns the model's best overall squad. Unset filters never enter the
 * prompt, so the LLM is not told to reason about preferences the user never
 * expressed.
 */
export const squadFiltersSchema = z.object({
  // --- money ---
  /** Tenths of a million, matching the FPL API. 1000 = £100.0m. */
  budget: z.number().int().min(700).max(1200).default(1000),
  /** Money to deliberately leave in the bank. */
  bankReserve: z.number().int().min(0).max(200).optional(),
  premiumStrategy: z.enum(['none', 'one', 'two', 'balanced']).optional(),

  // --- loyalty ---
  /** Club you support: guarantee this many of their players. */
  favouriteTeamId: z.number().int().min(1).max(20).optional(),
  favouriteTeamCount: z.number().int().min(1).max(3).optional(),
  /** Rival club: exclude every one of their players. */
  rivalTeamId: z.number().int().min(1).max(20).optional(),

  // --- anchors ---
  /** Build around these players — locked into the squad. */
  mustIncludeIds: z.array(z.number().int()).max(11).optional(),
  mustExcludeIds: z.array(z.number().int()).max(100).optional(),

  // --- risk ---
  /** 0 = pure template, 1 = maximum differential. */
  riskAppetite: z.number().min(0).max(1).optional(),
  /** Hard ceiling on ownership %, for differential hunting. */
  maxOwnership: z.number().min(0).max(100).optional(),
  injuryTolerance: z.enum(['strict', 'moderate', 'relaxed']).optional(),
  /** Reject players below this start probability. */
  minStartProbability: z.number().min(0).max(1).optional(),

  // --- horizon ---
  horizon: z.enum(['next', 'short', 'medium', 'season']).default('short'),
  /** Building toward a chip in a specific gameweek. */
  chipContext: z
    .object({
      chip: z.enum(['wildcard', 'freehit', 'benchboost', 'triplecaptain']),
      gameweek: z.number().int().min(1).max(38),
    })
    .optional(),

  // --- shape ---
  formationPreference: z.string().regex(/^\d-\d-\d$/).optional(),
  emphasis: z.enum(['attack', 'balanced', 'defence']).optional(),
  maxPerClub: z.number().int().min(1).max(3).default(3),
  /** 'strong' spends real money on the bench, for Bench Boost. */
  benchPolicy: z.enum(['fodder', 'balanced', 'strong']).optional(),

  // --- style ---
  rotationStyle: z.enum(['set-and-forget', 'balanced', 'active']).optional(),
  /** 0 = judge on season stats, 1 = judge on recent form. */
  formWeighting: z.number().min(0).max(1).optional(),
  /** Favour teams with the kindest upcoming fixtures. */
  fixtureBias: z.boolean().optional(),
  /** Only players who take penalties, free kicks or corners. */
  setPieceTakersOnly: z.boolean().optional(),
  /** Bias toward players whose price is about to rise. */
  priceRiseHunter: z.boolean().optional(),

  // --- freeform ---
  /** Anything not covered above. Passed to the LLM verbatim. */
  vibes: z.string().max(500).optional(),
});

export type SquadFilters = z.input<typeof squadFiltersSchema>;
export type ResolvedSquadFilters = z.output<typeof squadFiltersSchema>;

/** Gameweeks each horizon covers. */
export const HORIZON_GAMEWEEKS: Record<ResolvedSquadFilters['horizon'], number> = {
  next: 1,
  short: 6,
  medium: 12,
  season: 38,
};

/**
 * What we ask the LLM for.
 *
 * Note what is NOT here: the LLM does not choose the 15 players from scratch. It
 * picks one of several already-legal squads, may request specific legal swaps,
 * and writes the reasoning. Budget and squad rules are never its responsibility.
 */
export const squadChoiceSchema = z.object({
  /** Index into the candidate squads we supplied. */
  chosenSquadIndex: z.number().int().min(0),
  /**
   * Refinements, applied then re-validated server-side. Send null for none.
   *
   * Nullable rather than optional deliberately: Groq enforces strict JSON schema,
   * where every property must appear in `required`. An optional field is rejected
   * outright, so optionality has to be expressed as "required, may be null" to
   * stay portable across providers.
   */
  swaps: z
    .array(
      z.object({
        outPlayerId: z.number().int(),
        inPlayerId: z.number().int(),
        reason: z.string().max(200),
      }),
    )
    .max(4)
    .nullable(),
  captainId: z.number().int(),
  viceCaptainId: z.number().int(),
  /** Short, punchy squad name. */
  squadName: z.string().min(1).max(60),
  /** The plan, in a couple of sentences. */
  strategy: z.string().min(1).max(900),
  /** The single biggest thing that could go wrong. */
  keyRisk: z.string().min(1).max(400),
  /** One line per notable pick. Need not cover all 15. */
  playerNotes: z
    .array(
      z.object({
        playerId: z.number().int(),
        note: z.string().max(200),
      }),
    )
    .max(15),
});

export type SquadChoice = z.infer<typeof squadChoiceSchema>;
