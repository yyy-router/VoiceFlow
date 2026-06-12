import { DiagramNode, DiagramEdge, DiagramStateData, DiagramCommand, LastOperation, LayoutDirection } from './types';

interface Snapshot {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  type: DiagramStateData['type'];
  direction: LayoutDirection;
}

export class DiagramState {
  private nodes: DiagramNode[] = [];
  private edges: DiagramEdge[] = [];
  private type: DiagramStateData['type'] = 'flowchart';
  private direction: LayoutDirection = 'TD';
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private lastOperation: LastOperation | null = null;
  private nextId = 1;

  private genId(): string {
    return `node_${this.nextId++}`;
  }

  private snapshot(): Snapshot {
    return {
      nodes: this.nodes.map((n) => ({ ...n })),
      edges: this.edges.map((e) => ({ ...e })),
      type: this.type,
      direction: this.direction,
    };
  }

  private restore(s: Snapshot): void {
    this.nodes = s.nodes.map((n) => ({ ...n }));
    this.edges = s.edges.map((e) => ({ ...e }));
    this.type = s.type;
    this.direction = s.direction;
  }

  private pushUndo(): void {
    this.undoStack.push(this.snapshot());
    this.redoStack = [];
  }

  private findNode(label: string): DiagramNode | undefined {
    const exact = this.nodes.find((n) => n.label === label);
    if (exact) return exact;
    return this.nodes.find((n) => n.label.includes(label) || label.includes(n.label));
  }

  applyCommand(cmd: DiagramCommand): void {
    const needsExisting: DiagramCommand['action'][] = ['delete_node', 'rename_node', 'change_node_shape', 'add_edge', 'delete_edge', 'move_node'];
    if (needsExisting.includes(cmd.action) && this.nodes.length === 0) return;

    switch (cmd.action) {
      case 'create_diagram': {
        this.pushUndo();
        this.type = (cmd.payload.diagram_type as DiagramStateData['type']) || 'flowchart';
        this.nodes = [];
        this.edges = [];
        this.direction = 'TD';
        this.lastOperation = { action: 'create_diagram' };
        break;
      }
      case 'add_node': {
        this.pushUndo();
        const label = (cmd.payload.label as string) || '';
        const shape = cmd.payload.shape as DiagramNode['shape'];
        const id = this.genId();
        this.nodes.push({ id, label, shape });
        this.lastOperation = { action: 'add_node', nodeLabel: label, nodeId: id };
        break;
      }
      case 'delete_node': {
        const target = (cmd.payload.label as string) || '';
        const node = this.findNode(target);
        if (!node) return;
        this.pushUndo();
        this.edges = this.edges.filter((e) => e.from !== node.id && e.to !== node.id);
        this.nodes = this.nodes.filter((n) => n.id !== node.id);
        this.lastOperation = { action: 'delete_node', nodeLabel: node.label, nodeId: node.id };
        break;
      }
      case 'rename_node': {
        const oldLabel = (cmd.payload.old_label as string) || '';
        const newLabel = (cmd.payload.new_label as string) || '';
        const node = this.findNode(oldLabel);
        if (!node) return;
        this.pushUndo();
        node.label = newLabel;
        this.lastOperation = { action: 'rename_node', nodeLabel: newLabel, nodeId: node.id };
        break;
      }
      case 'change_node_shape': {
        const label = (cmd.payload.label as string) || '';
        const shape = cmd.payload.shape as DiagramNode['shape'];
        const node = this.findNode(label);
        if (!node || !shape) return;
        this.pushUndo();
        node.shape = shape;
        this.lastOperation = { action: 'change_node_shape', nodeLabel: node.label, nodeId: node.id };
        break;
      }
      case 'add_edge': {
        const from = (cmd.payload.from as string) || '';
        const to = (cmd.payload.to as string) || '';
        const relabel = cmd.payload.label as string | undefined;
        const fromNode = this.findNode(from);
        const toNode = this.findNode(to);
        if (!fromNode || !toNode) return;
        if (this.edges.some((e) => e.from === fromNode.id && e.to === toNode.id)) return;
        this.pushUndo();
        this.edges.push({ from: fromNode.id, to: toNode.id, label: relabel });
        this.lastOperation = { action: 'add_edge' };
        break;
      }
      case 'delete_edge': {
        const from = (cmd.payload.from as string) || '';
        const to = (cmd.payload.to as string) || '';
        const fromNode = this.findNode(from);
        const toNode = this.findNode(to);
        if (!fromNode || !toNode) return;
        this.pushUndo();
        this.edges = this.edges.filter((e) => !(e.from === fromNode.id && e.to === toNode.id));
        this.lastOperation = { action: 'delete_edge' };
        break;
      }
      case 'move_node': {
        const target = (cmd.payload.target as string) || '';
        const position = (cmd.payload.position as string) || 'after';
        const reference = (cmd.payload.reference as string) || '';
        const node = this.findNode(target);
        const refNode = this.findNode(reference);
        if (!node || !refNode) return;
        this.pushUndo();
        const curIdx = this.nodes.findIndex((n) => n.id === node.id);
        const refIdx = this.nodes.findIndex((n) => n.id === refNode.id);
        if (curIdx === -1 || refIdx === -1) return;
        this.nodes.splice(curIdx, 1);
        const insertAt = position === 'after' ? refIdx + 1 : refIdx;
        this.nodes.splice(curIdx < refIdx ? insertAt - 1 : insertAt, 0, node);
        this.lastOperation = { action: 'move_node', nodeLabel: node.label, nodeId: node.id };
        break;
      }
      case 'layout_diagram': {
        const dir = (cmd.payload.direction as LayoutDirection) || 'TD';
        this.pushUndo();
        this.direction = dir;
        this.lastOperation = { action: 'layout_diagram' };
        break;
      }
      case 'undo': {
        const snap = this.undoStack.pop();
        if (!snap) return;
        this.redoStack.push(this.snapshot());
        this.restore(snap);
        this.lastOperation = { action: 'undo' };
        break;
      }
      case 'redo': {
        const snap = this.redoStack.pop();
        if (!snap) return;
        this.undoStack.push(this.snapshot());
        this.restore(snap);
        this.lastOperation = { action: 'redo' };
        break;
      }
    }
  }

