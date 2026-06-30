import { ClassDiagramSchema } from '../schema';
import { DiagramPlugin } from './types';
import { compileClassDiagram } from '../compiler';
import { validateNodeGraph } from '../validator';
import { ValidationResult } from '../schema';

function validateClassDiagram(data: unknown): ValidationResult {
  const result = ClassDiagramSchema.safeParse(data);
  if (!result.success) {
    return { valid: false, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
  }
  return validateNodeGraph(result.data as any);
}

export const classPlugin: DiagramPlugin = {
  type: 'class',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'generate_class',
      description: '创建/修改类图。用 UML 风格展示类名、属性、方法，以及类之间的关系（继承/组合/聚合/关联/依赖）。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '标题（可选）' },
          nodes: {
            type: 'array',
            description: '类节点列表',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '类名（中文或英文）' },
                id_hint: { type: 'string', description: '英文 snake_case 标识' },
                attributes: {
                  type: 'array',
                  description: '类的属性/字段',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: '属性名' },
                      type: { type: 'string', description: '属性类型，如 String、int、bool' },
                      visibility: { type: 'string', enum: ['+', '-', '#'], description: '访问修饰符：+公开 -私有 #保护' },
                    },
                    required: ['name'],
                  },
                },
                methods: {
                  type: 'array',
                  description: '类的方法',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', description: '方法名' },
                      returnType: { type: 'string', description: '返回类型，如 void、bool' },
                      visibility: { type: 'string', enum: ['+', '-', '#'], description: '访问修饰符' },
                      parameters: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string', description: '参数名' },
                            type: { type: 'string', description: '参数类型' },
                          },
                          required: ['name'],
                        },
                      },
                    },
                    required: ['name'],
                  },
                },
              },
              required: ['label', 'id_hint'],
            },
          },
          edges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string', description: '起点 id_hint' },
                to: { type: 'string', description: '终点 id_hint' },
                label: { type: 'string', description: '关系标签（1-2 字）' },
                relationType: {
                  type: 'string',
                  enum: ['inheritance', 'composition', 'aggregation', 'association', 'dependency'],
                  description: '关系类型：继承 inheritance | 组合 composition | 聚合 aggregation | 关联 association | 依赖 dependency',
                },
              },
              required: ['from', 'to'],
            },
          },
        },
        required: ['nodes', 'edges'],
      },
    },
  },
  schema: ClassDiagramSchema,
  compiler: compileClassDiagram,
  validator: validateClassDiagram,
  promptHint: `## 类图 (class)
UML 类图，展示类名、属性和方法，以及类之间的结构关系。
- 节点（nodes）：label 是类名，id_hint 英文标识。attributes 列出属性，methods 列出方法。
- 边（edges）：from/to 填 id_hint，relationType 填关系类型：
  inheritance=继承, composition=组合, aggregation=聚合, association=关联, dependency=依赖。
  不填默认为 association。
- visibility：+ 公开，- 私有，# 保护。
不要输出 type/color/group 字段。`,
};
