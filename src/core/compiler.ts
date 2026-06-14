import { DiagramSchema, NodeGraphSchema, SequenceSchema, MindmapNode, isNodeGraph } from './schema';

export function sanitize(label: string): string {
  return label
    .replace(/\\n/g, ' ')
    .replace(/\n/g, ' ')
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

// const DEFAULT_COLOR: Record<string, string> = {
//   start: '#EEF4FF',
//   process: '#E7F0FF',
//   decision: '#DCE8FF',
//   end: '#D2E2FF',
//   service: '#C7DBFF',
//   database: '#BCD3FF',
// };
export const DEFAULT_COLOR: Record<string, string> = {
 start: '#DCFCE7',
  process: '#E0F2FE',
  decision: '#FEF3C7',
  end: '#FEE2E2',
  service: '#EDE9FE',
  database: '#F3F4F6',
};

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
      case 'architecture': return compileArchitectureSubgraph(schema);
      case 'er':          return compileER(schema);
    }
  }
  if (schema.diagramType === 'sequence') return compileSequence(schema);
  if (schema.diagramType === 'mindmap') return compileMindmap(schema as any);
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
    const c = n.color ? safeColor(n.color) : (DEFAULT_COLOR[n.type] || null);
    if (c) lines.push(`    style ${n.id} fill:${c}`);
  }
  return lines.join('\n');
}

const GROUP_PALETTE = ['#d5f5e3', '#d6eaf8', '#fdebd0', '#e8daef', '#fadbd8', '#d5dbdb'];
const GROUP_BG = ['#eafaf1', '#ebf5fb', '#fef5e7', '#f4ecf7', '#fdedec', '#eaecec'];

export function compileArchitectureSubgraph(schema: NodeGraphSchema): string {
  const lines: string[] = ['flowchart LR'];
  // Group nodes by group field
  const groups = new Map<string, typeof schema.nodes>();
  const ungrouped: typeof schema.nodes = [];
  for (const n of schema.nodes) {
    if (n.group) {
      if (!groups.has(n.group)) groups.set(n.group, []);
      groups.get(n.group)!.push(n);
    } else {
      ungrouped.push(n);
    }
  }

  let gi = 0;
  for (const [groupName, groupNodes] of groups) {
    const gid = `group_${gi}`;
    const color = (n: { color?: string | null }) => n.color ? safeColor(n.color) : null;
    lines.push(`    subgraph ${gid}["${sanitize(groupName)}"]`);
    for (const n of groupNodes) {
      const c = color(n) || GROUP_PALETTE[gi % GROUP_PALETTE.length];
      const [open, close] = SHAPE_MAP[n.type] || ['[', ']'];
      lines.push(`      ${n.id}${open}${sanitize(n.label)}${close}`);
      lines.push(`      style ${n.id} fill:${c}`);
    }
    lines.push('    end');
    const bg = schema.groupColors?.[groupName] || GROUP_BG[gi % GROUP_BG.length];
    lines.push(`    style ${gid} fill:${bg},stroke:#d0d0d0`);
    gi++;
  }

  // Ungrouped nodes
  for (const n of ungrouped) {
    const c = n.color ? safeColor(n.color) : null;
    const [open, close] = SHAPE_MAP[n.type] || ['[', ']'];
    lines.push(`    ${n.id}${open}${sanitize(n.label)}${close}`);
    if (c) lines.push(`    style ${n.id} fill:${c}`);
  }

  // Edges
  for (const e of schema.edges) {
    const label = e.label ? `|${sanitize(e.label)}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
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

function compileMindmapTree(node: MindmapNode, lines: string[], depth: number): void {
  const prefix = '    '.repeat(depth);
  const shape = depth === 0 ? `((${sanitize(node.label)}))` : `[${sanitize(node.label)}]`;
  lines.push(`${prefix}${shape}`);
  if (node.children) {
    for (const child of node.children) {
      compileMindmapTree(child, lines, depth + 1);
    }
  }
}

export function compileMindmap(schema: { root: MindmapNode; title?: string }): string {
  const lines: string[] = [
    '%%{init: {"theme": "base", "themeVariables": {',
    '  "primaryColor": "#FF8C42",',
    '  "primaryTextColor": "#fff",',
    '  "primaryBorderColor": "#E07B30",',
    '  "secondaryColor": "#B8E6E1",',
    '  "tertiaryColor": "#E8F5E9",',
    '  "lineColor": "#B0BEC5"',
    '}}}%%',
    'mindmap',
  ];
  compileMindmapTree(schema.root, lines, 0);
  return lines.join('\n');
}
