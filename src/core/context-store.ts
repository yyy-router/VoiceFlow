import { DiagramSchema } from './schema';

interface ActionLog {
  action: string;
  target: string;
  timestamp: number;
}

export interface LLMContext {
  schema_summary: {
    diagramType: string;
    node_count: number;
    edge_count: number;
    labels: string[];
  };
  focus?: {
    subgraph?: string;
    nodes?: string[];
  };
  recent_actions: ActionLog[];
}

export class DiagramContextStore {
  schema: DiagramSchema = { diagramType: 'flowchart', nodes: [], edges: [] };
  history: ActionLog[] = [];
  focusSubgraph: string | null = null;
  focusNodes: string[] = [];

  constructor() {}

  updateSchema(schema: DiagramSchema): void {
    this.schema = schema;
  }

  logAction(action: string, target: string): void {
    this.history.push({ action, target, timestamp: Date.now() });
    if (this.history.length > 10) this.history.shift();
  }

  setFocus(nodes: string[]): void {
    this.focusNodes = nodes.slice(0, 5);
  }

  clearFocus(): void {
    this.focusNodes = [];
  }

  getContextForLLM(userInput: string): string {
    const s = this.schema as any;
    const ctx: LLMContext = {
      schema_summary: {
        diagramType: s.diagramType,
        node_count: s.nodes?.length ?? s.participants?.length ?? 0,
        edge_count: s.edges?.length ?? s.messages?.length ?? 0,
        labels: (s.nodes || s.participants || []).map((n: any) => n.label),
      },
      recent_actions: this.history,
    };

    if (this.focusNodes.length > 0) {
      ctx.focus = { nodes: this.focusNodes };
    }

    return JSON.stringify({
      context: ctx,
      input: userInput,
    });
  }
}
