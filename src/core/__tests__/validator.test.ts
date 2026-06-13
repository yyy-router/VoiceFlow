import { describe, it, expect } from 'vitest';
import { normalizeRawSchema, validateSchema, validatePatch, processRawSchema } from '../validator';
import { RawDiagramSchema, DiagramSchema, DiagramPatch } from '../schema';

describe('normalizeRawSchema', () => {
  it('should add ids to nodes using id_hint when provided', () => {
    const raw: RawDiagramSchema = {
      diagramType: 'flowchart',
      nodes: [{ label: '登录', type: 'process', id_hint: 'login' }],
      edges: [],
    };
    const result = normalizeRawSchema(raw);
    expect(result.nodes[0].id).toMatch(/^login_[a-f0-9]{4}$/);
  });

  it('should generate hash-based ids without hint', () => {
    const raw: RawDiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { label: '节点A', type: 'process' },
        { label: '节点B', type: 'process' },
      ],
      edges: [],
    };
    const result = normalizeRawSchema(raw);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toMatch(/^node_1_[a-f0-9]{4}$/);
    expect(result.nodes[1].id).toMatch(/^node_2_[a-f0-9]{4}$/);
    // IDs should be unique
    expect(result.nodes[0].id).not.toBe(result.nodes[1].id);
  });

  it('should deduplicate ids when same label appears', () => {
    const raw: RawDiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { label: '节点', type: 'process' },
        { label: '节点', type: 'process' },
      ],
      edges: [],
    };
    const result = normalizeRawSchema(raw);
    expect(result.nodes[0].id).not.toBe(result.nodes[1].id);
  });

  it('should resolve edge references using fuzzy label match', () => {
    const raw: RawDiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { label: '登录', type: 'process', id_hint: 'login' },
        { label: '验证码', type: 'process', id_hint: 'verify' },
      ],
      edges: [{ from: '登录', to: '验证码' }],
    };
    const result = normalizeRawSchema(raw);
    const loginNode = result.nodes[0];
    const verifyNode = result.nodes[1];
    expect(result.edges[0].from).toBe(loginNode.id);
    expect(result.edges[0].to).toBe(verifyNode.id);
  });
});

describe('validateSchema', () => {
  it('should pass valid schema', () => {
    const schema: DiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'a', label: 'A', type: 'process' },
        { id: 'b', label: 'B', type: 'process' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    };
    expect(validateSchema(schema).valid).toBe(true);
  });

  it('should detect duplicate node ids', () => {
    const schema: DiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'a', label: 'A', type: 'process' },
        { id: 'a', label: 'B', type: 'process' },
      ],
      edges: [],
    };
    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('重复节点 ID'))).toBe(true);
  });

  it('should detect edges referencing missing nodes', () => {
    const schema: DiagramSchema = {
      diagramType: 'flowchart',
      nodes: [{ id: 'a', label: 'A', type: 'process' }],
      edges: [{ from: 'a', to: 'missing' }],
    };
    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('不存在的终点'))).toBe(true);
  });

  it('should detect self-loop edges', () => {
    const schema: DiagramSchema = {
      diagramType: 'flowchart',
      nodes: [{ id: 'a', label: 'A', type: 'process' }],
      edges: [{ from: 'a', to: 'a' }],
    };
    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('自循环'))).toBe(true);
  });

  it('should detect duplicate edges', () => {
    const schema: DiagramSchema = {
      diagramType: 'flowchart',
      nodes: [
        { id: 'a', label: 'A', type: 'process' },
        { id: 'b', label: 'B', type: 'process' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
      ],
    };
    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('重复边'))).toBe(true);
  });

  it('should require at least one entity for ER', () => {
    const schema: DiagramSchema = {
      diagramType: 'er',
      nodes: [],
      edges: [],
    };
    const result = validateSchema(schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ER 图不能为空'))).toBe(true);
  });
});

describe('validatePatch', () => {
  const schema: DiagramSchema = {
    diagramType: 'flowchart',
    nodes: [
      { id: 'a', label: '登录', type: 'process' },
      { id: 'b', label: '验证码', type: 'process' },
    ],
    edges: [{ from: 'a', to: 'b' }],
  };

  it('should pass valid renameNode patch', () => {
    const patch: DiagramPatch = {
      operations: [{ type: 'renameNode', target: { id: 'a' }, newLabel: '邮箱登录' }],
    };
    const result = validatePatch(schema, patch);
    expect(result.valid).toBe(true);
  });

  it('should fail if target node not found', () => {
    const patch: DiagramPatch = {
      operations: [{ type: 'renameNode', target: { id: 'missing' }, newLabel: 'X' }],
    };
    const result = validatePatch(schema, patch);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('目标节点无法解析'))).toBe(true);
  });

  it('should fail if target edge not found for removeEdge', () => {
    const patch: DiagramPatch = {
      operations: [{ type: 'removeEdge', from: 'a', to: 'missing' }],
    };
    const result = validatePatch(schema, patch);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('边不存在'))).toBe(true);
  });
});

describe('processRawSchema — full pipeline', () => {
  it('should parse, normalize and validate in one pass', () => {
    const raw = {
      diagramType: 'flowchart',
      nodes: [
        { label: '开始', type: 'start', id_hint: 'start' },
        { label: '结束', type: 'end', id_hint: 'end' },
      ],
      edges: [{ from: '开始', to: '结束' }],
    };
    const result = processRawSchema(raw);
    expect(result.schema).not.toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(result.schema!.diagramType).toBe('flowchart');
    expect(result.schema!.nodes).toHaveLength(2);
    expect(result.schema!.edges).toHaveLength(1);
  });

  it('should return errors for invalid input', () => {
    const result = processRawSchema({ diagramType: 'invalid', nodes: [], edges: [] });
    expect(result.schema).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
