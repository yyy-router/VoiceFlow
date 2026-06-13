'use client';

import { Download } from 'lucide-react';

export default function ExportButton() {
  const doExport = () => {
    const svgEl = document.querySelector('svg[id^="mermaid-"]') as SVGElement | null;
    if (!svgEl) {
      alert('没有可导出的图表');
      return;
    }

    const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'diagram.svg';
    a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <button
      onClick={doExport}
      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
    >
      <Download className="w-3 h-3" />
      SVG
    </button>
  );
}
