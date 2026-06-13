import { DiagramSchema } from './schema';

function sanitize(label: string): string {
  return label
    .replace(/\(/g, '（')
    .replace(/\)/g, '）')
    .replace(/\[/g, '【')
    .replace(/\]/g, '】')
    .replace(/"/g, "'");
}

const SHAPE_MAP: Record<string, [string, string]> = {
  start: ['([', '])'],
  process: ['[', ']'],
  decision: ['{', '}'],
  end: ['([', '])'],
  entity: ['[', ']'],
  service: ['[', ']'],
  database: ['[(', ')]'],
};

export function compileMermaid(schema: DiagramSchema): string {
  switch (schema.diagramType) {
    case 'flowchart':   return compileFlowchart(schema);
    case 'architecture': return compileArchitecture(schema);
    case 'er':          return compileER(schema);
  }
}

function compileFlowchart(schema: DiagramSchema): string {
  const lines: string[] = ['flowchart TD'];
  for (const n of schema.nodes) {
    const [open, close] = SHAPE_MAP[n.type] || ['[', ']'];
    lines.push(`    ${n.id}${open}${sanitize(n.label)}${close}`);
  }
  for (const e of schema.edges) {
    const label = e.label ? `|${sanitize(e.label)}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
  }
  return lines.join('\n');
}

function compileArchitecture(schema: DiagramSchema): string {
  const lines: string[] = ['graph LR'];
  for (const n of schema.nodes) {
    const [open, close] = SHAPE_MAP[n.type] || ['[', ']'];
    lines.push(`    ${n.id}${open}${sanitize(n.label)}${close}`);
  }
  for (const e of schema.edges) {
    const label = e.label ? `|${sanitize(e.label)}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
  }
  return lines.join('\n');
}

function compileER(schema: DiagramSchema): string {
  const lines: string[] = ['erDiagram'];
  const seen = new Set<string>();
  for (const n of schema.nodes) {
    if (!seen.has(n.id)) {
      lines.push(`    ${sanitize(n.label)} {`);
      const attrs = n.attributes;
      if (attrs && attrs.length > 0) {
        for (const attr of attrs) {
          const attrType = attr.type || 'string';
          lines.push(`        ${attrType} ${sanitize(attr.name)}`);
        }
      }
      lines.push('    }');
      seen.add(n.id);
    }
  }
  for (const e of schema.edges) {
    const fn = schema.nodes.find(n => n.id === e.from);
    const tn = schema.nodes.find(n => n.id === e.to);
    const relabel = e.label || '关联';
    lines.push(`    ${sanitize(fn?.label || e.from)} ||--o{ ${sanitize(tn?.label || e.to)} : "${sanitize(relabel)}"`);
  }
  return lines.join('\n');
}
