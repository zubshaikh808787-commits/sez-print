import type { Metadata } from 'next';
import { Fraunces, Source_Sans_3 } from 'next/font/google';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'] });
const sans = Source_Sans_3({ subsets: ['latin'], variable: '--font-sans', weight: ['400', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'SEZ Print Desk', template: '%s · SEZ Print Desk' },
  description: 'Desk for SEZ Print: devices, templates, and feedback.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
