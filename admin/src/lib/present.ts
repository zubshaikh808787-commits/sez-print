import type { Admin, AdminRecord } from './types';

export function publicAdmin(admin: AdminRecord): Admin {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    active: admin.active,
    createdAt: admin.createdAt,
  };
}
