import fs from 'fs/promises';
import path from 'path';
import { UPLOADS_DIR, mimeFor } from '@/lib/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { name } = await ctx.params;
  if (!/^[\w.-]+$/.test(name)) return new Response('Bad file', { status: 400 });
  const mime = mimeFor(name);
  if (!mime) return new Response('Not found', { status: 404 });
  try {
    const bytes = await fs.readFile(path.join(UPLOADS_DIR, name));
    return new Response(bytes, {
      headers: {
        'Content-Type': mime,
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
