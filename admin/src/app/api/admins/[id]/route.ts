import { requireRole } from '@/lib/guard';
import { fail, HttpError, json } from '@/lib/http';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { publicAdmin } from '@/lib/present';
import { update } from '@/lib/store';
import type { Role } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES: Role[] = ['owner', 'editor', 'viewer'];
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const actor = await requireRole('viewer');
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      name?: string;
      password?: string;
      currentPassword?: string;
      role?: Role;
      active?: boolean;
    };
    const admin = await update((db) => {
      const current = db.admins.find((item) => item.id === id);
      if (!current) throw new HttpError(404, 'That person is not on the desk.');
      const self = actor.id === current.id;
      if (!self && actor.role !== 'owner') throw new HttpError(403, 'Only an owner can change someone else.');
      if (typeof body.name === 'string' && body.name.trim()) current.name = body.name.trim();
      if (body.password) {
        if (body.password.length < 8) throw new HttpError(400, 'Use at least 8 characters for the password.');
        if (self && !verifyPassword(body.currentPassword ?? '', current.passwordHash)) {
          throw new HttpError(400, 'Current password does not match.');
        }
        if (!self && actor.role !== 'owner') throw new HttpError(403, 'You cannot change that password.');
        current.passwordHash = hashPassword(body.password);
      }
      if (body.role) {
        if (self) throw new HttpError(400, 'You cannot change your own role.');
        if (actor.role !== 'owner') throw new HttpError(403, 'Only an owner can change roles.');
        if (!ROLES.includes(body.role)) throw new HttpError(400, 'Pick a role.');
        const owners = db.admins.filter((item) => item.role === 'owner' && item.active && item.id !== current.id);
        if (current.role === 'owner' && body.role !== 'owner' && owners.length === 0) {
          throw new HttpError(400, 'Keep at least one owner.');
        }
        current.role = body.role;
      }
      if (typeof body.active === 'boolean') {
        if (self) throw new HttpError(400, 'You cannot disable your own sign-in.');
        if (actor.role !== 'owner') throw new HttpError(403, 'Only an owner can do that.');
        if (!body.active && current.role === 'owner') {
          const owners = db.admins.filter((item) => item.role === 'owner' && item.active && item.id !== current.id);
          if (owners.length === 0) throw new HttpError(400, 'Keep at least one owner.');
        }
        current.active = body.active;
      }
      return publicAdmin(current);
    });
    return json({ admin });
  } catch (error) {
    return fail(error);
  }
}
