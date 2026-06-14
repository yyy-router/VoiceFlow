import { MindmapSchema } from '../schema';
import { DiagramPlugin } from './types';
import { compileMindmap } from '../compiler';
import { ValidationResult } from '../schema';

function validateMindmap(data: unknown): ValidationResult {
  const result = MindmapSchema.safeParse(data);
  if (!result.success) {
    return { valid: false, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
  }
  // Check for duplicate IDs
  const ids = new Set<string>();
  const dupIds = new Set<string>();
  const walk = (node: any) => {
    if (ids.has(node.id)) dupIds.add(node.id); else ids.add(node.id);
    if (node.children) node.children.forEach(walk);
  };
  walk(result.data.root);
  if (dupIds.size > 0) return { valid: false, errors: [`重复节点 ID: [${[...dupIds].join(', ')}]`] };
  return { valid: true, errors: [] };
}

export const mindmapPlugin: DiagramPlugin = {
  type: 'mindmap',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'generate_mindmap',
      description: '创建/修改思维导图。使用树状结构展示中心主题和分支，支持递归 children 和颜色指定。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '标题（可选）' },
          root: {
            type: 'object',
            description: '中心主题节点',
            properties: {
              label: { type: 'string', description: '中心主题中文名称' },
              id_hint: { type: 'string', description: '英文 snake_case 标识' },
              color: { type: 'string', description: '节点背景色（可选），仅用户明确要求时填写' },
              children: {
                type: 'array',
                description: '子分支节点（递归结构）',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: '节点中文名称' },
                    id_hint: { type: 'string', description: '英文标识' },
                    color: { type: 'string', description: '节点背景色，仅用户明确要求时填写' },
                    children: { type: 'array', description: '子节点（继续嵌套）' },
                  },
                  required: ['label'],
                },
              },
            },
            required: ['label'],
          },
        },
        required: ['root'],
      },
    },
  },
  schema: MindmapSchema,
  compiler: compileMindmap,
  validator: validateMindmap,
  promptHint: `## 思维导图 (mindmap)
树状结构，根节点 root((中心主题)) 是中心主题，children 递归嵌套子分支。每层最多 5-7 个子节点。
id_hint 必须英文 snake_case。不需要 color 字段。`,
};
