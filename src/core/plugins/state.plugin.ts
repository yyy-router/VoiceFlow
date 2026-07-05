import { StateDiagramSchema } from '../schema';
import { DiagramPlugin } from './types';
import { compileStateDiagram } from '../compiler';
import { ValidationResult } from '../schema';

function validateStateDiagram(data: unknown): ValidationResult {
  const result = StateDiagramSchema.safeParse(data);
  if (!result.success) {
    return { valid: false, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
  }
  const s = result.data;
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const n of s.nodes) {
    if (ids.has(n.id)) errors.push(`重复状态 ID: ${n.id}`);
    ids.add(n.id);
  }
  for (const e of s.edges) {
    if (!ids.has(e.from) && e.from !== '[*]') errors.push(`变迁引用不存在的起点: ${e.from}`);
    if (!ids.has(e.to) && e.to !== '[*]') errors.push(`变迁引用不存在的终点: ${e.to}`);
  }
  return { valid: errors.length === 0, errors };
}

export const statePlugin: DiagramPlugin = {
  type: 'state',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'generate_state',
      description: '创建/修改状态图。用 UML 状态机建模对象生命周期，展示事件驱动的状态迁移。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '标题（可选）' },
          nodes: {
            type: 'array',
            description: '状态节点列表（含初始/终止伪状态外的所有状态 + 判定伪状态）',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '状态名称（四字标准命名，如"待支付""已发货"）' },
                id_hint: { type: 'string', description: '英文 snake_case 标识，如 pending、shipped' },
                description: { type: 'string', description: '状态内部行为描述（可选），如"等待用户完成付款"' },
                stateType: { type: 'string', enum: ['simple', 'choice', 'composite'], description: 'simple=普通状态（默认）, choice=菱形判定, composite=复合状态（含子状态）' },
                children: {
                  type: 'array',
                  description: '复合状态的子状态列表（仅 stateType=composite 时有效），结构同 nodes',
                },
              },
              required: ['label', 'id_hint'],
            },
          },
          edges: {
            type: 'array',
            description: '状态变迁列表',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string', description: '起点 id_hint，或 [*] 表示初始伪状态' },
                to: { type: 'string', description: '终点 id_hint，或 [*] 表示终止伪状态' },
                label: { type: 'string', description: '触发器描述：主动操作用动宾短语（如"商家操作发货"），时间条件用方括号（如"[支付超时]")' },
              },
              required: ['from', 'to'],
            },
          },
        },
        required: ['nodes', 'edges'],
      },
    },
  },
  schema: StateDiagramSchema,
  compiler: compileStateDiagram,
  validator: validateStateDiagram,
  promptHint: `## 状态图 (state)
UML 2.x 状态机图。严格遵守以下格式规范：

### 节点
- [*] 表示初始/终止伪状态（不需在 nodes 中声明）。
- 普通状态：stateType: "simple"，label 四字标准命名，如"待支付""已发货"。
- 判定伪状态（菱形）：stateType: "choice"。每个分支/合并点必须单独定义一个 choice 节点。
  分流：状态 → choice 节点 → 多个目标；合并：多个来源 → choice 节点 → 一个目标。
  禁止直接从状态框拉出多条箭头、禁止多条箭头直连同一个状态框。
  示例：{ "label": "付款判定", "id_hint": "pay_fork", "stateType": "choice" }

### 变迁
- from/to 填 id_hint，[ * ]填 [*]。全部单向实心箭头。
- label 标准化：主动操作 → 动宾短语（如"用户发起退款"）；时间监护 → 方括号（如"[支付超时]"）
- 禁止：初始 [*]→状态 箭头上加任何文字标签
- 禁止：变迁标签中重复出现状态名称（如"到达待支付""订单完成"），标签只写触发条件

### 复合状态
- stateType: "composite" 表示包含子状态的复合状态，子状态通过 children 字段嵌套。
- 子状态结构同普通 state node（label/id_hint/description/stateType），递归支持。
- 示例：{ "label": "已支付", "id_hint": "paid", "stateType": "composite",
  "children": [{ "label": "等待发货", "id_hint": "await_ship" }, { "label": "拣货打包", "id_hint": "picking" }] }

### 排版
- 整体按业务流程从上至下排布。不额外增加业务状态、不修改原有流转走向。
- 不要输出 type/color/group 字段。`,
};
