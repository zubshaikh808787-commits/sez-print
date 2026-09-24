import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="main">
      <h1>That page is not on the desk.</h1>
      <p><Link href="/overview">Back to overview</Link></p>
    </main>
  );
}
