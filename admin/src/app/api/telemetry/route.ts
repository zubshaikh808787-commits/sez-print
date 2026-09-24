import { requireRole } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { buildTelemetry } from '@/lib/stats';
import { read } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole('viewer');
    return json(await read(buildTelemetry));
  } catch (error) {
    return fail(error);
  }
}
