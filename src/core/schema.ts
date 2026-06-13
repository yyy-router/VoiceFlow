import { z } from 'zod';

// ─── Diagram Type ───
export const DiagramType = z.enum(['flowchart', 'er', 'architecture', 'sequence']);
export type DiagramType = z.infer<typeof DiagramType>;

// ─── Node Type ───
export const NodeType = z.enum([
  'start', 'process', 'decision', 'end',   // flowchart
  'entity',                                   // er
  'service', 'database',                      // architecture
]);
export type NodeType = z.infer<typeof NodeType>;

// ─── ER 实体属性 ───
export const EntityAttribute = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
});
export type EntityAttribute = z.infer<typeof EntityAttribute>;

// ─── LLM 输出节点 ───
export const RawNode = z.object({
  label: z.string().min(1),
  type: NodeType,
  id: z.string().optional(),
  id_hint: z.string().optional(),
  color: z.string().optional(),
  attributes: z.array(EntityAttribute).optional(),
});
export type RawNode = z.infer<typeof RawNode>;

// ─── 规范节点（有 id） ───
export const Node = RawNode.extend({
  id: z.string().min(1),
});
export type Node = z.infer<typeof Node>;

// ─── 边 ───
export const Edge = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
});
export type Edge = z.infer<typeof Edge>;

// ─── Node-Graph Schema (flowchart / er / architecture) ───
export const NodeGraphSchema = z.object({
  diagramType: z.enum(['flowchart', 'er', 'architecture']),
  title: z.string().optional(),
  nodes: z.array(Node),
  edges: z.array(Edge),
});
export type NodeGraphSchema = z.infer<typeof NodeGraphSchema>;

// ─── Raw Node-Graph Schema (LLM output) ───
export const RawNodeGraphSchema = z.object({
  diagramType: z.enum(['flowchart', 'er', 'architecture']),
  title: z.string().optional(),
  nodes: z.array(RawNode),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
  })),
});
export type RawNodeGraphSchema = z.infer<typeof RawNodeGraphSchema>;

// ─── Sequence Diagram ───
export const SequenceParticipant = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type SequenceParticipant = z.infer<typeof SequenceParticipant>;

export const SequenceMessageType = z.enum(['sync', 'async', 'return']).optional();

export const SequenceMessage = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  text: z.string().min(1),
  messageType: SequenceMessageType,
});
export type SequenceMessage = z.infer<typeof SequenceMessage>;

export const SequenceSchema = z.object({
  diagramType: z.literal('sequence'),
  title: z.string().optional(),
  participants: z.array(SequenceParticipant),
  messages: z.array(SequenceMessage),
});
export type SequenceSchema = z.infer<typeof SequenceSchema>;

// ─── Raw Sequence Schema (LLM output, participants may lack IDs) ───
export const RawSequenceParticipant = z.object({
  id: z.string().optional(),
  id_hint: z.string().optional(),
  label: z.string().min(1),
});

export const RawSequenceSchema = z.object({
  diagramType: z.literal('sequence'),
  title: z.string().optional(),
  participants: z.array(RawSequenceParticipant),
  messages: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    text: z.string().min(1),
    messageType: z.enum(['sync', 'async', 'return']).optional(),
  })),
});
export type RawSequenceSchema = z.infer<typeof RawSequenceSchema>;

// ─── Unified Diagram Schema (discriminated union) ───
export const DiagramSchema = z.discriminatedUnion('diagramType', [
  NodeGraphSchema,
  SequenceSchema,
]);
export type DiagramSchema = z.infer<typeof DiagramSchema>;

// ─── Raw Diagram Schema (LLM output) ───
export const RawDiagramSchema = z.discriminatedUnion('diagramType', [
  RawNodeGraphSchema,
  RawSequenceSchema,
]);
export type RawDiagramSchema = z.infer<typeof RawDiagramSchema>;

// ─── Type guards ───
export function isNodeGraph(schema: DiagramSchema): schema is NodeGraphSchema {
  return schema.diagramType !== 'sequence';
}

export function isNodeGraphRaw(schema: RawDiagramSchema): schema is RawNodeGraphSchema {
  return schema.diagramType !== 'sequence';
}

// ─── Patch (deprecated, kept for type compatibility) ───
export const PatchTarget = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  type: NodeType.optional(),
});
export type PatchTarget = z.infer<typeof PatchTarget>;

export const PatchOp = z.discriminatedUnion('type', [
  z.object({ type: z.literal('addNode'), node: RawNode }),
  z.object({ type: z.literal('removeNode'), target: PatchTarget }),
  z.object({ type: z.literal('renameNode'), target: PatchTarget, newLabel: z.string().min(1) }),
  z.object({ type: z.literal('addEdge'), edge: z.object({ from: z.string(), to: z.string(), label: z.string().optional() }) }),
  z.object({ type: z.literal('removeEdge'), from: z.string(), to: z.string() }),
]);
export type PatchOp = z.infer<typeof PatchOp>;

export const DiagramPatch = z.object({
  operations: z.array(PatchOp).min(1),
});
export type DiagramPatch = z.infer<typeof DiagramPatch>;

// ─── 校验结果 ───
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
