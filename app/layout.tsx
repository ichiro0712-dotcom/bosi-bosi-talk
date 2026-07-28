import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'BOSHI×BOSHI Talk',
  description: 'モダンで美しいLiquid Glass UIのチャット・メモアプリ',
  manifest: '/manifest.json',
};

// interactive-widget=resizes-content:
//   キーボードが出たときに 100dvh 自体を縮めさせる。 これが無いと
//   ブラウザ既定の overlays-content になり、 レイアウト全体が押し上げられて
//   固定フッター (mobile-bottom-nav) までキーボードと一緒に上がってしまう。
// viewport-fit=cover: env(safe-area-inset-*) を有効にする (既存 CSS が依存)。
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
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
