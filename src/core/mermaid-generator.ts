import { DiagramStateData } from './types';

export function stateToMermaid(state: DiagramStateData): string {
  const { type, nodes, edges } = state;

  if (type === 'er') return generateER(nodes, edges);

  const direction = type === 'architecture' ? 'TB' : 'TD';
  const keyword = type === 'architecture' ? 'graph' : 'flowchart';
  const lines: string[] = [`${keyword} ${direction}`];

  const shapeMap: Record<string, [string, string]> = {
    rectangle: ['[', ']'],
    diamond: ['{', '}'],
    cylinder: ['[(', ')]'],
    round: ['([', '])'],
  };

  for (const node of nodes) {
    const [open, close] = shapeMap[node.shape || 'rectangle'] || ['[', ']'];
    lines.push(`    ${node.id}${open}${node.label}${close}`);
  }

  for (const edge of edges) {
    const label = edge.label ? `|${edge.label}|` : '';
    lines.push(`    ${edge.from} -->${label} ${edge.to}`);
  }

  return lines.join('\n');
}

function generateER(
  nodes: DiagramStateData['nodes'],
  edges: DiagramStateData['edges']
): string {
  const lines: string[] = ['erDiagram'];
  const entities = new Set<string>();

  for (const node of nodes) {
    if (!entities.has(node.label)) {
      lines.push(`    ${node.label} {`);
      lines.push('        int id PK');
      lines.push('        string name');
      lines.push('    }');
      entities.add(node.label);
    }
  }

  for (const edge of edges) {
    const fn = nodes.find((n) => n.id === edge.from);
    const tn = nodes.find((n) => n.id === edge.to);
    if (fn && tn) {
      lines.push(`    ${fn.label} ||--o{ ${tn.label} : "${edge.label || '关联'}"`);
    }
  }

  return lines.join('\n');
}
