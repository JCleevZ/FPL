/**
 * LLM access with a provider fallback chain and a persistent result cache.
 *
 * Free tiers are generous but finite (Gemini 1500/day, Groq 1000/day). Two things
 * keep us inside them:
 *   - falling through to the next provider on rate limits rather than failing
 *   - caching every result by a hash of its input, so the same request is free
 *     the second time
 */

import { createHash } from 'node:crypto';
import { generateObject, type LanguageModel } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import type { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

interface Provider {
  name: string;
  model: string;
  build(): LanguageModel;
}

/**
 * Ordered by preference. Gemini first: its 1M-token context means we can hand it
 * the whole candidate pool with fixtures in one call. Groq second, because 300+
 * tokens/sec makes it the better interactive fallback.
 */
function providers(): Provider[] {
  const list: Provider[] = [];

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    // The floating alias, deliberately: Google rotates model names constantly
    // (gemini-3-flash 404s, 3.5/3.6/3.7-flash all exist right now) and a pinned
    // name silently becomes a 404 later. Override with GEMINI_MODEL to pin one.
    const model = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
    list.push({ name: 'google', model, build: () => google(model) });
  }

  if (process.env.GROQ_API_KEY) {
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    // Groq's catalogue churns too — the Llama 3.x models are gone. Verify against
    // https://api.groq.com/openai/v1/models if this ever starts 404ing.
    const model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
    list.push({ name: 'groq', model, build: () => groq(model) });
  }

  return list;
}

export class NoProviderError extends Error {
  constructor() {
    super(
      'No LLM provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY.',
    );
    this.name = 'NoProviderError';
  }
}

/**
 * Whether it is worth trying the next provider.
 *
 * Always yes. Every plausible failure is provider-specific: rate limits, a
 * retired model name, a bad key, or a weaker model failing to produce valid
 * structured output. An earlier version bailed out on "non-retryable" errors to
 * save quota, and the result was that a wrong Gemini model name meant Groq was
 * never tried at all — the fallback chain silently did nothing. With two
 * providers the cost of always trying is one extra request.
 */
const shouldTryNextProvider = () => true;

export const hashInput = (kind: string, input: unknown): string =>
  createHash('sha256').update(`${kind}:${JSON.stringify(input)}`).digest('hex');

export interface GenerateOptions<T> {
  /** Cache namespace, e.g. 'squad' | 'scout' | 'captain'. */
  kind: string;
  /** Hashed for the cache key — must fully determine the output. */
  input: unknown;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  /** Skip the cache lookup (still writes). */
  fresh?: boolean;
}

export interface GenerateResult<T> {
  object: T;
  provider: string;
  model: string;
  cached: boolean;
}

/**
 * Generate a schema-validated object, trying each provider in turn.
 *
 * Structured output means a malformed response is a thrown error rather than
 * something that reaches the UI as garbage.
 */
export async function generateWithFallback<T>(
  opts: GenerateOptions<T>,
): Promise<GenerateResult<T>> {
  const available = providers();
  if (available.length === 0) throw new NoProviderError();

  const inputHash = hashInput(opts.kind, opts.input);
  const db = createAdminClient();

  if (!opts.fresh) {
    const { data } = await db
      .from('ai_generations')
      .select('output, provider, model')
      .eq('input_hash', inputHash)
      .maybeSingle();

    if (data) {
      // Re-validate: a cached row written by an older schema version must not
      // slip through unchecked.
      const parsed = opts.schema.safeParse(data.output);
      if (parsed.success) {
        return {
          object: parsed.data,
          provider: data.provider ?? 'cache',
          model: data.model ?? 'cache',
          cached: true,
        };
      }
    }
  }

  const errors: string[] = [];

  for (const provider of available) {
    try {
      const { object } = await generateObject({
        model: provider.build(),
        schema: opts.schema,
        system: opts.system,
        prompt: opts.prompt,
      });

      // Cache misses are cheap; a failed cache write should not lose the result.
      const { error } = await db.from('ai_generations').upsert(
        {
          kind: opts.kind,
          input_hash: inputHash,
          input: opts.input as object,
          output: object as object,
          provider: provider.name,
          model: provider.model,
        },
        { onConflict: 'input_hash' },
      );
      if (error) console.error('ai cache write failed:', error.message);

      return { object, provider: provider.name, model: provider.model, cached: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.name}: ${message}`);
      console.warn(`ai provider ${provider.name} failed, falling through:`, message);
      if (!shouldTryNextProvider()) break;
    }
  }

  throw new Error(`All LLM providers failed. ${errors.join(' | ')}`);
}
