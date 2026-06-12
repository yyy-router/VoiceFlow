'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

export default function ExportButton() {
  const [busy, setBusy] = useState(false);

  const doExport = async (fmt: 'png' | 'svg') => {
    setBusy(true);
    const svgEl = document.querySelector('.mermaid svg, [id^="mermaid-"] svg') as SVGElement | null;
    if (!svgEl) {
      alert('没有可导出的图表');
      setBusy(false);
      return;
    }

    if (fmt === 'svg') {
      const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' });
      download(blob, 'diagram.svg');
      setBusy(false);
    } else {
      const canvas = document.createElement('canvas');
      const rect = svgEl.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml;charset=utf-8' })
      );
      img.onload = () => {
        ctx.fillStyle = '#faf8f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => {
          if (b) download(b, 'diagram.png');
          setBusy(false);
        }, 'image/png');
      };
      img.onerror = () => setBusy(false);
      img.src = url;
    }
  };

  const download = (blob: Blob, name: string) => {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <div className="flex gap-1">
      <button
        onClick={() => doExport('png')}
        disabled={busy}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-bg-hover disabled:opacity-50 text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
      >
        <Download className="w-3 h-3" />
        PNG
      </button>
      <button
        onClick={() => doExport('svg')}
        disabled={busy}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-bg-hover disabled:opacity-50 text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
      >
        <Download className="w-3 h-3" />
        SVG
      </button>
    </div>
  );
}
