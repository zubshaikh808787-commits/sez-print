import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE } from '@/lib/constants';
import { verifySession } from '@/lib/session';

export default async function Home() {
  const jar = await cookies();
  const session = await verifySession(jar.get(COOKIE)?.value);
  redirect(session ? '/overview' : '/login');
}
