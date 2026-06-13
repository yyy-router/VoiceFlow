'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
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

  // Center diagram on initial render
  useEffect(() => {
    if (!svg || !containerRef.current) return;
    const timer = requestAnimationFrame(() => {
      const svgEl = containerRef.current?.querySelector('svg') as SVGSVGElement | null;
      if (!svgEl) return;
      const container = containerRef.current!;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const sw = svgEl.getBoundingClientRect().width;
      const sh = svgEl.getBoundingClientRect().height;
      setOffset({ x: Math.max(0, (cw - sw) / 2), y: Math.max(0, (ch - sh) / 2) });
    });
    return () => cancelAnimationFrame(timer);
  }, [svg]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  // Ref to always read latest scale inside passive=false listener
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  // Native wheel listener (must be {passive: false} for preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.max(0.25, Math.min(3, scaleRef.current + delta));
      setScale(newScale);

      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setOffset((prev) => ({
        x: cx - (cx - prev.x) * (newScale / scaleRef.current),
        y: cy - (cy - prev.y) * (newScale / scaleRef.current),
      }));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [svg]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, offsetX: offset.x, offsetY: offset.y };
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.offsetX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.offsetY + (e.clientY - dragRef.current.startY),
    });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).style.cursor = 'grab';
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const adjustZoom = useCallback((delta: number) => {
    setScale((s) => Math.max(0.25, Math.min(3, s + delta)));
  }, []);

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
    <div className="relative w-full h-full overflow-hidden">
      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 bg-bg-surface/90 backdrop-blur-sm rounded-xl border border-border shadow-sm p-1">
        <button
          onClick={() => adjustZoom(-0.2)}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="缩小"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-text-secondary w-10 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => adjustZoom(0.2)}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
          title="放大"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={resetView}
          className="p-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors ml-1 border-l border-border pl-2"
          title="重置视图"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Pannable canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full overflow-hidden cursor-grab"
        style={{
          backgroundImage:
            'radial-gradient(circle, #e8e4df 1px, transparent 1px)',
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`,
        }}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
          dangerouslySetInnerHTML={{ __html: svg || '' }}
        />
      </div>
    </div>
  );
}
