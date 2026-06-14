import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { initPlugins, getTools, getPromptHints } from '@/core/plugins/registry';

const BASE_RULES = `你是语音绘图助手，根据用户意图选择合适的绘图工具并输出完整结构。

## 核心规则
1. 基于当前图状态修改时必须保留用户未要求变更的部分，只改明确要求的内容
2. 修改已有元素时复用其 id_hint，新增元素提供新的 id_hint（英文 snake_case）
3. 禁止输出 Mermaid 代码或文本解释
4. 同义词：登陆≈登录，ER图≈关系图，架构图≈系统结构图，时序图≈序列图
5. 节点 color 仅用户明确要求时才设置，值必须是合法 CSS 颜色（如 #90EE90），禁止中文颜色名`;

let ready = false;
let pluginTools: OpenAI.ChatCompletionTool[] = [];
let promptHints = '';
let drawNames = new Set<string>();
let typeMap: Record<string, string> = {}; // tool name → diagramType

async function ensurePlugins(): Promise<void> {
  if (ready) return;
  await initPlugins();
  pluginTools = getTools();
  promptHints = getPromptHints();
  for (const t of pluginTools) {
    const name = (t as any).function?.name || '';
    drawNames.add(name);
    // Derive diagram type from tool name: generate_flowchart → flowchart
    const dt = name.replace(/^generate_/, '');
    if (dt) typeMap[name] = dt;
  }
  ready = true;
}

function buildSystemPrompt(): string {
  return `${BASE_RULES}\n\n${promptHints}`;
}

function buildTools(): OpenAI.ChatCompletionTool[] {
  return [
    ...pluginTools,
    {
      type: 'function' as const,
      function: {
        name: 'undo', description: '撤销上一步操作。用户说"撤销""回退""回到上一步"时调用。',
        parameters: { type: 'object' as const, properties: {}, required: [] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'redo', description: '恢复被撤销的操作。用户说"恢复""重做""前进"时调用。',
        parameters: { type: 'object' as const, properties: {}, required: [] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'clear', description: '清空整个画布。用户说"清空""清除""重置""全部删除""新建画布"时调用。',
        parameters: { type: 'object' as const, properties: {}, required: [] },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'ask_user', description: '有歧义或无法确定时，向用户反问澄清。',
        parameters: {
          type: 'object' as const,
          properties: { question: { type: 'string', description: '澄清问题' } },
          required: ['question'],
        },
      },
    },
  ];
}

const LABEL_MAP: Record<string, string> = {
  undo: '撤销', redo: '重做', clear: '清空画布', ask_user: '反问澄清',
};

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

        await ensurePlugins();

        const client = new OpenAI({
          apiKey: process.env.DASHSCOPE_API_KEY,
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        });

        const actionLines = recentActions.length > 0
          ? recentActions.map((a: any) => `  - ${a.action}: ${a.target}`).join('\n')
          : '  无';
        const focusInfo = context.focus?.nodes
          ? `## 当前关注节点\n${context.focus.nodes.join(', ')}` : '';

        const nodeDetails = summary.nodes?.length > 0
          ? summary.nodes.map((n: any) => {
              const groupStr = n.group ? ` [${n.group}]` : '';
              const colorStr = n.color ? ` color=${n.color}` : '';
              const attrStr = n.attributes?.length > 0
                ? ` (${n.attributes.map((a: any) => `${a.type || 'string'} ${a.name}`).join(', ')})`
                : '';
              return `  - ${n.label}(${n.type})${groupStr}${colorStr}${attrStr}`;
            }).join('\n')
          : summary.participants?.length > 0
            ? summary.participants.map((p: any) => `  - ${p.label}`).join('\n')
            : summary.root
              ? (function renderTree(n: any, d: number): string {
                  const prefix = '  '.repeat(d + 1);
                  let out = `${prefix}- ${n.label}\n`;
                  if (n.children) for (const c of n.children) out += renderTree(c, d + 1);
                  return out;
                })(summary.root, 0).trimEnd()
              : '  无';

        const edgeDetails = summary.edges?.length > 0
          ? summary.edges.map((e: any) => {
              const fn = summary.nodes?.find((n: any) => n.id === e.from);
              const tn = summary.nodes?.find((n: any) => n.id === e.to);
              return `  - ${fn?.label || e.from} → ${tn?.label || e.to}${e.label ? ` (${e.label})` : ''}`;
            }).join('\n')
          : summary.messages?.length > 0
            ? summary.messages.map((m: any) => `  - ${m.from} → ${m.to}: ${m.text}`).join('\n')
            : '  无';

        let userMessage = `## 当前图状态
类型: ${summary.diagramType || '无'}, 节点: ${summary.node_count || 0}, 边: ${summary.edge_count || 0}

### 详情
${nodeDetails}

### 关系
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
              { role: 'system', content: buildSystemPrompt() },
              { role: 'user', content: userMessage },
            ],
            tools: buildTools(),
            tool_choice: 'auto',
            temperature: 0.1,
            stream: true,
            extra_body: { enable_thinking: true },
          };
          const stream = await client.chat.completions.create(llmParams) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

          const toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = [];
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;

            if ((delta as any)?.reasoning_content) {
              send({ type: 'reasoning', text: (delta as any).reasoning_content });
            }

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
              const name = tc.function.name;

              if (drawNames.has(name)) {
                args.diagramType = typeMap[name] || name;
                commands.push({ action: 'generate_diagram', label: '生成图表', payload: args });
              } else if (name === 'undo' || name === 'redo' || name === 'clear' || name === 'ask_user') {
                commands.push({ action: name, label: LABEL_MAP[name] || name, payload: args });
              }
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
