import { NodeGraphSchema } from '../schema';
import { DiagramPlugin } from './types';
import { compileArchitectureSubgraph } from '../compiler';
import { validateNodeGraph } from '../validator';

export const architecturePlugin: DiagramPlugin = {
  type: 'architecture',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'generate_architecture',
      description: '创建/修改系统架构图。使用分层 subgraph 展示系统架构，节点用 group 字段指定所属分层。基于 CURRENT_SCHEMA 修改时保留用户未要求变更的部分。',
      parameters: {
        type: 'object' as const,
        properties: {
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '组件中文名称' },
                type: { type: 'string', enum: ['service', 'database'], description: 'service(矩形) 或 database(圆柱)' },
                id_hint: { type: 'string', description: '英文 snake_case 标识' },
                group: { type: 'string', description: '所属分层名称，如"前端层""服务层""数据层"。同层节点自动归入同一 subgraph' },
                color: { type: 'string', description: '节点背景色，仅用户明确要求时设置' },
              },
              required: ['label', 'type', 'id_hint'],
            },
          },
          edges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string', description: '起点 id_hint' },
                to: { type: 'string', description: '终点 id_hint' },
                label: { type: 'string', description: '关系标签（简短，1-2字）' },
              },
              required: ['from', 'to'],
            },
          },
          groupColors: {
            type: 'object',
            description: '分组背景色（顶层字段，与nodes平级）。key=group名称，value=CSS颜色。仅用户提到"层/分组背景"时填写，不要和节点color混淆',
          },
        },
        required: ['nodes', 'edges'],
      },
    },
  },
  schema: NodeGraphSchema,
  compiler: compileArchitectureSubgraph,
  validator: validateNodeGraph,
  promptHint: `## 架构图 (architecture)
使用 flowchart LR + subgraph 分层模式。节点类型: service(矩形) / database(圆柱)。
每个节点填写 group 指定所属分层（如"前端层""网关层""服务层""数据层"），编译器自动归入对应 subgraph 并配色。
分层 3-5 个为宜，每层 2-4 个节点。edges 精简——只画关键数据流，每层 1-2 条代表连线即可，禁止全连接。
颜色区分（重要）：
- 用户说"XX层/XX分组背景"→用顶层 groupColors 字段，如 {"前端层":"#E3F2FD","数据层":"#F5F5F5"}
- 用户说"把某个具体的节点/服务改成XX色"→在那个节点的 color 字段设置
- 用户没有提到颜色时，不要填 color，也不要填 groupColors
title 单行，禁止换行。`,
};
