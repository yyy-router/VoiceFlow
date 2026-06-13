import { DiagramSchema } from './schema';

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
    lines.push(`    ${n.id}${open}${n.label}${close}`);
  }
  for (const e of schema.edges) {
    const label = e.label ? `|${e.label}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
  }
  return lines.join('\n');
}

function compileArchitecture(schema: DiagramSchema): string {
  const lines: string[] = ['graph LR'];
  for (const n of schema.nodes) {
    const [open, close] = SHAPE_MAP[n.type] || ['[', ']'];
    lines.push(`    ${n.id}${open}${n.label}${close}`);
  }
  for (const e of schema.edges) {
    const label = e.label ? `|${e.label}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
  }
  return lines.join('\n');
}

function compileER(schema: DiagramSchema): string {
  const lines: string[] = ['erDiagram'];
  const seen = new Set<string>();
  for (const n of schema.nodes) {
    if (!seen.has(n.id)) {
      lines.push(`    ${n.id} {`);
      lines.push('        int id PK');
      lines.push('        string name');
      lines.push('    }');
      seen.add(n.id);
    }
  }
  for (const e of schema.edges) {
    const relabel = e.label || '关联';
    lines.push(`    ${e.from} ||--o{ ${e.to} : "${relabel}"`);
  }
  return lines.join('\n');
}
