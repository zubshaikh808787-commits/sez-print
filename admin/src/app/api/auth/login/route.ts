import { cookies } from 'next/headers';
import { fail, HttpError, json } from '@/lib/http';
import { verifyPassword } from '@/lib/passwords';
import { publicAdmin } from '@/lib/present';
import { sessionCookie, signSession } from '@/lib/session';
import { read } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const misses = new Map<string, { n: number; reset: number }>();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; username?: string; password?: string };
    const username = (body.username ?? body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const now = Date.now();
    const row = misses.get(username);
    if (row && row.reset > now && row.n >= 8) {
      throw new HttpError(429, 'Too many tries. Wait a few minutes and try again.');
    }
    const admin = await read(
      (db) =>
        db.admins.find(
          (item) =>
            item.active &&
            (item.email.toLowerCase() === username ||
              (item.id === 'adm_owner' && (username === 'seznikadmin' || username === 'owner@sez.local')))
        ) ?? null
    );
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      const current = misses.get(username);
      if (!current || current.reset < now) misses.set(username, { n: 1, reset: now + 15 * 60 * 1000 });
      else current.n += 1;
      throw new HttpError(401, 'That username or password does not match.');
    }
    misses.delete(username);
    const token = await signSession(admin.id);
    const cookie = sessionCookie(token);
    const jar = await cookies();
    jar.set(cookie.name, cookie.value, cookie.options);
    return json(publicAdmin(admin));
  } catch (error) {
    return fail(error);
  }
}
