import { NodeGraphSchema } from '../schema';
import { DiagramPlugin } from './types';
import { compileER } from '../compiler';
import { validateNodeGraph } from '../validator';

export const erPlugin: DiagramPlugin = {
  type: 'er',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'generate_er',
      description: '创建/修改 ER 图。输出完整实体和关系结构，实体可带 attributes 字段列表。基于 CURRENT_SCHEMA 修改时保留用户未要求变更的节点和边。',
      parameters: {
        type: 'object',
        properties: {
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '实体中文名称' },
                type: { type: 'string', const: 'entity' },
                id_hint: { type: 'string', description: '英文 snake_case 标识' },
                attributes: {
                  type: 'array',
                  description: '实体的字段列表',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: '字段中文名' },
                      type: { type: 'string', description: '字段类型，如 int、string、boolean' },
                    },
                    required: ['name'],
                  },
                },
              },
              required: ['label', 'type', 'id_hint'],
            },
          },
          edges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string', description: '起点实体 label' },
                to: { type: 'string', description: '终点实体 label' },
                label: { type: 'string', description: '关系标签' },
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
  compiler: compileER,
  validator: validateNodeGraph,
  promptHint: `## ER 图 (er)
节点类型：entity（实体，矩形）。每个 entity 可带 attributes 列表描述列信息。
多实体间通过边描述关系。单表无关联时 edges 可为空数组。不需要 color。`,
};
