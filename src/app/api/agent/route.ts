import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `你是一个语音绘图助手。用户通过语音描述绘图需求，你必须调用函数来执行操作。

## 核心规则
1. 必须使用函数调用。禁止输出任何文本，只能返回 tool call 或 ask_user。
2. 模糊匹配节点：用户说的节点名可能与图中节点不完全一致，请匹配最接近的节点。
3. 同义词：登陆≈登录，ER图≈实体关系图，架构图≈系统架构图。
4. 一次可调用多个函数（如果用户一句话包含多个操作）。
5. 所有图操作必须基于 DIAGRAM_STATE_JSON 中已存在的节点，不允许凭空生成节点 id 或直接输出 Mermaid。`;

const TYPE_SHAPE_MAP: Record<string, string> = {
  start: 'round',
  process: 'rectangle',
  decision: 'diamond',
  end: 'round',
  entity: 'rectangle',
  service: 'rectangle',
  database: 'cylinder',
};

function buildTools(): OpenAI.ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'create_diagram',
        description: '创建新工程图。首次绘图或明确要求创建新图时调用。',
        parameters: {
          type: 'object',
          properties: {
            diagram_type: { type: 'string', enum: ['flowchart', 'er', 'architecture'], description: '图类型' },
            description: { type: 'string', description: '图的简短描述' },
          },
          required: ['diagram_type', 'description'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_node',
        description: '向当前图中添加新节点。LLM 根据 type 自动推断 shape。',
        parameters: {
          type: 'object',
          properties: {
            label: { type: 'string', description: '节点名称' },
            type: { type: 'string', enum: ['start', 'process', 'decision', 'end', 'entity', 'service', 'database'], description: '语义类型：flowchart用start/process/decision/end，er用entity，架构图用service/database' },
          },
          required: ['label', 'type'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_node',
        description: '删除节点，支持模糊名称匹配。',
        parameters: {
          type: 'object',
          properties: { label: { type: 'string', description: '要删除的节点名称' } },
          required: ['label'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'rename_node',
        description: '重命名节点。',
        parameters: {
          type: 'object',
          properties: {
            old_label: { type: 'string', description: '当前名称' },
            new_label: { type: 'string', description: '新名称' },
          },
          required: ['old_label', 'new_label'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'change_node_shape',
        description: '改变节点的视觉形状。',
        parameters: {
          type: 'object',
          properties: {
            label: { type: 'string', description: '节点名称' },
            shape: { type: 'string', enum: ['rectangle', 'diamond', 'cylinder', 'round'], description: '目标形状' },
          },
          required: ['label', 'shape'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_edge',
        description: '在两个节点间建立连线。',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: '起点节点名称' },
            to: { type: 'string', description: '终点节点名称' },
            label: { type: 'string', description: '关系标签（可选）' },
          },
          required: ['from', 'to'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_edge',
        description: '删除两个节点间的连线。',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: '起点节点名称' },
            to: { type: 'string', description: '终点节点名称' },
          },
          required: ['from', 'to'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'move_node',
        description: '改变单个节点在图中的相对位置。',
        parameters: {
          type: 'object',
          properties: {
            target: { type: 'string', description: '要移动的节点名称' },
            position: { type: 'string', enum: ['before', 'after'], description: '放在参考节点前还是后' },
            reference: { type: 'string', description: '参考节点名称' },
          },
          required: ['target', 'position', 'reference'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'layout_diagram',
        description: '改变图表的整体布局方向。',
        parameters: {
          type: 'object',
          properties: {
            direction: { type: 'string', enum: ['TD', 'LR', 'RL', 'BT'], description: 'TD=上到下(默认), LR=左到右, RL=右到左, BT=下到上' },
          },
          required: ['direction'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'undo',
        description: '撤销上一步操作。',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'redo',
        description: '恢复被撤销的操作。',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ask_user',
        description: '有歧义或无法确定时，向用户反问澄清。',
        parameters: {
          type: 'object',
          properties: { question: { type: 'string', description: '澄清问题' } },
          required: ['question'],
        },
      },
    },
  ];
}

const ACTION_LABELS: Record<string, string> = {
  create_diagram: '创建图表',
  add_node: '添加节点',
  delete_node: '删除节点',
  rename_node: '重命名节点',
  change_node_shape: '改变形状',
  add_edge: '添加连线',
  delete_edge: '删除连线',
  move_node: '移动节点',
  layout_diagram: '调整布局',
  undo: '撤销',
  redo: '恢复',
  ask_user: '请求澄清',
};

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const { userInput, diagramStateJson, lastOperation } = await request.json();

        const client = new OpenAI({
          apiKey: process.env.DASHSCOPE_API_KEY,
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        });

        const userMessage = `## DIAGRAM_STATE_JSON
${diagramStateJson || '{}'}

## 最近操作
${lastOperation || '无'}

## 用户语音指令
${userInput}`;

        send({ type: 'thinking', message: 'AI 正在理解指令...' });

        const response = await client.chat.completions.create({
          model: process.env.LLM_MODEL || 'qwen-plus',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          tools: buildTools(),
          tool_choice: 'auto',
          temperature: 0.1,
        });

        const msg = response.choices[0]?.message;
        const toolCalls = msg?.tool_calls || [];

        const commands: { action: string; label: string; payload: Record<string, unknown> }[] = [];

        for (const tc of toolCalls) {
          if (tc.type !== 'function') continue;
          const fn = tc.function as { name: string; arguments: string };
          const args: Record<string, unknown> = JSON.parse(fn.arguments);

          if (fn.name === 'add_node' && args.type && !args.shape) {
            args.shape = TYPE_SHAPE_MAP[args.type as string] || 'rectangle';
          }

          const label = ACTION_LABELS[fn.name] || fn.name;
          commands.push({ action: fn.name, label, payload: args });
        }

        send({ type: 'commands', commands });
        controller.close();
      } catch (error) {
        console.error('Agent API error:', error);
        send({
          type: 'commands',
          commands: [{ action: 'ask_user', label: '错误', payload: { question: 'AI 服务暂时不可用，请稍后重试。' } }],
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
