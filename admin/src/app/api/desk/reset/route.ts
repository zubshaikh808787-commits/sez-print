import { requireRole } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { resetSample } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await requireRole('owner');
    await resetSample();
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
