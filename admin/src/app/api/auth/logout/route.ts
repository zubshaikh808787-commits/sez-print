import { cookies } from 'next/headers';
import { COOKIE } from '@/lib/constants';
import { json } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST() {
  const jar = await cookies();
  jar.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return json({ ok: true });
}
