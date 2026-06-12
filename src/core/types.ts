export interface DiagramNode {
  id: string;
  label: string;
  shape?: 'rectangle' | 'diamond' | 'cylinder' | 'round';
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export type DiagramType = 'flowchart' | 'er' | 'architecture';

export interface DiagramStateData {
  type: DiagramType;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export type ActionName =
  | 'create_diagram'
  | 'add_node'
  | 'delete_node'
  | 'update_node'
  | 'add_edge'
  | 'delete_edge'
  | 'move_node'
  | 'undo'
  | 'redo'
  | 'ask_user';

export interface DiagramCommand {
  action: ActionName;
  payload: Record<string, unknown>;
}

export interface AgentRequest {
  userInput: string;
  diagramContext: string;
  lastOperation: string;
}

export interface LastOperation {
  action: string;
  nodeLabel?: string;
  nodeId?: string;
}
