import { requireRole } from '@/lib/guard';
import { fail, json } from '@/lib/http';
import { read } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRole('viewer');
    const suggestions = await read((db) => db.suggestions);
    return json({ suggestions });
  } catch (error) {
    return fail(error);
  }
}
