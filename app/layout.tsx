import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BOSHI×BOSHI Talk',
  description: 'モダンで美しいLiquid Glass UIのチャット・メモアプリ',
  manifest: '/manifest.json',
};

import Navigation from './components/Navigation';
import PushSubscriber from './components/PushSubscriber';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <PushSubscriber />
        <div className="app-container">
          <Navigation />
          <div className="main-content-area">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