  getState(): DiagramStateData {
    return { type: this.type, direction: this.direction, nodes: this.nodes, edges: this.edges };
  }

  getContextJson(): string {
    return JSON.stringify({
      type: this.type,
      direction: this.direction,
      nodes: this.nodes.map((n) => ({ id: n.id, label: n.label, shape: n.shape || 'rectangle' })),
      edges: this.edges.map((e) => ({
        from: e.from,
        to: e.to,
        fromLabel: this.nodes.find((n) => n.id === e.from)?.label || e.from,
        toLabel: this.nodes.find((n) => n.id === e.to)?.label || e.to,
        label: e.label,
      })),
    });
  }

  getLastOperation(): LastOperation | null {
    return this.lastOperation;
  }

  getLastOperationText(): string {
    if (!this.lastOperation) return '无';
    const { action, nodeLabel } = this.lastOperation;
    const map: Record<string, string> = {
      create_diagram: '创建了图',
      add_node: `添加了"${nodeLabel}"节点`,
      delete_node: `删除了"${nodeLabel}"节点`,
      rename_node: `重命名为"${nodeLabel}"`,
      change_node_shape: `修改了"${nodeLabel}"的形状`,
      add_edge: '添加了连线',
      delete_edge: '删除了连线',
      move_node: `移动了"${nodeLabel}"节点`,
      layout_diagram: '改变了布局方向',
      undo: '撤销了上一步',
      redo: '恢复了上一步',
    };
    return map[action] || action;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
