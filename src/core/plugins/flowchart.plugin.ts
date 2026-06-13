import { NodeGraphSchema } from '../schema';
import { DiagramPlugin } from './types';
import { compileFlowchart } from '../compiler';
import { validateNodeGraph } from '../validator';

export const flowchartPlugin: DiagramPlugin = {
  type: 'flowchart',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'generate_flowchart',
      description: '创建/修改流程图。输出完整节点和边结构，节点需提供 id_hint。基于 CURRENT_SCHEMA 修改时保留用户未要求变更的节点和边。',
      parameters: {
        type: 'object',
        properties: {
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '节点中文名称' },
                type: { type: 'string', enum: ['start', 'process', 'decision', 'end'], description: '节点语义类型' },
                id_hint: { type: 'string', description: '英文 snake_case 标识' },
                color: { type: 'string', description: '节点背景色（仅用户明确要求时设置），CSS 值如 #90EE90' },
              },
              required: ['label', 'type', 'id_hint'],
            },
          },
          edges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string', description: '起点节点 label' },
                to: { type: 'string', description: '终点节点 label' },
                label: { type: 'string', description: '关系标签（可选）' },
              },
              required: ['from', 'to'],
            },
          },
        },
        required: ['nodes', 'edges'],
      },
    },
  },
  schema: NodeGraphSchema,
  compiler: compileFlowchart,
  validator: validateNodeGraph,
  promptHint: `## 流程图 (flowchart)
节点类型：start（开始，圆形）/ process（处理，矩形）/ decision（判断，菱形）/ end（结束，圆形）
所有节点必须有边连接，不允许孤立节点。节点 color 仅用户明确要求时设置。
节点超过6个时，边的 label 尽量简短（1-3字），避免线条拥挤。`,
};
