import { requireRole } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { update } from '@/lib/store';
import type { SuggestionStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: SuggestionStatus[] = ['new', 'reviewing', 'planned', 'rejected', 'shipped'];

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireRole('editor');
    const { id } = await ctx.params;
    const body = (await request.json()) as { status?: SuggestionStatus; note?: string };
    if (body.status && !STATUSES.includes(body.status)) throw new HttpError(400, 'Pick a status from the list.');
    const suggestion = await update((db) => {
      const current = db.suggestions.find((item) => item.id === id);
      if (!current) throw new HttpError(404, 'That suggestion is gone.');
      if (body.status) current.status = body.status;
      if (typeof body.note === 'string') current.note = body.note.trim();
      return current;
    });
    return json({ suggestion });
  } catch (error) {
    return fail(error);
  }
}
