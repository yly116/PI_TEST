import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '坦克大战 · Tank Battle',
  description:
    '经典 Battle City 风格的坦克大战游戏，使用 Next.js 与 Canvas 打造。保护基地，消灭敌军，挑战三关。',
  keywords: ['坦克大战', 'Tank Battle', 'Battle City', 'Next.js', '小游戏'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05080a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
