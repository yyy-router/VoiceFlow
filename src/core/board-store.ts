import { DiagramSchema } from './schema';
import { DiagramState } from './diagram-state';

const STORAGE_KEY = 'voiceflow_boards';
const MAX_BOARDS = 10;

interface BoardSnapshot {
  id: string;
  name: string;
  schema: DiagramSchema;
  undoStack: DiagramSchema[];
  redoStack: DiagramSchema[];
  actionLog: { action: string; target: string; timestamp: number }[];
}

interface ProjectCache {
  version: number;
  activeBoardId: string;
  boards: BoardSnapshot[];
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function defaultName(index: number): string {
  return `画板 ${index + 1}`;
}

export class BoardStore {
  private boards: DiagramState[] = [];
  private names: string[] = [];
  private ids: string[] = [];
  private activeIndex = 0;

  constructor() {
    this.boards.push(new DiagramState());
    this.names.push(defaultName(0));
    this.ids.push(uid());
  }

  // ─── Accessors ───
  get active(): DiagramState {
    return this.boards[this.activeIndex];
  }

  get boardCount(): number {
    return this.boards.length;
  }

  get activeId(): number {
    return this.activeIndex;
  }

  getActiveName(): string {
    return this.names[this.activeIndex];
  }

  getName(index: number): string {
    return this.names[index] || '';
  }

  get activeSchema() {
    return this.active.getSchema();
  }

  get activeMermaidCode() {
    return this.active.compile();
  }

  get activeCanUndo() {
    return this.active.canUndo;
  }

  get activeCanRedo() {
    return this.active.canRedo;
  }

  get activeLastOperation() {
    return this.active.getLastOperationText();
  }

  // ─── Boards list for UI ───
  list(): { name: string; type: string; nodeCount: number }[] {
    return this.boards.map((b, i) => ({
      name: this.names[i],
      type: b.getSchema().diagramType,
      nodeCount: (b.getSchema() as any).nodes?.length ?? (b.getSchema() as any).participants?.length ?? 0,
    }));
  }

  // ─── Board management ───
  addBoard(): boolean {
    if (this.boards.length >= MAX_BOARDS) return false;
    this.boards.push(new DiagramState());
    this.names.push(defaultName(this.boards.length - 1));
    this.ids.push(uid());
    this.activeIndex = this.boards.length - 1;
    this.save();
    return true;
  }

  removeBoard(index: number): boolean {
    if (this.boards.length <= 1) return false;
    this.boards.splice(index, 1);
    this.names.splice(index, 1);
    this.ids.splice(index, 1);
    if (this.activeIndex >= this.boards.length) {
      this.activeIndex = this.boards.length - 1;
    }
    this.save();
    return true;
  }

  renameBoard(index: number, name: string): void {
    if (name.trim()) {
      this.names[index] = name.trim();
      this.save();
    }
  }

  switchTo(index: number): void {
    if (index >= 0 && index < this.boards.length) {
      this.activeIndex = index;
    }
  }

  // ─── Operations delegated to active board ───
  setSchema(raw: unknown) {
    const result = this.active.setSchema(raw);
    if (result.schema) {
      this.names[this.activeIndex] = this.deriveName(result.schema);
      this.save();
    }
    return result;
  }

  undo(): boolean {
    const ok = this.active.undo();
    if (ok) this.save();
    return ok;
  }

  redo(): boolean {
    const ok = this.active.redo();
    if (ok) this.save();
    return ok;
  }

  clear(): boolean {
    const ok = this.active.clear();
    if (ok) this.save();
    return ok;
  }

  getContextForLLM(input: string): string {
    return this.active.getContextForLLM(input);
  }

  // ─── Persistence ───
  private deriveName(schema: DiagramSchema): string {
    if (schema.title) return schema.title;
    const typeLabel: Record<string, string> = {
      flowchart: '流程图', er: 'ER图', architecture: '架构图', sequence: '时序图',
    };
    if ('nodes' in schema && schema.nodes.length > 0) {
      return `${typeLabel[schema.diagramType] || '图表'} - ${schema.nodes[0].label}`;
    }
    return typeLabel[schema.diagramType] || this.names[this.activeIndex];
  }

  private save(): void {
    try {
      const data: ProjectCache = {
        version: 1,
        activeBoardId: this.ids[this.activeIndex],
        boards: this.boards.map((b, i) => ({
          id: this.ids[i],
          name: this.names[i],
          schema: b.getSchema(),
          undoStack: (b as any).undoStack || [],
          redoStack: (b as any).redoStack || [],
          actionLog: (b as any).actionLog || [],
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage full or unavailable
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data: ProjectCache = JSON.parse(raw);
      if (!data.boards?.length) return false;

      this.boards = data.boards.map((s) => {
        const ds = new DiagramState();
        ds.restore(s.schema, s.undoStack, s.redoStack, s.actionLog);
        return ds;
      });
      this.names = data.boards.map((s) => s.name);
      this.ids = data.boards.map((s) => s.id);
      const idx = this.ids.indexOf(data.activeBoardId);
      this.activeIndex = idx >= 0 ? idx : 0;
      return true;
    } catch {
      return false;
    }
  }
}
