import type { Metadata } from 'next';
import { DM_Sans, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import './brand.css';
import './motion.css';

const bodyFont = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });
const displayFont = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap' });
const utilityFont = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Workshop Prep Agent — Independent prototype',
  description: 'A standalone synthetic workshop planning prototype. Preparation, source references, and checks for human review.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${bodyFont.variable} ${displayFont.variable} ${utilityFont.variable}`}><body>{children}</body></html>;
}
