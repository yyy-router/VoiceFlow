'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  themeVariables: {
    primaryColor: '#fff7ed',
    primaryTextColor: '#1c1c1c',
    primaryBorderColor: '#ea580c',
    lineColor: '#8b8581',
    secondaryColor: '#f5f3f0',
    tertiaryColor: '#faf8f5',
  },
});

export default function DiagramCanvas({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setSvg(null);
      setError(null);
      return;
    }

    mermaid
      .render(`mermaid-${Date.now()}`, code)
      .then(({ svg: r }) => {
        setSvg(r);
        setError(null);
      })
      .catch((e) => {
        setError(e.message || String(e));
        setSvg(null);
      });
  }, [code]);

  if (!code) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-16 h-16 rounded-2xl bg-accent-light flex items-center justify-center">
          <svg className="w-8 h-8 text-accent/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        <p className="text-text-muted text-sm">按住右侧按钮开始语音绘图</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-16 h-16 rounded-2xl bg-danger-light flex items-center justify-center">
          <svg className="w-8 h-8 text-danger/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-danger text-sm font-medium">渲染错误</p>
        <p className="text-text-muted text-xs">请尝试用语音修改图表</p>
        <pre className="text-xs text-text-secondary mt-2 bg-bg-muted p-3 rounded-xl overflow-auto max-w-full border border-border-light">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto flex items-center justify-center"
      style={{
        backgroundImage:
          'radial-gradient(circle, #e8e4df 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
      dangerouslySetInnerHTML={{ __html: svg || '' }}
    />
  );
}
