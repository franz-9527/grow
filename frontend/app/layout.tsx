import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '一方菜园 V5.5',
  description: '绍兴越城区的现实菜园管理系统',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
