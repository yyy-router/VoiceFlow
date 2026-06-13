import { NextRequest } from 'next/server';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `你是语音绘图助手，负责理解用户意图并输出完整的 DiagramSchema。

## 核心规则
1. 只能调用 generate_diagram、undo、redo、clear、ask_user 中的一个
2. 如果 CURRENT_SCHEMA 已有节点，你必须在它的基础上修改——保留用户未要求变更的节点和边，只改明确要求的部分
3. 修改已有节点时复用其 id_hint，新增节点提供新的 id_hint（英文 snake_case）
4. 流程图和架构图所有节点之间必须有边连接，不允许孤立节点。ER 图允许多实体通过边关联，也允许单实体无边的独立展示
5. 禁止输出 Mermaid 代码或文本解释
6. 同义词：登陆≈登录，ER图≈关系图，架构图≈系统结构图
7. 节点 color 字段仅当用户明确要求时才设置，值必须是合法 CSS 颜色（如 #90EE90、rgb(144,238,144)、lightgreen）。用户说"淡绿色"时转换为 #90EE90，说"橙色"转为 #FF8C00，绝不要输出中文颜色名

## 支持的图类型
- flowchart：流程图、业务流程、审批流程（节点类型：start/process/decision/end）
- architecture：系统架构、微服务架构、RAG 架构（节点类型：service/database）
- er：ER 图、数据库关系、实体关系。每个 entity 节点可带 attributes 字段列表来描述列信息。单表无关联时 edges 可为空数组（节点类型：entity）`;

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
                  color: { type: 'string', description: '节点背景色（仅流程图和架构图），值必须是合法 CSS 颜色（如 #90EE90、lightgreen、rgb(144,238,144)），禁止使用中文颜色名' },
                  attributes: {
                    type: 'array',
                    description: 'ER 图实体的字段列表，非 ER 图不需要',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: '字段中文名，如"昵称"' },
                        type: { type: 'string', description: '字段类型，如 int、string、boolean、datetime 等' },
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
        name: 'clear',
        description: '清空整个画布，清除所有节点和边，恢复到空白状态。用户说"清空""清除""重置""全部删除""新建画布"时调用。',
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
        const body = await request.json();
        const context = body.context || {};
        const userInput = body.input || '';
        const summary = context.schema_summary || {};
        const recentActions = context.recent_actions || [];

        const client = new OpenAI({
          apiKey: process.env.DASHSCOPE_API_KEY,
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        });

        // Build structured user message
        const actionLines = recentActions.length > 0
          ? recentActions.map((a: any) => `  - ${a.action}: ${a.target}`).join('\n')
          : '  无';
        const focusInfo = context.focus?.nodes
          ? `## 当前关注节点\n${context.focus.nodes.join(', ')}` : '';

        // Render node details (with attributes for ER, color for flowchart/architecture)
        const nodeDetails = summary.nodes?.length > 0
          ? summary.nodes.map((n: any) => {
              const colorStr = n.color ? ` color=${n.color}` : '';
              const attrStr = n.attributes?.length > 0
                ? ` [${n.attributes.map((a: any) => `${a.type || 'string'} ${a.name}`).join(', ')}]`
                : '';
              return `  - ${n.label}(${n.type})${colorStr}${attrStr}`;
            }).join('\n')
          : '  无';

        // Render edge details
        const edgeDetails = summary.edges?.length > 0
          ? summary.edges.map((e: any) => {
              const fromNode = summary.nodes?.find((n: any) => n.id === e.from);
              const toNode = summary.nodes?.find((n: any) => n.id === e.to);
              return `  - ${fromNode?.label || e.from} → ${toNode?.label || e.to}${e.label ? ` (${e.label})` : ''}`;
            }).join('\n')
          : '  无';

        let userMessage = `## 当前图状态
类型: ${summary.diagramType || '无'}, 节点: ${summary.node_count || 0}, 边: ${summary.edge_count || 0}

### 节点详情
${nodeDetails}

### 边详情
${edgeDetails}

## 最近操作
${actionLines}
${focusInfo}
## 用户语音指令
${userInput}`;

        send({ type: 'status', message: 'AI 正在思考...' });

        const model = process.env.LLM_MODEL || 'qwen-turbo';
        let commands: { action: string; label: string; payload: Record<string, unknown> }[] = [];
        let lastError: string | null = null;

        for (let attempt = 0; attempt < 2; attempt++) {
          const llmParams: any = {
            model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMessage },
            ],
            tools: buildTools(),
            tool_choice: 'auto',
            temperature: 0.1,
            stream: true,
            extra_body: { enable_thinking: true },
          };
          const stream = await client.chat.completions.create(llmParams) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

          // Collect tool calls and reasoning from stream
          const toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = [];
          let hasReasoning = false;
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;

            // Stream reasoning content
            if ((delta as any)?.reasoning_content) {
              if (!hasReasoning) hasReasoning = true;
              send({ type: 'reasoning', text: (delta as any).reasoning_content });
            }

            // When tool calls start, signal transition
            if (delta?.tool_calls && !toolCalls.length) {
              send({ type: 'status', message: '正在生成图表...' });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.index == null) continue;
                while (toolCalls.length <= tc.index) {
                  toolCalls.push({ id: '', type: 'function', function: { name: '', arguments: '' } });
                }
                const t = toolCalls[tc.index];
                if (tc.id) t.id = tc.id;
                if (tc.function?.name) t.function.name += tc.function.name;
                if (tc.function?.arguments) t.function.arguments += tc.function.arguments;
              }
            }
          }

          commands = [];

          for (const tc of toolCalls) {
            if (!tc.function.name) continue;
            try {
              const args: Record<string, unknown> = JSON.parse(tc.function.arguments);

              if (tc.function.name === 'generate_diagram' && args.nodes) {
                for (const n of args.nodes as any[]) {
                  if (n.type && !n.shape) n.shape = NODE_TYPE_MAP[n.type] || 'rectangle';
                }
              }

              const labelMap: Record<string, string> = {
                generate_diagram: '生成图表', undo: '撤销', redo: '重做',
                clear: '清空画布', ask_user: '反问澄清',
              };
              const label = labelMap[tc.function.name] || tc.function.name;
              commands.push({ action: tc.function.name, label, payload: args });
            } catch {
              lastError = '函数参数 JSON 解析失败';
            }
          }

          if (commands.length > 0) break;
          if (!lastError) lastError = 'AI 未返回有效指令';

          userMessage = `## 上次错误：${lastError}\n\n${userMessage}`;
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
