import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VoiceFlow Agent - 语音驱动工程绘图',
  description: '纯语音控制的 AI 绘图工具，支持流程图、ER 图、架构图',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased h-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
