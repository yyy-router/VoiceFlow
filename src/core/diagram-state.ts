import { DiagramSchema, DiagramPatch, PatchOp, Node } from './schema';
import { compileMermaid } from './compiler';
import { processRawSchema } from './validator';

// ─── Patch Application & Inverse Logic ───
function resolveNodeByTarget(target: { id?: string; label?: string }, nodes: Node[]): Node | null {
  if (target.id) {
    const m = nodes.find(n => n.id === target.id);
    if (m) return m;
  }
  if (target.label) {
    const m = nodes.find(n => n.label === target.label);
    if (m) return m;
  }
  return null;
}

function applyOp(schema: DiagramSchema, op: PatchOp): PatchOp {
  switch (op.type) {
    case 'addNode': {
      // Find if already exists by label
      const exist = schema.nodes.find(n => n.label === op.node.label);
      if (exist) {
        // Already exists → no-op, but still return inverse
        return { type: 'removeNode', target: { id: exist.id } };
      }
      const newId = generateNodeId(op.node, schema.nodes.length + 1);
      const node: Node = { id: newId, label: op.node.label, type: op.node.type };
      schema.nodes.push(node);
      return { type: 'removeNode', target: { id: node.id } };
    }
    case 'removeNode': {
      const node = resolveNodeByTarget(op.target, schema.nodes);
      if (!node) return { type: 'addNode', node: { label: op.target.label || op.target.id || '', type: 'process' } };
      schema.nodes = schema.nodes.filter(n => n.id !== node.id);
      schema.edges = schema.edges.filter(e => e.from !== node.id && e.to !== node.id);
      return { type: 'addNode', node: { label: node.label, type: node.type, id_hint: node.id } };
    }
    case 'renameNode': {
      const node = resolveNodeByTarget(op.target, schema.nodes);
      if (!node) return { type: 'renameNode', target: { id: op.target.id || '' }, newLabel: op.target.label || '' };
      const oldLabel = node.label;
      node.label = op.newLabel;
      return { type: 'renameNode', target: { id: node.id }, newLabel: oldLabel };
    }
    case 'addEdge': {
      const exists = schema.edges.some(e => e.from === op.edge.from && e.to === op.edge.to);
      if (exists) return { type: 'removeEdge', from: op.edge.from, to: op.edge.to };
      schema.edges.push({ ...op.edge });
      return { type: 'removeEdge', from: op.edge.from, to: op.edge.to };
    }
    case 'removeEdge': {
      if (!schema.edges.some(e => e.from === op.from && e.to === op.to)) {
        return { type: 'addEdge', edge: { from: op.from, to: op.to } };
      }
      schema.edges = schema.edges.filter(e => !(e.from === op.from && e.to === op.to));
      return { type: 'addEdge', edge: { from: op.from, to: op.to } };
    }
  }
}

function generateNodeId(raw: { label: string; id_hint?: string }, index: number): string {
  let h = 5381;
  for (let i = 0; i < raw.label.length; i++) h = (h * 33) ^ raw.label.charCodeAt(i);
  const hash = (h >>> 0).toString(16).slice(0, 4);

  if (raw.id_hint) {
    const hint = raw.id_hint
      .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (hint) return `${hint}_${hash}`;
  }
  return `node_${index}_${hash}`;
}

function describePatch(patch: DiagramPatch): string {
  const labels: Record<string, string> = {
    addNode: '添加节点', removeNode: '删除节点', renameNode: '重命名节点',
    addEdge: '添加连线', removeEdge: '删除连线',
  };
  const ops = patch.operations.map(op => labels[op.type] || op.type);
  return ops.join('、');
}

interface UndoEntry {
  forward: DiagramPatch;
  inverse: DiagramPatch;
}

// ─── DiagramState ───
export class DiagramState {
  private schema: DiagramSchema = { diagramType: 'flowchart', nodes: [], edges: [] };
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private lastOpText = '无';

  private execOps(ops: PatchOp[]): PatchOp[] {
    const inverses: PatchOp[] = [];
    for (const op of [...ops].reverse()) {
      inverses.unshift(applyOp(this.schema, op));
    }
    return inverses;
  }

  applyPatch(patch: DiagramPatch): void {
    const inverses = this.execOps(patch.operations);
    this.redoStack = [];
    this.undoStack.push({ forward: patch, inverse: { operations: inverses } });
    this.lastOpText = describePatch(patch);
  }

  setSchema(raw: unknown): { schema: DiagramSchema | null; errors: string[] } {
    const result = processRawSchema(raw);
    if (result.schema) {
      this.schema = result.schema;
      this.undoStack = [];
      this.redoStack = [];
      this.lastOpText = '创建了图';
    }
    return result;
  }

  getSchema(): DiagramSchema {
    return this.schema;
  }

  compile(): string {
    return compileMermaid(this.schema);
  }

  getContextJson(): string {
    return JSON.stringify(this.schema);
  }

  getSummary(): string {
    return JSON.stringify({
      diagramType: this.schema.diagramType,
      title: this.schema.title,
      nodeCount: this.schema.nodes.length,
      edgeCount: this.schema.edges.length,
      nodeLabels: this.schema.nodes.map(n => n.label),
    });
  }

  getLastOperationText(): string {
    return this.lastOpText;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.execOps(entry.inverse.operations);
    this.redoStack.push(entry);
    this.lastOpText = '撤销了上一步';
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.execOps(entry.forward.operations);
    this.undoStack.push(entry);
    this.lastOpText = '恢复了上一步';
    return true;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
