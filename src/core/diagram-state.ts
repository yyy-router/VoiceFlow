import { DiagramSchema } from './schema';
import { compileMermaid } from './compiler';
import { processRawSchema } from './validator';
import { repairGraph } from './graph-repair';

export class DiagramState {
  private schema: DiagramSchema = { diagramType: 'flowchart', nodes: [], edges: [] };
  private undoStack: DiagramSchema[] = [];
  private redoStack: DiagramSchema[] = [];
  private lastOpText = '无';

  setSchema(raw: unknown): { schema: DiagramSchema | null; errors: string[] } {
    const result = processRawSchema(raw);
    if (result.schema) {
      // Repair before committing
      const repaired = repairGraph(result.schema);
      this.undoStack.push({ ...this.schema });
      this.redoStack = [];
      this.schema = repaired;
      this.lastOpText = '创建/更新了图';
      return { schema: repaired, errors: [] };
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

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
}
