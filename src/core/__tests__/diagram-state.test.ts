import { describe, it, expect, beforeEach } from 'vitest';
import { DiagramState } from '../diagram-state';

describe('DiagramState — setSchema', () => {
  let ds: DiagramState;

  beforeEach(() => { ds = new DiagramState(); });

  it('should accept valid raw schema', () => {
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
    expect(mermaid).toContain('开始');
  });

  it('should reject invalid input', () => {
    const result = ds.setSchema({ diagramType: 'invalid', nodes: [], edges: [] });
    expect(result.schema).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('DiagramState — undo/redo (snapshot)', () => {
  let ds: DiagramState;

  beforeEach(() => {
    ds = new DiagramState();
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [
        { label: 'A', type: 'process', id_hint: 'a' },
        { label: 'B', type: 'process', id_hint: 'b' },
      ],
      edges: [{ from: 'A', to: 'B' }],
    });
  });

  it('should undo and restore previous state', () => {
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [
        { label: 'A', type: 'process', id_hint: 'a' },
        { label: 'B', type: 'process', id_hint: 'b' },
        { label: 'C', type: 'process', id_hint: 'c' },
      ],
      edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }],
    });
    expect((ds.getSchema() as any).nodes).toHaveLength(3);

    ds.undo();
    expect((ds.getSchema() as any).nodes).toHaveLength(2);
  });

  it('should redo after undo', () => {
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [
        { label: 'A', type: 'process', id_hint: 'a' },
        { label: 'B', type: 'process', id_hint: 'b' },
        { label: 'C', type: 'process', id_hint: 'c' },
      ],
      edges: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }],
    });
    ds.undo();
    ds.redo();
    expect((ds.getSchema() as any).nodes).toHaveLength(3);
  });

  it('canUndo/canRedo should reflect state', () => {
    // beforeEach calls setSchema — so canUndo is already true
    expect(ds.canUndo).toBe(true);
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [{ label: 'X', type: 'process', id_hint: 'x' }],
      edges: [],
    });
    expect(ds.canUndo).toBe(true);
    expect(ds.canRedo).toBe(false);
    ds.undo();
    expect(ds.canRedo).toBe(true);
  });

  it('new action should clear redo stack', () => {
    ds.setSchema({ diagramType: 'flowchart', nodes: [{ label: 'X', type: 'process', id_hint: 'x' }], edges: [] });
    ds.undo();
    expect(ds.canRedo).toBe(true);
    ds.setSchema({ diagramType: 'flowchart', nodes: [{ label: 'Y', type: 'process', id_hint: 'y' }], edges: [] });
    expect(ds.canRedo).toBe(false);
  });
});

describe('DiagramState — getContextJson & getSummary', () => {
  it('should return valid JSON context', () => {
    const ds = new DiagramState();
    const json = JSON.parse(ds.getContextJson());
    expect(json.diagramType).toBe('flowchart');
  });

  it('should return summary with counts', () => {
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
  });
});

describe('DiagramState — undo/redo edge cases', () => {
  it('undo returns false when stack empty', () => {
    const ds = new DiagramState();
    expect(ds.undo()).toBe(false);
  });

  it('redo returns false when stack empty', () => {
    const ds = new DiagramState();
    expect(ds.redo()).toBe(false);
  });

  it('undo returns true after two operations', () => {
    const ds = new DiagramState();
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [{ label: 'A', type: 'process', id_hint: 'a' }],
      edges: [],
    });
    expect(ds.undo()).toBe(true);
    // Stack now has the initial empty state
  });
});

describe('DiagramState — clear', () => {
  it('should clear and push to undo', () => {
    const ds = new DiagramState();
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [{ label: 'A', type: 'process', id_hint: 'a' }],
      edges: [],
    });
    expect(ds.clear()).toBe(true);
    expect(ds.canUndo).toBe(true);
    const s = ds.getSchema() as any;
    expect(s.nodes).toHaveLength(0);
    expect(s.edges).toHaveLength(0);
  });

  it('should return false when already empty', () => {
    const ds = new DiagramState();
    expect(ds.clear()).toBe(false);
  });

  it('should be able to undo clear', () => {
    const ds = new DiagramState();
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [{ label: 'A', type: 'process', id_hint: 'a' }],
      edges: [],
    });
    ds.clear();
    ds.undo();
    const s = ds.getSchema() as any;
    expect(s.nodes).toHaveLength(1);
  });
});

describe('DiagramState — getContextForLLM', () => {
  it('should include node and edge details for node-graph', () => {
    const ds = new DiagramState();
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [{ label: '开始', type: 'start', id_hint: 's' }],
      edges: [],
    });
    const ctx = ds.getContextForLLM('test input');
    expect(ctx).toContain('开始');
    expect(ctx).toContain('flowchart');
    expect(ctx).toContain('test input');
  });

  it('should include participants for sequence', () => {
    const ds = new DiagramState();
    ds.setSchema({
      diagramType: 'sequence',
      participants: [
        { id_hint: 'client', label: '客户端' },
        { id_hint: 'server', label: '服务端' },
      ],
      messages: [
        { from: '客户端', to: '服务端', text: '请求数据' },
      ],
    });
    const ctx = ds.getContextForLLM('sequence test');
    expect(ctx).toContain('客户端');
    expect(ctx).toContain('服务端');
    expect(ctx).toContain('sequence test');
  });

  it('should include root for mindmap', () => {
    const ds = new DiagramState();
    ds.setSchema({
      diagramType: 'mindmap',
      root: { id_hint: 'tech', label: '技术栈', children: [{ id_hint: 'fe', label: '前端' }] },
    });
    const ctx = ds.getContextForLLM('mindmap test');
    expect(ctx).toContain('技术栈');
    expect(ctx).toContain('前端');
    expect(ctx).toContain('mindmap test');
  });
});

describe('DiagramState — lastOperation', () => {
  it('should track last operation text', () => {
    const ds = new DiagramState();
    expect(ds.getLastOperationText()).toBe('无');
    ds.setSchema({
      diagramType: 'flowchart',
      nodes: [{ label: 'X', type: 'process', id_hint: 'x' }],
      edges: [],
    });
    expect(ds.getLastOperationText()).toBe('创建/更新了图');
    ds.undo();
    expect(ds.getLastOperationText()).toBe('撤销了上一步');
    ds.redo();
    expect(ds.getLastOperationText()).toBe('恢复了上一步');
  });
});
