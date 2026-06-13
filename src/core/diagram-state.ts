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
      const repaired = repairGraph(result.schema);
      this.logAction('update', `nodes:${repaired.nodes.length}`);
      this.undoStack.push({ ...this.schema });
      this.redoStack = [];
      this.schema = repaired;
      this.lastOpText = '创建/更新了图';
      return { schema: repaired, errors: [] };
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
    return JSON.stringify({
      context: {
        schema_summary: {
          diagramType: this.schema.diagramType,
          node_count: this.schema.nodes.length,
          edge_count: this.schema.edges.length,
          labels: this.schema.nodes.map(n => n.label),
          nodes: this.schema.nodes.map(n => ({
            label: n.label,
            id: n.id,
            type: n.type,
            attributes: n.attributes,
          })),
          edges: this.schema.edges.map(e => ({
            from: e.from,
            to: e.to,
            label: e.label,
          })),
        },
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
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push({ ...this.schema });
    this.schema = prev;
    this.lastOpText = '撤销了上一步';
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push({ ...this.schema });
    this.schema = next;
    this.lastOpText = '恢复了上一步';
    return true;
  }

  clear(): boolean {
    if (this.schema.nodes.length === 0 && this.schema.edges.length === 0) return false;
    this.undoStack.push({ ...this.schema });
    this.redoStack = [];
    this.schema = { diagramType: 'flowchart', nodes: [], edges: [] };
    this.lastOpText = '清空了画布';
    return true;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
