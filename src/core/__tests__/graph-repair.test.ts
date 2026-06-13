import { describe, it, expect } from 'vitest';
import { repairGraph } from '../graph-repair';
import { DiagramSchema } from '../schema';

describe('repairGraph', () => {
  it('should connect orphan node to existing graph', () => {
    const schema: DiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'start', label: '开始', type: 'start' },
        { id: 'login', label: '登录', type: 'process' },
        { id: 'verify', label: '验证码', type: 'process' },
      ],
      edges: [{ from: 'start', to: 'login' }],
    };
    const result = repairGraph(schema);
    expect(result.edges.some(e => e.to === 'verify' || e.from === 'verify')).toBe(true);
  });

  it('should not modify if all nodes already connected', () => {
    const schema: DiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'a', label: 'A', type: 'process' },
        { id: 'b', label: 'B', type: 'process' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    const result = repairGraph(schema);
    expect(result.edges).toHaveLength(1);
  });

  it('should linear-connect nodes with no edges', () => {
    const schema: DiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'a', label: 'A', type: 'process' },
        { id: 'b', label: 'B', type: 'process' },
        { id: 'c', label: 'C', type: 'process' },
      ],
      edges: [],
    };
    const result = repairGraph(schema);
    expect(result.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('should bridge disconnected components', () => {
    const schema: DiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'a', label: 'A', type: 'process' },
        { id: 'b', label: 'B', type: 'process' },
        { id: 'c', label: 'C', type: 'process' },
        { id: 'd', label: 'D', type: 'process' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'c', to: 'd' },
      ],
    };
    const result = repairGraph(schema);
    expect(result.edges.length).toBeGreaterThan(2);
  });
});
