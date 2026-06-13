import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `你是语音绘图助手，负责理解用户意图并输出完整的 DiagramSchema。

## 核心规则
1. 只能调用 generate_diagram，必须输出完整的 nodes 和 edges
2. 如果 CURRENT_SCHEMA 已有节点，你必须在它的基础上修改——保留用户未要求变更的节点和边，只改明确要求的部分
3. 修改已有节点时复用其 id_hint，新增节点提供新的 id_hint（英文 snake_case）
4. 所有节点之间必须有边连接（edges 不能为空），不允许孤立节点
5. 禁止输出 Mermaid 代码或文本解释
6. 同义词：登陆≈登录，ER图≈关系图，架构图≈系统结构图

## 支持的图类型
- flowchart：流程图、业务流程、审批流程（节点类型：start/process/decision/end）
- architecture：系统架构、微服务架构、RAG 架构（节点类型：service/database）
- er：ER 图、数据库关系、实体关系（节点类型：entity）`;

const NODE_TYPE_MAP: Record<string, string> = {
  start: 'round', process: 'rectangle', decision: 'diamond', end: 'round',
  entity: 'rectangle', service: 'rectangle', database: 'cylinder',
};

// ─── Tools ───
function buildTools(): OpenAI.ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'generate_diagram',
        description: '创建新工程图。用户首次提出绘图需求时调用。输出完整节点和边结构，节点需提供 id_hint。',
        parameters: {
          type: 'object',
          properties: {
            diagramType: { type: 'string', enum: ['flowchart', 'er', 'architecture'], description: '图类型' },
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: '节点中文名称' },
                  type: { type: 'string', enum: ['start', 'process', 'decision', 'end', 'entity', 'service', 'database'], description: '节点语义类型' },
                  id_hint: { type: 'string', description: '英文 snake_case 标识，如 login、sms_verify' },
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
          required: ['diagramType', 'nodes', 'edges'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'undo',
        description: '撤销上一步操作，回到操作前的图状态。用户说"撤销""回退""回到上一步"时调用。',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'redo',
        description: '恢复被撤销的操作。用户说"恢复""重做""前进"时调用。',
        parameters: { type: 'object', properties: {}, required: [] },
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

// ─── Main Handler ───
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const { userInput, diagramStateJson, lastOperation } = await request.json();
        const schema = JSON.parse(diagramStateJson || '{}');
        const hasDiagram = schema.nodes && schema.nodes.length > 0;

        const client = new OpenAI({
          apiKey: process.env.DASHSCOPE_API_KEY,
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        });

        // ── Context Strategy ──
        const currentSchemaStr = hasDiagram ? diagramStateJson : '{}';

        const userMessage = `## CURRENT_SCHEMA（当前图的完整结构，你必须基于它修改）
${currentSchemaStr}

## 最近操作
${lastOperation || '无'}

## 用户语音指令
${userInput}`;

        send({ type: 'thinking', message: 'AI 正在理解指令...' });

        let commands: { action: string; label: string; payload: Record<string, unknown> }[] = [];
        let lastError: string | null = null;

        for (let attempt = 0; attempt < 2; attempt++) {
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

          commands = [];

          for (const tc of toolCalls) {
            if (tc.type !== 'function') continue;
            const fn = tc.function as { name: string; arguments: string };
            try {
              const args: Record<string, unknown> = JSON.parse(fn.arguments);

              if (fn.name === 'generate_diagram' && args.nodes) {
                // auto-map type to shape for rendering
                for (const n of args.nodes as any[]) {
                  if (n.type && !n.shape) n.shape = NODE_TYPE_MAP[n.type] || 'rectangle';
                }
              }

              commands.push({ action: fn.name, label: '生成图表', payload: args });
            } catch {
              lastError = '函数参数 JSON 解析失败';
            }
          }

          if (commands.length > 0) break;
          if (!lastError) lastError = 'AI 未返回有效指令';

          // Repair: prepend error context
          userMessage.split('\n')[0] = `## 上次错误：${lastError}\n\n` + userMessage;
        }

        if (commands.length === 0) {
          commands = [{ action: 'ask_user', label: '错误', payload: { question: '抱歉，没有理解您的指令，请换一种说法试试。' } }];
        }

        send({ type: 'commands', commands });
        controller.close();
      } catch (error) {
        console.error('Agent API error:', error);
        send({
          type: 'commands',
          commands: [{ action: 'ask_user', label: '错误', payload: { question: 'AI 服务暂不可用，请稍后重试。' } }],
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
