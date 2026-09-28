import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Atlas — Map Studio',
  description:
    'Create expressive world maps with an AI assistant and open data. Bring your own AI provider.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
