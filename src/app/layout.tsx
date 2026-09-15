import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { BranchProvider } from '@/context/BranchContext';
import { ThemeProvider } from '@/context/ThemeContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'KitchOS - Hospitality POS & Kitchen Operating System',
  description: 'Multi-tenant F&B management, inventory, KDS and checkout platform.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <BranchProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </BranchProvider>
      </body>
    </html>
  );
}