import { describe, it, expect } from 'vitest';
import { RawNode, Node, RawDiagramSchema, DiagramSchema, DiagramPatch, RawMindmapSchema, MindmapSchema } from '../schema';

describe('RawNode', () => {
  it('should accept valid node without id_hint', () => {
    const result = RawNode.safeParse({ label: '登录', type: 'process' });
    expect(result.success).toBe(true);
  });

  it('should accept node with id_hint', () => {
    const result = RawNode.safeParse({ label: '短信验证', type: 'process', id_hint: 'sms_verify' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.id_hint).toBe('sms_verify');
  });

  it('should reject node without label', () => {
    const result = RawNode.safeParse({ type: 'process' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid node type', () => {
    const result = RawNode.safeParse({ label: 'x', type: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('Node', () => {
  it('should require id', () => {
    const result = Node.safeParse({ id: 'n1', label: '开始', type: 'start' });
    expect(result.success).toBe(true);
  });

  it('should reject without id', () => {
    const result = Node.safeParse({ label: '开始', type: 'start' });
    expect(result.success).toBe(false);
  });
});

describe('RawDiagramSchema', () => {
  it('should accept valid flowchart schema', () => {
    const result = RawDiagramSchema.safeParse({
      diagramType: 'flowchart',
      nodes: [{ label: '开始', type: 'start' }],
      edges: [],
    });
    expect(result.success).toBe(true);
  });

  it('should accept schema with edges using labels', () => {
    const result = RawDiagramSchema.safeParse({
      diagramType: 'flowchart',
      nodes: [
        { label: 'A', type: 'process' },
        { label: 'B', type: 'process' },
      ],
      edges: [{ from: 'A', to: 'B' }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid diagramType', () => {
    const result = RawDiagramSchema.safeParse({
      diagramType: 'sequence',
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('DiagramPatch', () => {
  it('should accept addNode patch', () => {
    const result = DiagramPatch.safeParse({
      operations: [{ type: 'addNode', node: { label: '新节点', type: 'process' } }],
    });
    expect(result.success).toBe(true);
  });

  it('should accept renameNode with target by label', () => {
    const result = DiagramPatch.safeParse({
      operations: [{ type: 'renameNode', target: { label: '旧名' }, newLabel: '新名' }],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty operations', () => {
    const result = DiagramPatch.safeParse({ operations: [] });
    expect(result.success).toBe(false);
  });

  it('should accept mixed operations', () => {
    const result = DiagramPatch.safeParse({
      operations: [
        { type: 'addNode', node: { label: '支付', type: 'process' } },
        { type: 'addEdge', edge: { from: 'login', to: 'pay' } },
        { type: 'removeNode', target: { label: '旧节点' } },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('RawMindmapSchema', () => {
  it('should accept valid mindmap with recursive children', () => {
    const result = RawMindmapSchema.safeParse({
      diagramType: 'mindmap',
      root: {
        label: '中心主题',
        children: [
          { label: '分支A' },
          { label: '分支B', children: [{ label: '子节点' }] },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject mindmap without root label', () => {
    const result = RawMindmapSchema.safeParse({
      diagramType: 'mindmap',
      root: { children: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe('MindmapSchema', () => {
  it('should require id on nodes', () => {
    const result = MindmapSchema.safeParse({
      diagramType: 'mindmap',
      root: { id: 'root', label: '主题' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject nodes without id', () => {
    const result = MindmapSchema.safeParse({
      diagramType: 'mindmap',
      root: { label: '主题' },
    });
    expect(result.success).toBe(false);
  });
});
