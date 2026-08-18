/**
 * Run an ingest job locally, without deploying.
 *
 *   npm run ingest snapshot
 *   npm run ingest fixtures
 *   npm run ingest all
 *
 * Reads credentials from .env.local.
 */

import 'dotenv/config';
import { config } from 'dotenv';
import type { JobName } from '../src/lib/ingest/jobs';

config({ path: '.env.local', override: true });

async function main() {
  // Imported after dotenv so the admin client sees the env vars.
  const { JOBS } = await import('../src/lib/ingest/jobs');

  const arg = (process.argv[2] ?? 'snapshot') as JobName | 'all';
  const names = (arg === 'all' ? Object.keys(JOBS) : [arg]) as JobName[];

  for (const name of names) {
    if (!(name in JOBS)) {
      console.error(`unknown job "${name}". Options: ${Object.keys(JOBS).join(', ')}, all`);
      process.exit(1);
    }
  }

  for (const name of names) {
    process.stdout.write(`running ${name}... `);
    try {
      const result = await JOBS[name]();
      const counts = Object.entries(result.counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      console.log(`ok (${result.ms}ms) ${counts}${result.note ? ` — ${result.note}` : ''}`);
    } catch (err) {
      console.log('FAILED');
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  }
}

main();
