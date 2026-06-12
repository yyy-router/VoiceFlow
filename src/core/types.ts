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

export type LayoutDirection = 'TD' | 'LR' | 'RL' | 'BT';

export interface DiagramStateData {
  type: DiagramType;
  direction: LayoutDirection;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export type ActionName =
  | 'create_diagram'
  | 'add_node'
  | 'delete_node'
  | 'rename_node'
  | 'change_node_shape'
  | 'add_edge'
  | 'delete_edge'
  | 'move_node'
  | 'layout_diagram'
  | 'undo'
  | 'redo'
  | 'ask_user';

export type NodeType = 'start' | 'process' | 'decision' | 'end' | 'entity' | 'service' | 'database';

export interface DiagramCommand {
  action: ActionName;
  payload: Record<string, unknown>;
}

export interface AgentRequest {
  userInput: string;
  diagramStateJson: string;
  lastOperation: string;
}

export interface AgentResponse {
  commands: DiagramCommand[];
}

export interface LastOperation {
  action: string;
  nodeLabel?: string;
  nodeId?: string;
}
