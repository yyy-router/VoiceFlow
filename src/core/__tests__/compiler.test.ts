import { describe, it, expect } from 'vitest';
import { compileMermaid } from '../compiler';
import { NodeGraphSchema } from '../schema';

describe('compileMermaid — flowchart', () => {
  it('should generate flowchart TD with nodes and edges', () => {
    const schema: NodeGraphSchema = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'start', label: '开始', type: 'start' },
        { id: 'login', label: '登录', type: 'process' },
        { id: 'end', label: '结束', type: 'end' },
      ],
      edges: [
        { from: 'start', to: 'login' },
        { from: 'login', to: 'end', label: '成功' },
      ],
    };
    const result = compileMermaid(schema);
    expect(result).toContain('flowchart TD');
    expect(result).toContain('start([开始])');
    expect(result).toContain('login[登录]');
    expect(result).toContain('end([结束])');
    expect(result).toContain('start --> login');
    expect(result).toContain('login -->|成功| end');
  });

  it('should use correct shapes for each type', () => {
    const schema: NodeGraphSchema = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'n1', label: '判断', type: 'decision' },
        { id: 'n2', label: '数据库', type: 'database' },
        { id: 'n3', label: '服务', type: 'service' },
      ],
      edges: [],
    };
    const result = compileMermaid(schema);
    expect(result).toContain('n1{判断}');
    expect(result).toContain('n2[(数据库)]');
    expect(result).toContain('n3[服务]');
  });
});

describe('compileMermaid — architecture', () => {
  it('should generate subgraph-based architecture', () => {
    const schema: NodeGraphSchema = {
      diagramType: 'architecture',
      nodes: [
        { id: 'api', label: 'API网关', type: 'service', group: '网关层' },
        { id: 'user', label: '用户服务', type: 'service', group: '服务层' },
        { id: 'db', label: '数据库', type: 'database', group: '数据层' },
      ],
      edges: [{ from: 'api', to: 'user' }, { from: 'user', to: 'db' }],
    };
    const result = compileMermaid(schema);
    expect(result).toContain('flowchart LR');
    expect(result).toContain('subgraph');
    expect(result).toContain('网关层');
  });
});

describe('compileMermaid — ER', () => {
  it('should generate erDiagram', () => {
    const schema: NodeGraphSchema = {
      diagramType: 'er',
      nodes: [
        { id: 'user', label: '用户表', type: 'entity', attributes: [{ name: '用户ID', type: 'int' }, { name: '昵称', type: 'string' }] },
        { id: 'order', label: '订单表', type: 'entity', attributes: [{ name: '订单ID', type: 'int' }, { name: '金额', type: 'float' }] },
      ],
      edges: [{ from: 'user', to: 'order', label: '下单' }],
    };
    const result = compileMermaid(schema);
    expect(result).toContain('erDiagram');
    expect(result).toContain('用户表 {');
    expect(result).toContain('int 用户ID');
    expect(result).toContain('string 昵称');
    expect(result).toContain('下单');
  });
});
