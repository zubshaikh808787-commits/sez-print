import { requireRole } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { isEmail, nid } from '@/lib/format';
import { hashPassword } from '@/lib/passwords';
import { publicAdmin } from '@/lib/present';
import { read, update } from '@/lib/store';
import type { Role } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['owner', 'editor', 'viewer'];

export async function GET() {
  try {
    await requireRole('viewer');
    const admins = await read((db) => db.admins.map(publicAdmin));
    return json({ admins });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireRole('owner');
    const body = (await request.json()) as { name?: string; email?: string; password?: string; role?: Role };
    const name = (body.name ?? '').trim();
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const role = body.role ?? 'editor';
    if (!name) throw new HttpError(400, 'Add a name.');
    if (!isEmail(email)) throw new HttpError(400, 'That email does not look right.');
    if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for the password.');
    if (!ROLES.includes(role)) throw new HttpError(400, 'Pick a role.');
    const admin = await update((db) => {
      if (db.admins.some((item) => item.email === email)) throw new HttpError(400, 'That email is already on the desk.');
      const created = {
        id: nid('adm'),
        name,
        email,
        role,
        active: true,
        createdAt: new Date().toISOString(),
        passwordHash: hashPassword(password),
      };
      db.admins.push(created);
      return publicAdmin(created);
    });
    return json({ admin }, 201);
  } catch (error) {
    return fail(error);
  }
}
