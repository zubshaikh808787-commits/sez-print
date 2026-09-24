import { fail, json } from '@/lib/http';
import { publicAdmin } from '@/lib/present';
import { requireRole } from '@/lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await requireRole('viewer');
    return json(publicAdmin(admin));
  } catch (error) {
    return fail(error);
  }
}
