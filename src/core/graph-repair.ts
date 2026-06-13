import { DiagramSchema, Node } from './schema';

// ─── Similarity (internal) ───
function tokenize(label: string): Set<string> {
  const tokens = new Set<string>();
  for (const part of label.split(/[，,、\s｜|→\-—>/]+/)) {
    if (part.length > 0) tokens.add(part);
  }
  if (/[一-鿿]/.test(label)) {
    for (let i = 0; i < label.length - 1; i++) {
      tokens.add(label.slice(i, i + 2));
    }
  }
  const en = label.replace(/[^\x00-\x7F]+/g, ' ').trim();
  if (en) {
    for (const t of en.toLowerCase().split(/[\s_]+/)) {
      if (t.length > 1 || /[a-z]/.test(t)) tokens.add(t);
    }
  }
  return tokens;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function similarity(a: Node, b: Node): number {
  const labelSim = jaccard(tokenize(a.label), tokenize(b.label));
  let hintSim = 0;
  const hintA = (a as any).id_hint || a.id;
  const hintB = (b as any).id_hint || b.id;
  if (hintA && hintB) hintSim = jaccard(new Set(hintA.split('_')), new Set(hintB.split('_')));
  return labelSim * 0.6 + hintSim * 0.3;
}

// ─── Repair ───
export function repairGraph(schema: DiagramSchema): DiagramSchema {
  let edges = [...schema.edges];

  // 1. Connect orphaned nodes
  const edgeNodes = new Set<string>();
  for (const e of edges) { edgeNodes.add(e.from); edgeNodes.add(e.to); }

  const existing = schema.nodes.filter(n => edgeNodes.has(n.id));
  const orphans = schema.nodes.filter(n => !edgeNodes.has(n.id));

  for (const orphan of orphans) {
    if (existing.length === 0) break;
    let best: Node | null = null;
    let bestScore = -1;
    for (const ex of existing) {
      const s = similarity(orphan, ex);
      if (s > bestScore) { bestScore = s; best = ex; }
    }
    if (best) edges.push({ from: best.id, to: orphan.id });
  }

  // 2. Linear chain for first-creation (no edges at all)
  if (edges.length === 0 && schema.nodes.length >= 2) {
    for (let i = 1; i < schema.nodes.length; i++) {
      edges.push({ from: schema.nodes[i - 1].id, to: schema.nodes[i].id });
    }
  }

  // 3. Bridge disconnected components
  const adj = new Map<string, Set<string>>();
  for (const n of schema.nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const n of schema.nodes) {
    if (visited.has(n.id)) continue;
    const comp: string[] = [];
    const queue = [n.id];
    visited.add(n.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const neighbor of adj.get(cur) || []) {
        if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
    }
    components.push(comp);
  }

  if (components.length > 1) {
    const largest = components.reduce((a, b) => a.length >= b.length ? a : b);
    for (let i = 1; i < components.length; i++) {
      edges.push({ from: components[i][0], to: largest[0] });
    }
  }

  return { ...schema, edges };
}
