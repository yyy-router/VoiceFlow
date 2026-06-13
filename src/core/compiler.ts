import { DiagramSchema, NodeGraphSchema, SequenceSchema, isNodeGraph } from './schema';

export function sanitize(label: string): string {
  return label
    .replace(/\(/g, '（')
    .replace(/\)/g, '）')
    .replace(/\[/g, '【')
    .replace(/\]/g, '】')
    .replace(/"/g, "'");
}

const VALID_COLOR = /^[#\w\d(),.%\s-]+$/;

function safeColor(c: string): string | null {
  return VALID_COLOR.test(c) ? c : null;
}

function mermaidConfig(lines: string[], nodeCount: number): void {
  if (nodeCount >= 8) {
    lines.unshift('%%{init: {"themeVariables": {"fontSize": "18px"}, "flowchart": {"nodeSpacing": 40, "rankSpacing": 60}}}%%');
  } else if (nodeCount >= 5) {
    lines.unshift('%%{init: {"themeVariables": {"fontSize": "16px"}}}%%');
  }
}

export const SHAPE_MAP: Record<string, [string, string]> = {
  start: ['([', '])'],
  process: ['[', ']'],
  decision: ['{', '}'],
  end: ['([', '])'],
  entity: ['[', ']'],
  service: ['[', ']'],
  database: ['[(', ')]'],
};

export function compileMermaid(schema: DiagramSchema): string {
  if (isNodeGraph(schema)) {
    switch (schema.diagramType) {
      case 'flowchart':   return compileFlowchart(schema);
      case 'architecture': return compileArchitecture(schema);
      case 'er':          return compileER(schema);
    }
  }
  if (schema.diagramType === 'sequence') return compileSequence(schema);
  const _exhaustive: never = schema;
  return '';
}

export function compileFlowchart(schema: NodeGraphSchema): string {
  const lines: string[] = ['flowchart TD'];
  mermaidConfig(lines, schema.nodes.length);
  for (const n of schema.nodes) {
    const [open, close] = SHAPE_MAP[n.type] || ['[', ']'];
    lines.push(`    ${n.id}${open}${sanitize(n.label)}${close}`);
  }
  for (const e of schema.edges) {
    const label = e.label ? `|${sanitize(e.label)}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
  }
  for (const n of schema.nodes) {
    if (n.color) {
      const c = safeColor(n.color);
      if (c) lines.push(`    style ${n.id} fill:${c}`);
    }
  }
  return lines.join('\n');
}

export function compileArchitecture(schema: NodeGraphSchema): string {
  const lines: string[] = ['graph TB'];
  mermaidConfig(lines, schema.nodes.length);
  for (const n of schema.nodes) {
    const [open, close] = SHAPE_MAP[n.type] || ['[', ']'];
    lines.push(`    ${n.id}${open}${sanitize(n.label)}${close}`);
  }
  for (const e of schema.edges) {
    const label = e.label ? `|${sanitize(e.label)}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
  }
  for (const n of schema.nodes) {
    if (n.color) {
      const c = safeColor(n.color);
      if (c) lines.push(`    style ${n.id} fill:${c}`);
    }
  }
  return lines.join('\n');
}

export function compileER(schema: NodeGraphSchema): string {
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

export function compileSequence(schema: SequenceSchema): string {
  const lines: string[] = ['sequenceDiagram'];
  for (const p of schema.participants) {
    lines.push(`    participant ${sanitize(p.label)}`);
  }
  for (const m of schema.messages) {
    const arrow = m.messageType === 'async' ? '-->>' :
                  m.messageType === 'return' ? '-->>' : '->>';
    const fromP = schema.participants.find(p => p.id === m.from);
    const toP = schema.participants.find(p => p.id === m.to);
    lines.push(`    ${sanitize(fromP?.label || m.from)}${arrow}${sanitize(toP?.label || m.to)}: ${sanitize(m.text)}`);
  }
  return lines.join('\n');
}
