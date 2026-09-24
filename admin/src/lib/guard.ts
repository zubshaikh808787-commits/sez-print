import { cookies } from 'next/headers';
import { COOKIE } from './constants';
import { HttpError } from './http';
import { verifySession } from './session';
import { read } from './store';
import type { AdminRecord, Role } from './types';

const rank: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export async function requireRole(min: Role): Promise<AdminRecord> {
  const jar = await cookies();
  const session = await verifySession(jar.get(COOKIE)?.value);
  if (!session) throw new HttpError(401, 'Sign in to continue.');
  const admin = await read((db) => db.admins.find((item) => item.id === session.id) ?? null);
  if (!admin || !admin.active) throw new HttpError(401, 'Sign in to continue.');
  if (rank[admin.role] < rank[min]) throw new HttpError(403, 'You do not have access to that.');
  return admin;
}
