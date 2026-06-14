import { DiagramSchema } from './schema';
import { compileMermaid } from './compiler';
import { processRawSchema } from './validator';
import { repairGraph } from './graph-repair';

interface ActionLog {
  action: string;
  target: string;
  timestamp: number;
}

export class DiagramState {
  private schema: DiagramSchema = { diagramType: 'flowchart', nodes: [], edges: [] };
  private undoStack: DiagramSchema[] = [];
  private redoStack: DiagramSchema[] = [];
  private lastOpText = '无';
  private actionLog: ActionLog[] = [];
  private focusNodes: string[] = [];

  setSchema(raw: unknown): { schema: DiagramSchema | null; errors: string[] } {
    const result = processRawSchema(raw);
    if (result.schema) {
      // Only repair node-based graphs
      if ('nodes' in result.schema) {
        const repaired = repairGraph(result.schema as any);
        this.logAction('update', `nodes:${repaired.nodes.length}`);
        this.undoStack.push(structuredClone(this.schema));
        this.redoStack = [];
        this.schema = repaired;
      } else {
        const s = result.schema as any;
        const count = s.participants?.length ?? 1;
        const label = 'sequence';
        this.logAction('update', `${label}:${count}`);
        this.undoStack.push(structuredClone(this.schema));
        this.redoStack = [];
        this.schema = result.schema;
      }
      this.lastOpText = '创建/更新了图';
      return { schema: result.schema, errors: [] };
    }
    return result;
  }

  private logAction(action: string, target: string): void {
    this.actionLog.push({ action, target, timestamp: Date.now() });
    if (this.actionLog.length > 10) this.actionLog.shift();
  }

  setFocus(nodes: string[]): void {
    this.focusNodes = nodes.slice(0, 5);
  }

  clearFocus(): void {
    this.focusNodes = [];
  }

  getContextForLLM(userInput: string): string {
    const s = this.schema;
    const summary: any = {
      diagramType: s.diagramType,
    };
    if ('nodes' in s) {
      summary.node_count = s.nodes.length;
      summary.edge_count = s.edges.length;
      summary.labels = s.nodes.map(n => n.label);
      summary.nodes = s.nodes.map(n => ({
        label: n.label, id: n.id, type: n.type, color: n.color, group: n.group, attributes: n.attributes,
      }));
      summary.edges = s.edges.map(e => ({
        from: e.from, to: e.to, label: e.label,
      }));
    } else if ('participants' in s) {
      summary.node_count = s.participants.length;
      summary.edge_count = s.messages.length;
      summary.labels = s.participants.map(p => p.label);
      summary.participants = s.participants;
      summary.messages = s.messages;
    } else {
      // mindmap — pass full tree so LLM can preserve existing branches
      summary.labels = [s.root.label];
      summary.root = s.root;
    }
    return JSON.stringify({
      context: {
        schema_summary: summary,
        focus: this.focusNodes.length > 0 ? { nodes: this.focusNodes } : undefined,
        recent_actions: this.actionLog.slice(-5),
      },
      input: userInput,
    });
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
    const s = this.schema;
    const base = { diagramType: s.diagramType, title: (s as any).title };
    if ('nodes' in s) {
      return JSON.stringify({ ...base, nodeCount: s.nodes.length, edgeCount: s.edges.length, nodeLabels: s.nodes.map(n => n.label) });
    }
    if ('participants' in s) {
      return JSON.stringify({ ...base, participantCount: s.participants.length, messageCount: s.messages.length });
    }
    return JSON.stringify({ ...base, rootLabel: (s as any).root?.label });
  }

  getLastOperationText(): string {
    return this.lastOpText;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(structuredClone(this.schema));
    this.schema = prev;
    this.lastOpText = '撤销了上一步';
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(structuredClone(this.schema));
    this.schema = next;
    this.lastOpText = '恢复了上一步';
    return true;
  }

  restore(schema: DiagramSchema, undoStack: DiagramSchema[], redoStack: DiagramSchema[], actionLog: ActionLog[]): void {
    this.schema = schema;
    this.undoStack = undoStack;
    this.redoStack = redoStack;
    this.actionLog = actionLog;
    this.lastOpText = '已恢复';
  }

  clear(): boolean {
    const s = this.schema as any;
    const isEmpty = s.nodes ? (s.nodes.length === 0 && s.edges.length === 0)
      : s.participants ? ((s.participants?.length ?? 0) === 0 && (s.messages?.length ?? 0) === 0)
      : !s.root;
    if (isEmpty) return false;
    this.undoStack.push(structuredClone(this.schema));
    this.redoStack = [];
    this.schema = { diagramType: 'flowchart', nodes: [], edges: [] };
    this.lastOpText = '清空了画布';
    return true;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
