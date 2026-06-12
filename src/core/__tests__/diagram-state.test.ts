import { describe, it, expect, beforeEach } from 'vitest';
import { DiagramState } from '../diagram-state';

describe('DiagramState', () => {
  let ds: DiagramState;

  beforeEach(() => {
    ds = new DiagramState();
  });

  describe('create_diagram', () => {
    it('应该创建空流程图', () => {
      ds.applyCommand({ action: 'create_diagram', payload: { diagram_type: 'flowchart', description: '测试' } });
      const state = ds.getState();
      expect(state.type).toBe('flowchart');
      expect(state.nodes).toHaveLength(0);
      expect(state.edges).toHaveLength(0);
    });

    it('应该支持 ER 图和架构图', () => {
      ds.applyCommand({ action: 'create_diagram', payload: { diagram_type: 'er', description: '订单' } });
      expect(ds.getState().type).toBe('er');

      ds.applyCommand({ action: 'create_diagram', payload: { diagram_type: 'architecture', description: 'RAG系统' } });
      expect(ds.getState().type).toBe('architecture');
    });
  });

  describe('add_node', () => {
    it('应该添加节点并自动生成 id', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: '登录', shape: 'rectangle' } });
      const state = ds.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0].label).toBe('登录');
      expect(state.nodes[0].shape).toBe('rectangle');
      expect(state.nodes[0].id).toMatch(/^node_\d+$/);
    });

    it('多个节点 id 应该不同', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'add_node', payload: { label: 'B' } });
      const ids = ds.getState().nodes.map((n) => n.id);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  describe('delete_node', () => {
    it('精确匹配应该删除节点', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: '短信验证码' } });
      ds.applyCommand({ action: 'delete_node', payload: { label: '短信验证码' } });
      expect(ds.getState().nodes).toHaveLength(0);
    });

    it('模糊匹配应该删除节点', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: '短信验证码' } });
      ds.applyCommand({ action: 'delete_node', payload: { label: '验证码' } });
      expect(ds.getState().nodes).toHaveLength(0);
    });

    it('删除节点时关联边也应删除', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'add_node', payload: { label: 'B' } });
      const [n1, n2] = ds.getState().nodes;
      ds.applyCommand({ action: 'add_edge', payload: { from: 'A', to: 'B' } });
      expect(ds.getState().edges).toHaveLength(1);

      ds.applyCommand({ action: 'delete_node', payload: { label: 'A' } });
      expect(ds.getState().edges).toHaveLength(0);
    });

    it('删除不存在的节点应该安全忽略', () => {
      ds.applyCommand({ action: 'delete_node', payload: { label: '不存在' } });
      expect(ds.getState().nodes).toHaveLength(0);
    });
  });

  describe('rename_node', () => {
    it('应该重命名节点', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: '短信验证码' } });
      ds.applyCommand({ action: 'rename_node', payload: { old_label: '短信验证码', new_label: '邮箱验证码' } });
      expect(ds.getState().nodes[0].label).toBe('邮箱验证码');
    });

    it('重命名不存在的节点应该安全忽略', () => {
      ds.applyCommand({ action: 'rename_node', payload: { old_label: '不存在', new_label: '新名称' } });
      expect(ds.getState().nodes).toHaveLength(0);
    });
  });

  describe('change_node_shape', () => {
    it('应该改变节点形状', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: '判断', shape: 'rectangle' } });
      ds.applyCommand({ action: 'change_node_shape', payload: { label: '判断', shape: 'diamond' } });
      expect(ds.getState().nodes[0].shape).toBe('diamond');
    });
  });

  describe('add_edge', () => {
    it('应该添加连线', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'add_node', payload: { label: 'B' } });
      ds.applyCommand({ action: 'add_edge', payload: { from: 'A', to: 'B', label: '调用' } });
      expect(ds.getState().edges).toHaveLength(1);
      expect(ds.getState().edges[0].label).toBe('调用');
    });

    it('重复连线应该忽略', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'add_node', payload: { label: 'B' } });
      ds.applyCommand({ action: 'add_edge', payload: { from: 'A', to: 'B' } });
      ds.applyCommand({ action: 'add_edge', payload: { from: 'A', to: 'B' } });
      expect(ds.getState().edges).toHaveLength(1);
    });

    it('节点不存在应该忽略', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'add_edge', payload: { from: 'A', to: '不存在' } });
      expect(ds.getState().edges).toHaveLength(0);
    });
  });

  describe('delete_edge', () => {
    it('应该删除连线', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'add_node', payload: { label: 'B' } });
      ds.applyCommand({ action: 'add_edge', payload: { from: 'A', to: 'B' } });
      ds.applyCommand({ action: 'delete_edge', payload: { from: 'A', to: 'B' } });
      expect(ds.getState().edges).toHaveLength(0);
    });
  });

  describe('move_node', () => {
    it('应该移动节点位置', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'add_node', payload: { label: 'B' } });
      ds.applyCommand({ action: 'add_node', payload: { label: 'C' } });

      ds.applyCommand({ action: 'move_node', payload: { target: 'C', position: 'before', reference: 'A' } });
      expect(ds.getState().nodes.map((n) => n.label)).toEqual(['C', 'A', 'B']);
    });

    it('after 位置应该正确', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'add_node', payload: { label: 'B' } });
      ds.applyCommand({ action: 'move_node', payload: { target: 'A', position: 'after', reference: 'B' } });
      expect(ds.getState().nodes.map((n) => n.label)).toEqual(['B', 'A']);
    });
  });

  describe('layout_diagram', () => {
    it('应该改变布局方向', () => {
      ds.applyCommand({ action: 'layout_diagram', payload: { direction: 'LR' } });
      expect(ds.getState().direction).toBe('LR');
    });
  });

  describe('undo / redo', () => {
    it('撤销应该恢复上一步', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      expect(ds.getState().nodes).toHaveLength(1);

      ds.applyCommand({ action: 'undo', payload: {} });
      expect(ds.getState().nodes).toHaveLength(0);
    });

    it('恢复应该重做撤销', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'undo', payload: {} });
      ds.applyCommand({ action: 'redo', payload: {} });
      expect(ds.getState().nodes).toHaveLength(1);
    });

    it('空栈撤销应该安全忽略', () => {
      ds.applyCommand({ action: 'undo', payload: {} });
      ds.applyCommand({ action: 'undo', payload: {} });
      expect(ds.getState().nodes).toHaveLength(0);
    });

    it('新操作后重做栈应该清空', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'undo', payload: {} });
      ds.applyCommand({ action: 'add_node', payload: { label: 'B' } });
      ds.applyCommand({ action: 'redo', payload: {} });
      // redo 栈已清空，不会恢复已撤销的 A
      expect(ds.getState().nodes).toHaveLength(1);
      expect(ds.getState().nodes[0].label).toBe('B');
    });
  });

  describe('canUndo / canRedo', () => {
    it('初始状态不可撤销不可恢复', () => {
      expect(ds.canUndo).toBe(false);
      expect(ds.canRedo).toBe(false);
    });

    it('操作后可撤销', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      expect(ds.canUndo).toBe(true);
      expect(ds.canRedo).toBe(false);
    });

    it('撤销后可恢复', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'undo', payload: {} });
      expect(ds.canUndo).toBe(false);
      expect(ds.canRedo).toBe(true);
    });
  });

  describe('空状态保护', () => {
    it('空图时编辑操作应该安全忽略', () => {
      ds.applyCommand({ action: 'delete_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'rename_node', payload: { old_label: 'A', new_label: 'B' } });
      ds.applyCommand({ action: 'add_edge', payload: { from: 'A', to: 'B' } });
      ds.applyCommand({ action: 'move_node', payload: { target: 'A', position: 'after', reference: 'B' } });
      // 都不该抛异常
      expect(ds.getState().nodes).toHaveLength(0);
      expect(ds.getState().edges).toHaveLength(0);
    });
  });

  describe('getContextJson', () => {
    it('应该返回 JSON 格式上下文', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: '登录', shape: 'rectangle' } });
      const json = JSON.parse(ds.getContextJson());
      expect(json.type).toBe('flowchart');
      expect(json.nodes).toHaveLength(1);
      expect(json.nodes[0].label).toBe('登录');
      expect(json.nodes[0].shape).toBe('rectangle');
      expect(json.nodes[0].id).toMatch(/^node_\d+$/);
    });

    it('边应该包含 fromLabel 和 toLabel', () => {
      ds.applyCommand({ action: 'add_node', payload: { label: 'A' } });
      ds.applyCommand({ action: 'add_node', payload: { label: 'B' } });
      ds.applyCommand({ action: 'add_edge', payload: { from: 'A', to: 'B' } });
      const json = JSON.parse(ds.getContextJson());
      expect(json.edges).toHaveLength(1);
      expect(json.edges[0].fromLabel).toBe('A');
      expect(json.edges[0].toLabel).toBe('B');
    });
  });

  describe('getLastOperationText', () => {
    it('应该返回最近操作描述', () => {
      expect(ds.getLastOperationText()).toBe('无');
      ds.applyCommand({ action: 'add_node', payload: { label: '测试' } });
      expect(ds.getLastOperationText()).toContain('测试');
    });
  });
});
