import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Nav } from '@/components/nav';
import { CardModalProvider } from '@/components/card-modal';
import { createClient } from '@/lib/supabase/server';
import './globals.css';

// Inter for UI, JetBrains Mono for figures and labels — both neutral, both
// designed for dense screen reading rather than personality.
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });
const mono = JetBrains_Mono({
  variable: '--font-mono-face',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'FPL Dashboard', template: '%s · FPL Dashboard' },
  description: 'Fantasy Premier League analytics, projections and AI squad building.',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // Nav hides itself on the auth screens, where there is no user yet.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | undefined;
  if (user) {
    const { data } = await supabase.from('profiles').select('username').maybeSingle();
    username = data?.username ?? undefined;
  }

  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <CardModalProvider>
          <Nav username={username} />
          {children}
        </CardModalProvider>
      </body>
    </html>
  );
}
