import { describe, it, expect, beforeEach } from 'vitest';
import { DiagramState } from '../diagram-state';
import { DiagramPatch } from '../schema';

describe('DiagramState — setSchema', () => {
  let ds: DiagramState;

  beforeEach(() => { ds = new DiagramState(); });

  it('should accept valid raw schema and produce compiled output', () => {
    const result = ds.setSchema({
      diagramType: 'flowchart',
      nodes: [
        { label: '开始', type: 'start', id_hint: 'start' },
        { label: '结束', type: 'end', id_hint: 'end' },
      ],
      edges: [{ from: '开始', to: '结束' }],
    });
    expect(result.schema).not.toBeNull();
    expect(result.errors).toHaveLength(0);

    const mermaid = ds.compile();
    expect(mermaid).toContain('flowchart TD');
    expect(mermaid).toContain('开始');
  });

  it('should reject invalid schema', () => {
    const result = ds.setSchema({ diagramType: 'invalid', nodes: [], edges: [] });
    expect(result.schema).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('DiagramState — applyPatch', () => {
  let ds: DiagramState;

  beforeEach(() => {
    ds = new DiagramState();
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [
        { label: '登录', type: 'process', id_hint: 'login' },
        { label: '验证码', type: 'process', id_hint: 'verify' },
      ],
      edges: [{ from: '登录', to: '验证码' }],
    });
  });

  it('should add a node', () => {
    const patch: DiagramPatch = {
      operations: [{ type: 'addNode', node: { label: '支付', type: 'process', id_hint: 'pay' } }],
    };
    ds.applyPatch(patch);
    expect(ds.getSchema().nodes).toHaveLength(3);
    const mermaid = ds.compile();
    expect(mermaid).toContain('支付');
  });

  it('should rename a node', () => {
    const loginId = ds.getSchema().nodes.find(n => n.label === '登录')!.id;
    const patch: DiagramPatch = {
      operations: [{ type: 'renameNode', target: { id: loginId }, newLabel: '邮箱登录' }],
    };
    ds.applyPatch(patch);
    expect(ds.getSchema().nodes.find(n => n.id === loginId)!.label).toBe('邮箱登录');
  });

  it('should remove a node and its edges', () => {
    const loginId = ds.getSchema().nodes.find(n => n.label === '登录')!.id;
    const patch: DiagramPatch = {
      operations: [{ type: 'removeNode', target: { id: loginId } }],
    };
    ds.applyPatch(patch);
    expect(ds.getSchema().nodes).toHaveLength(1);
    expect(ds.getSchema().edges).toHaveLength(0);
  });
});

describe('DiagramState — undo/redo', () => {
  let ds: DiagramState;

  beforeEach(() => {
    ds = new DiagramState();
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [
        { label: 'A', type: 'process', id_hint: 'a' },
        { label: 'B', type: 'process', id_hint: 'b' },
      ],
      edges: [],
    });
  });

  it('should undo last patch', () => {
    ds.applyPatch({ operations: [{ type: 'addNode', node: { label: 'C', type: 'process', id_hint: 'c' } }] });
    expect(ds.getSchema().nodes).toHaveLength(3);

    ds.undo();
    expect(ds.getSchema().nodes).toHaveLength(2);
  });

  it('should redo undone patch', () => {
    ds.applyPatch({ operations: [{ type: 'addNode', node: { label: 'C', type: 'process', id_hint: 'c' } }] });
    ds.undo();
    ds.redo();
    expect(ds.getSchema().nodes).toHaveLength(3);
  });

  it('canUndo / canRedo should reflect state', () => {
    expect(ds.canUndo).toBe(false);
    ds.applyPatch({ operations: [{ type: 'addNode', node: { label: 'C', type: 'process', id_hint: 'c' } }] });
    expect(ds.canUndo).toBe(true);
    expect(ds.canRedo).toBe(false);
    ds.undo();
    expect(ds.canUndo).toBe(false);
    expect(ds.canRedo).toBe(true);
  });

  it('new patch should clear redo stack', () => {
    ds.applyPatch({ operations: [{ type: 'addNode', node: { label: 'C', type: 'process' } }] });
    ds.undo();
    ds.applyPatch({ operations: [{ type: 'addNode', node: { label: 'D', type: 'process' } }] });
    expect(ds.canRedo).toBe(false);
    expect(ds.getSchema().nodes).toHaveLength(3); // A, B, D
  });
});

describe('DiagramState — getContextJson & getSummary', () => {
  it('should return JSON context', () => {
    const ds = new DiagramState();
    const json = ds.getContextJson();
    const parsed = JSON.parse(json);
    expect(parsed.diagramType).toBe('flowchart');
    expect(parsed.nodes).toEqual([]);
  });

  it('should return summary', () => {
    const ds = new DiagramState();
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [
        { label: 'A', type: 'process', id_hint: 'a' },
        { label: 'B', type: 'process', id_hint: 'b' },
      ],
      edges: [{ from: 'A', to: 'B' }],
    });
    const summary = JSON.parse(ds.getSummary());
    expect(summary.nodeCount).toBe(2);
    expect(summary.edgeCount).toBe(1);
    expect(summary.nodeLabels).toContain('A');
  });
});
