import {
  DiagramSchema, RawDiagramSchema as RawSchema,
  NodeGraphSchema,
  Node, RawNode,
  DiagramPatch,
  ValidationResult,
} from './schema';
import { repairGraph } from './graph-repair';

// ─── ID Generator ───
function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16).slice(0, 4);
}

function generateId(raw: RawNode, fallbackIndex: number): string {
  if (raw.id_hint) {
    const hint = raw.id_hint
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .split('_')
      .slice(0, 5)
      .join('_');
    if (hint) return `${hint}_${hash(raw.label)}`;
  }
  return `node_${fallbackIndex}_${hash(raw.label)}`;
}

// ─── Node Resolution (不依赖 label Map) ───
function resolveNode(ref: string, nodes: Node[]): Node | null {
  const byId = nodes.find(n => n.id === ref);
  if (byId) return byId;
  const byLabel = nodes.find(n => n.label === ref);
  if (byLabel) return byLabel;
  const fuzzy = nodes.find(n =>
    n.label.includes(ref) || ref.includes(n.label)
  );
  return fuzzy || null;
}

// ─── Normalize ───
export function normalizeNode(raw: RawNode, index: number): Node {
  return { id: generateId(raw, index), label: raw.label, type: raw.type };
}

export function normalizeRawSchema(raw: RawSchema): DiagramSchema {
  if (raw.diagramType === 'sequence') {
    // Normalize sequence: generate IDs for participants
    const participants = (raw as any).participants.map((p: any, i: number) => ({
      id: p.id || p.id_hint || `p${i + 1}`,
      label: p.label,
    }));
    return { diagramType: 'sequence', title: raw.title, participants, messages: (raw as any).messages };
  }

  // Normalize node-graph types
  const rawNG = raw as any;
  const nodeIds = new Set<string>();
  const nodes: Node[] = rawNG.nodes.map((n: any) => {
    if (n.id && !nodeIds.has(n.id)) {
      nodeIds.add(n.id);
      return { id: n.id, label: n.label, type: n.type, color: n.color, attributes: n.attributes };
    }
    let id = generateId(n, rawNG.nodes.indexOf(n) + 1);
    let dedup = id;
    let counter = 1;
    while (nodeIds.has(dedup)) dedup = `${id}_${++counter}`;
    nodeIds.add(dedup);
    return { id: dedup, label: n.label, type: n.type, color: n.color, attributes: n.attributes };
  });

  const edges = rawNG.edges.map((e: any) => ({
    ...e,
    from: nodeIds.has(e.from) ? e.from : (resolveNode(e.from, nodes)?.id || e.from),
    to: nodeIds.has(e.to) ? e.to : (resolveNode(e.to, nodes)?.id || e.to),
  }));

  return { diagramType: rawNG.diagramType, title: raw.title, nodes, edges };
}

// ─── Parse ───
export function parseSchema(raw: unknown): { schema: RawSchema | null; errors: string[] } {
  const result = RawSchema.safeParse(raw);
  if (result.success) return { schema: result.data, errors: [] };
  return { schema: null, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
}

export function parsePatch(raw: unknown): { patch: DiagramPatch | null; errors: string[] } {
  const result = DiagramPatch.safeParse(raw);
  if (result.success) return { patch: result.data, errors: [] };
  return { patch: null, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
}

// ─── Validate Node-Graph ───
export function validateNodeGraph(schema: NodeGraphSchema): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  const dups = new Set<string>();

  for (const n of schema.nodes) {
    if (ids.has(n.id)) dups.add(n.id);
    ids.add(n.id);
  }
  if (dups.size > 0) errors.push(`重复节点 ID: [${[...dups].join(', ')}]`);

  for (const e of schema.edges) {
    if (!ids.has(e.from)) errors.push(`边引用不存在的起点: ${e.from}`);
    if (!ids.has(e.to))   errors.push(`边引用不存在的终点: ${e.to}`);
    if (e.from === e.to)  errors.push(`自循环边: ${e.from} → ${e.to}`);
  }

  // Deduplicate edges
  const seenEdges = new Set<string>();
  const deduped: typeof schema.edges = [];
  for (const e of schema.edges) {
    const key = `${e.from}→${e.to}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      deduped.push(e);
    }
  }
  if (deduped.length < schema.edges.length) {
    schema.edges.splice(0, schema.edges.length, ...deduped);
  }

  if (schema.diagramType === 'er' && schema.nodes.length === 0) {
    errors.push('ER 图不能为空');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Validate Sequence ───
function validateSequence(schema: any): ValidationResult {
  const errors: string[] = [];
  const pIds = new Set<string>();
  const pLabels = new Set<string>();

  for (const p of schema.participants) {
    if (pIds.has(p.id)) errors.push(`重复参与者 ID: ${p.id}`);
    pIds.add(p.id);
    if (pLabels.has(p.label)) errors.push(`重复参与者名称: ${p.label}`);
    pLabels.add(p.label);
  }

  for (const m of schema.messages) {
    if (!pIds.has(m.from)) errors.push(`消息引用不存在的发送者: ${m.from}`);
    if (!pIds.has(m.to)) errors.push(`消息引用不存在的接收者: ${m.to}`);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Validate Schema (dispatches by type) ───
export function validateSchema(schema: DiagramSchema): ValidationResult {
  if (schema.diagramType === 'sequence') return validateSequence(schema);
  return validateNodeGraph(schema);
}

// ─── Validate Patch ───
export function validatePatch(schema: DiagramSchema, patch: DiagramPatch, updatedNodes: Node[] = []): ValidationResult {
  if (schema.diagramType === 'sequence') {
    return { valid: true, errors: [] }; // patches not supported for sequence
  }
  const errors: string[] = [];
  const nodeIds = new Set(schema.nodes.map(n => n.id));
  const nodeLabels = new Set(schema.nodes.map(n => n.label));
  for (const n of updatedNodes) {
    nodeIds.add(n.id);
    nodeLabels.add(n.label);
  }

  for (const op of patch.operations) {
    switch (op.type) {
      case 'removeNode':
      case 'renameNode': {
        const resolved = resolveNode(
          op.target.id || op.target.label || '',
          [...schema.nodes, ...updatedNodes]
        );
        if (!resolved) {
          errors.push(`Patch 目标节点无法解析: ${JSON.stringify(op.target)}`);
        }
        break;
      }
      case 'removeEdge': {
        if (!schema.edges.some(e => e.from === op.from && e.to === op.to)) {
          errors.push(`Patch 要删除的边不存在: ${op.from} → ${op.to}`);
        }
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Full Pipeline ───
export function processRawSchema(raw: unknown): { schema: DiagramSchema | null; errors: string[] } {
  const parsed = parseSchema(raw);
  if (!parsed.schema) return { schema: null, errors: parsed.errors };
  const normalized = normalizeRawSchema(parsed.schema);

  // Repair only node-based graphs
  if ('nodes' in normalized) {
    const repaired = repairGraph(normalized);
    const validated = validateNodeGraph(repaired);
    if (!validated.valid) return { schema: null, errors: validated.errors };
    return { schema: repaired, errors: [] };
  }

  // Validate sequence (no repair needed)
  const validated = validateSequence(normalized);
  if (!validated.valid) return { schema: null, errors: validated.errors };
  return { schema: normalized, errors: [] };
}
