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
    expect(ds.getSchema().nodes).toHaveLength(3);

    ds.undo();
    expect(ds.getSchema().nodes).toHaveLength(2);
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
    expect(ds.getSchema().nodes).toHaveLength(3);
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
