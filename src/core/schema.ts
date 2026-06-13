import { z } from 'zod';

// ─── Diagram Type ───
export const DiagramType = z.enum(['flowchart', 'er', 'architecture']);
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

// ─── LLM 输出节点（id 可选，LLM 可直接指定 id 或通过 id_hint 建议） ───
export const RawNode = z.object({
  label: z.string().min(1),
  type: NodeType,
  id: z.string().optional(),
  id_hint: z.string().optional(),
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

// ─── 完整 Diagram Schema ───
export const DiagramSchema = z.object({
  diagramType: DiagramType,
  title: z.string().optional(),
  nodes: z.array(Node),
  edges: z.array(Edge),
});
export type DiagramSchema = z.infer<typeof DiagramSchema>;

// ─── 未规范化的原始 Schema（LLM 输出，节点无 id） ───
export const RawDiagramSchema = z.object({
  diagramType: DiagramType,
  title: z.string().optional(),
  nodes: z.array(RawNode),
  edges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
  })),
});
export type RawDiagramSchema = z.infer<typeof RawDiagramSchema>;

// ─── Patch ───
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
