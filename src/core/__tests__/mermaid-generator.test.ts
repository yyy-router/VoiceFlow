import { describe, it, expect } from 'vitest';
import { stateToMermaid } from '../mermaid-generator';
import { DiagramStateData } from '../types';

describe('stateToMermaid', () => {
  describe('flowchart', () => {
    it('应该生成基础流程图', () => {
      const state: DiagramStateData = {
        type: 'flowchart',
        direction: 'TD',
        nodes: [
          { id: 'node_1', label: '开始', shape: 'round' },
          { id: 'node_2', label: '处理', shape: 'rectangle' },
          { id: 'node_3', label: '结束', shape: 'round' },
        ],
        edges: [
          { from: 'node_1', to: 'node_2' },
          { from: 'node_2', to: 'node_3', label: '完成' },
        ],
      };

      const result = stateToMermaid(state);

      expect(result).toContain('flowchart TD');
      expect(result).toContain('node_1([开始])');
      expect(result).toContain('node_2[处理]');
      expect(result).toContain('node_3([结束])');
      expect(result).toContain('node_1 --> node_2');
      expect(result).toContain('node_2 -->|完成| node_3');
    });

    it('应该使用自定义方向', () => {
      const state: DiagramStateData = {
        type: 'flowchart',
        direction: 'LR',
        nodes: [{ id: 'n1', label: 'A', shape: 'rectangle' }],
        edges: [],
      };
      expect(stateToMermaid(state)).toContain('flowchart LR');
    });

    it('菱形应该用花括号', () => {
      const state: DiagramStateData = {
        type: 'flowchart',
        direction: 'TD',
        nodes: [{ id: 'n1', label: '判断', shape: 'diamond' }],
        edges: [],
      };
      expect(stateToMermaid(state)).toContain('n1{判断}');
    });

    it('圆柱应该用括号', () => {
      const state: DiagramStateData = {
        type: 'flowchart',
        direction: 'TD',
        nodes: [{ id: 'n1', label: '数据库', shape: 'cylinder' }],
        edges: [],
      };
      expect(stateToMermaid(state)).toContain('n1[(数据库)]');
    });
  });

  describe('architecture', () => {
    it('应该生成 graph 而非 flowchart', () => {
      const state: DiagramStateData = {
        type: 'architecture',
        direction: 'TB',
        nodes: [{ id: 'n1', label: 'API网关', shape: 'rectangle' }],
        edges: [],
      };
      expect(stateToMermaid(state)).toContain('graph TB');
      expect(stateToMermaid(state)).not.toContain('flowchart');
    });
  });

  describe('er', () => {
    it('应该生成 erDiagram', () => {
      const state: DiagramStateData = {
        type: 'er',
        direction: 'TD',
        nodes: [{ id: 'n1', label: '用户表', shape: 'rectangle' }],
        edges: [],
      };
      const result = stateToMermaid(state);
      expect(result).toContain('erDiagram');
      expect(result).toContain('用户表');
      expect(result).toContain('int id PK');
    });

    it('重复实体只生成一次定义', () => {
      const state: DiagramStateData = {
        type: 'er',
        direction: 'TD',
        nodes: [
          { id: 'n1', label: '用户表', shape: 'rectangle' },
          { id: 'n2', label: '订单表', shape: 'rectangle' },
          { id: 'n3', label: '用户表', shape: 'rectangle' }, // 重复
        ],
        edges: [{ from: 'n1', to: 'n2', label: '下单' }],
      };
      const result = stateToMermaid(state);
      const matches = result.match(/用户表 \{/g);
      expect(matches).toHaveLength(1);
    });

    it('关系应该用 ER 语法', () => {
      const state: DiagramStateData = {
        type: 'er',
        direction: 'TD',
        nodes: [
          { id: 'n1', label: '用户表', shape: 'rectangle' },
          { id: 'n2', label: '订单表', shape: 'rectangle' },
        ],
        edges: [{ from: 'n1', to: 'n2', label: '下单' }],
      };
      expect(stateToMermaid(state)).toContain('用户表 ||--o{ 订单表 : "下单"');
    });
  });

  describe('空状态', () => {
    it('空节点应该生成空图', () => {
      const state: DiagramStateData = {
        type: 'flowchart',
        direction: 'TD',
        nodes: [],
        edges: [],
      };
      const result = stateToMermaid(state);
      expect(result).toContain('flowchart TD');
      expect(result).not.toContain('node_');
    });
  });
});
