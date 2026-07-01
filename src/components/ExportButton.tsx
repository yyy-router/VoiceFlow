'use client';

import { useState } from 'react';
import { Download, FileImage } from 'lucide-react';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getSvgEl(): SVGElement | null {
  return document.querySelector('svg[id^="mermaid-"]') as SVGElement | null;
}

function doSvgExport() {
  const svgEl = getSvgEl();
  if (!svgEl) { alert('没有可导出的图表'); return; }

  const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' });
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = `diagram_${uid()}.svg`;
  a.click();
  URL.revokeObjectURL(u);
}

function doPngExport() {
  const svgEl = getSvgEl();
  if (!svgEl) { alert('没有可导出的图表'); return; }

  // Get dimensions from viewBox or bounding rect
  const vb = svgEl.getAttribute('viewBox')?.split(/\s+/).map(Number);
  const w = vb?.[2] || svgEl.getBoundingClientRect().width || 800;
  const h = vb?.[3] || svgEl.getBoundingClientRect().height || 600;

  const scale = 2; // retina
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  // Clone and replace foreignObject with text equivalents to avoid canvas taint
  const clone = svgEl.cloneNode(true) as SVGElement;
  clone.querySelectorAll('foreignObject').forEach(fo => {
    const text = fo.textContent?.trim();
    if (!text) { fo.remove(); return; }
    const fx = Number(fo.getAttribute('x') || 0);
    const fy = Number(fo.getAttribute('y') || 0);
    const fw = Number(fo.getAttribute('width') || 0);
    const fh = Number(fo.getAttribute('height') || 0);

    // Try to read font size from the inner element's style
    const innerDiv = fo.querySelector('div,span');
    const style = innerDiv?.getAttribute('style') || '';
    const fontSize = (style.match(/font-size:\s*([^;]+)/) || [])[1] || '14px';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', String(fx + fw / 2));
    txt.setAttribute('y', String(fy + fh / 2 + 1));
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('dominant-baseline', 'middle');
    txt.setAttribute('font-size', fontSize);
    txt.setAttribute('font-family', 'system-ui, sans-serif');
    txt.textContent = text;
    g.appendChild(txt);
    fo.replaceWith(g);
  });

  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => {
      if (!b) return;
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u;
      a.download = `diagram_${uid()}.png`;
      a.click();
      URL.revokeObjectURL(u);
    }, 'image/png');
  };
  img.src = url;
}

export default function ExportButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
      >
        <Download className="w-3 h-3" />
        导出
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[100px]">
            <button
              onClick={() => { doSvgExport(); setOpen(false); }}
              className="w-full px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover flex items-center gap-2"
            >
              <Download className="w-3 h-3" /> SVG
            </button>
            <button
              onClick={() => { doPngExport(); setOpen(false); }}
              className="w-full px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover flex items-center gap-2"
            >
              <FileImage className="w-3 h-3" /> PNG
            </button>
          </div>
        </>
      )}
    </div>
  );
}
