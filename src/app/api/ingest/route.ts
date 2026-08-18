import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { JOBS, type JobName } from '@/lib/ingest/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Constant-time compare so the secret can't be recovered by timing the response. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  const expected = process.env.INGEST_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'INGEST_SECRET is not configured' }, { status: 500 });
  }

  // Accept either an Authorization bearer token or a plain header, so this works
  // from pg_net, GitHub Actions and curl without special-casing any of them.
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  const header = request.headers.get('x-ingest-secret');

  if (!secretMatches(auth, expected) && !secretMatches(header, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const job = request.nextUrl.searchParams.get('job') as JobName | null;
  if (!job || !(job in JOBS)) {
    return NextResponse.json(
      { error: `unknown job; expected one of ${Object.keys(JOBS).join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const result = await JOBS[job]();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ingest job "${job}" failed:`, err);
    return NextResponse.json({ job, ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
