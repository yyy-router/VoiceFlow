import { SequenceSchema } from '../schema';
import { DiagramPlugin } from './types';
import { compileSequence } from '../compiler';
import { ValidationResult } from '../schema';

function validateSequencePlugin(data: unknown): ValidationResult {
  const result = SequenceSchema.safeParse(data);
  if (!result.success) {
    return { valid: false, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
  }
  const s = result.data;
  const errors: string[] = [];
  const pIds = new Set<string>();
  const pLabels = new Set<string>();

  for (const p of s.participants) {
    if (pIds.has(p.id)) errors.push(`重复参与者 ID: ${p.id}`);
    pIds.add(p.id);
    if (pLabels.has(p.label)) errors.push(`重复参与者名称: ${p.label}`);
    pLabels.add(p.label);
  }
  for (const m of s.messages) {
    if (!pIds.has(m.from)) errors.push(`消息引用不存在的发送者: ${m.from}`);
    if (!pIds.has(m.to)) errors.push(`消息引用不存在的接收者: ${m.to}`);
  }

  return { valid: errors.length === 0, errors };
}

export const sequencePlugin: DiagramPlugin = {
  type: 'sequence',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'generate_sequence',
      description: '创建/修改时序图。输出完整的参与者列表和消息序列，展示各角色之间的交互顺序。基于 CURRENT_SCHEMA 修改时保留用户未要求变更的参与者。',
      parameters: {
        type: 'object',
        properties: {
          participants: {
            type: 'array',
            description: '时序图的参与者（角色/系统）',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '参与者中文名称，如"用户""服务器""数据库"' },
                id_hint: { type: 'string', description: '英文 snake_case 标识，如 user、api_server' },
              },
              required: ['label', 'id_hint'],
            },
          },
          messages: {
            type: 'array',
            description: '参与者之间的消息序列',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string', description: '消息发送方，填写 participant 的 label 值' },
                to: { type: 'string', description: '消息接收方，填写 participant 的 label 值。每条消息必须同时有 from 和 to' },
                text: { type: 'string', description: '消息内容描述' },
                messageType: { type: 'string', enum: ['sync', 'async', 'return'], description: '消息类型：sync(同步实线) async(异步虚线) return(返回虚线)' },
              },
              required: ['from', 'to', 'text'],
            },
          },
        },
        required: ['participants', 'messages'],
      },
    },
  },
  schema: SequenceSchema,
  compiler: compileSequence,
  validator: validateSequencePlugin,
  promptHint: `## 时序图 (sequence)
参与者（participants）代表角色或系统。消息（messages）每条必须包含 from 和 to（填写 participant 的 label）。
示例：{"from":"用户","to":"前端","text":"点击登录","messageType":"sync"} 表示用户→前端的同步调用。
messageType: sync=同步实线箭头, async=异步虚线箭头, return=返回虚线箭头。
一条消息只能从一个参与者到另一个，描述完整交互步骤。不要输出 nodes/edges。`,
};
