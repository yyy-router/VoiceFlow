import { NodeGraphSchema } from '../schema';
import { DiagramPlugin } from './types';
import { compileArchitecture } from '../compiler';
import { validateNodeGraph } from '../validator';

export const architecturePlugin: DiagramPlugin = {
  type: 'architecture',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'generate_architecture',
      description: '创建/修改系统架构图。输出完整服务和连接结构。基于 CURRENT_SCHEMA 修改时保留用户未要求变更的节点和边。',
      parameters: {
        type: 'object',
        properties: {
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '服务/组件中文名称' },
                type: { type: 'string', enum: ['service', 'database'], description: '节点类型：service(矩形) 或 database(圆柱)' },
                id_hint: { type: 'string', description: '英文 snake_case 标识' },
                color: { type: 'string', description: '节点背景色（仅用户明确要求时设置），CSS 值如 #4CAF50' },
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
                label: { type: 'string', description: '关系标签（如"读写""调用"）' },
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
  compiler: compileArchitecture,
  validator: validateNodeGraph,
  promptHint: `## 架构图 (architecture)
节点类型：service（服务，矩形）/ database（数据库，圆柱）。所有节点必须有边连接。
节点超过4个时，边的 label 尽量简短（1-2字），避免线条过多导致混乱。按分层分组命名（如"前端层""服务层""数据层"）。节点 color 仅用户明确要求时设置。`,
};
