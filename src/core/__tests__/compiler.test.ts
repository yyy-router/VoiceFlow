import { describe, it, expect } from 'vitest';
import {
  compileMermaid, compileMindmap, compileER,
  compileSequence, compileArchitectureSubgraph, compileStateDiagram,
} from '../compiler';
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

describe('compileMermaid — mindmap', () => {
  it('should generate mindmap with root and children', () => {
    const schema = {
      diagramType: 'mindmap' as const,
      root: {
        id: 'root', label: 'Python学习',
        children: [
          { id: 'basics', label: '基础语法' },
          { id: 'data', label: '数据分析', children: [{ id: 'pandas', label: 'Pandas' }] },
        ],
      },
    };
    const result = compileMindmap(schema);
    expect(result).toContain('mindmap');
    expect(result).toContain('((Python学习))');
    expect(result).toContain('[基础语法]');
    expect(result).toContain('[Pandas]');
  });

  it('should not include style directives (mindmap does not support them)', () => {
    const schema = {
      diagramType: 'mindmap' as const,
      root: { id: 'r', label: '主题', color: '#FF6B6B', children: [{ id: 'c', label: '分支' }] },
    };
    const result = compileMindmap(schema);
    expect(result).not.toContain('style');
  });
});

// ─── State Diagram ───

describe('compileStateDiagram', () => {
  it('should generate stateDiagram-v2 with states and transitions', () => {
    const schema: any = {
      diagramType: 'state',
      nodes: [
        { id: 'idle', label: '空闲' },
        { id: 'active', label: '运行中', description: '正在处理请求' },
      ],
      edges: [
        { from: '[*]', to: 'idle' },
        { from: 'idle', to: 'active', label: '启动' },
        { from: 'active', to: '[*]', label: '完成' },
      ],
    };
    const result = compileStateDiagram(schema);
    expect(result).toContain('stateDiagram-v2');
    expect(result).toContain('state "空闲" as idle');
    expect(result).toContain('state "运行中" as active');
    expect(result).toContain('active : 正在处理请求');
    expect(result).toContain('[*] --> idle');
    expect(result).toContain('idle --> active : 启动');
    expect(result).toContain('active --> [*] : 完成');
  });

  it('should output <<choice>> stereotype for choice nodes', () => {
    const schema: any = {
      diagramType: 'state',
      nodes: [
        { id: 'pending', label: '待支付' },
        { id: 'fork1', label: '付款判定', stateType: 'choice' },
        { id: 'paid', label: '已支付' },
        { id: 'cancelled', label: '已取消' },
      ],
      edges: [
        { from: 'pending', to: 'fork1' },
        { from: 'fork1', to: 'paid', label: '付款成功' },
        { from: 'fork1', to: 'cancelled', label: '[支付超时]' },
      ],
    };
    const result = compileStateDiagram(schema);
    expect(result).toContain('state fork1 <<choice>>');
  });

  it('should compile through compileMermaid dispatch', () => {
    const schema = {
      diagramType: 'state',
      nodes: [{ id: 's1', label: '待支付' }],
      edges: [],
    };
    const result = compileMermaid(schema as any);
    expect(result).toContain('stateDiagram-v2');
  });
});

// ─── ER Diagram ───
describe('compileER', () => {
  it('should generate erDiagram with entities', () => {
    const schema: any = {
      diagramType: 'er',
      nodes: [
        { id: 'user', label: '用户', attributes: [{ name: '用户名', type: 'string' }] },
      ],
      edges: [],
    };
    const result = compileER(schema);
    expect(result).toContain('erDiagram');
    expect(result).toContain('用户');
    expect(result).toContain('string 用户名');
  });

  it('should include relationships', () => {
    const schema: any = {
      diagramType: 'er',
      nodes: [
        { id: 'user', label: '用户' },
        { id: 'order', label: '订单' },
      ],
      edges: [{ from: 'user', to: 'order', label: '下单' }],
    };
    const result = compileER(schema);
    expect(result).toContain('用户 ||--o{ 订单 : "下单"');
  });
});

// ─── Sequence Diagram ───
describe('compileSequence', () => {
  it('should generate sequenceDiagram with participants', () => {
    const schema: any = {
      diagramType: 'sequence',
      participants: [
        { id: 'p1', label: '客户端' },
        { id: 'p2', label: '服务端' },
      ],
      messages: [
        { from: 'p1', to: 'p2', text: '请求数据', messageType: 'sync' },
      ],
    };
    const result = compileSequence(schema);
    expect(result).toContain('sequenceDiagram');
    expect(result).toContain('participant 客户端');
    expect(result).toContain('客户端->>服务端: 请求数据');
  });

  it('should render async and return arrows', () => {
    const schema: any = {
      diagramType: 'sequence',
      participants: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      messages: [
        { from: 'a', to: 'b', text: 'async msg', messageType: 'async' },
        { from: 'b', to: 'a', text: 'reply', messageType: 'return' },
      ],
    };
    const result = compileSequence(schema);
    expect(result).toContain('A-->>B: async msg');
    expect(result).toContain('B-->>A: reply');
  });
});

// ─── Architecture Subgraph ───
describe('compileArchitectureSubgraph', () => {
  it('should generate flowchart LR with subgraph', () => {
    const schema: any = {
      diagramType: 'architecture',
      nodes: [
        { id: 'fe', label: '前端', type: 'service', group: '前端层' },
        { id: 'api', label: 'API', type: 'service', group: '网关层' },
        { id: 'db', label: 'MySQL', type: 'database', group: '数据层' },
      ],
      edges: [{ from: 'fe', to: 'api' }, { from: 'api', to: 'db' }],
    };
    const result = compileArchitectureSubgraph(schema);
    expect(result).toContain('flowchart LR');
    expect(result).toContain('subgraph');
    expect(result).toContain('前端层');
    expect(result).toContain('fe --> api');
  });
});
