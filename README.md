# VoiceFlow Agent

> 说一句话，生成一张图——纯语音驱动的 AI 工程绘图工具。

![Next.js](https://img.shields.io/badge/Next.js-black)
![TypeScript](https://img.shields.io/badge/TypeScript-blue)
![Mermaid](https://img.shields.io/badge/Mermaid-purple)
![Qwen](https://img.shields.io/badge/Qwen-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 项目简介

传统绘图工具依赖鼠标拖拽和频繁的工具栏切换，绘制一张工程图往往需要数十分钟。

VoiceFlow Agent 通过大语言模型与实时语音识别技术，实现"说一句话即可生成图表"的交互模式。用户只需按住按钮说出需求，系统自动完成**语音识别 → 意图理解 → Schema 生成 → Mermaid 编译 → 图形渲染**，全程无需鼠标与键盘操作。

> "画一个用户登录流程图，包含验证码校验"
>
> "把开始节点改成绿色，给订单表加一个创建时间字段"
>
> "清空画布，新建一个微服务架构图，前端层背景浅蓝"

---

## Demo

### 语音创建流程图

用户："创建一个用户登录流程图"

<img src="E:\code_store\VoiceFlowAgent\README.assets\流程图演示.gif" alt="流程图演示" style="zoom:33%;" />

### 语音创建 ER 图

用户："创建用户表和订单表，并建立一对多关系"

<img src="E:\code_store\VoiceFlowAgent\README.assets\ER图演示.gif" alt="ER图演示" style="zoom:33%;" />

### 语音创建架构图

用户："画一个微服务系统架构图，包含前端层、网关层、服务层、数据层"

<img src="E:\code_store\VoiceFlowAgent\README.assets\架构图演示.gif" alt="架构图演示" style="zoom:33%;" />

### 语音创建思维导图

用户："画一个前端技术栈思维导图"

<img src="E:\code_store\VoiceFlowAgent\README.assets\思维导图演示.gif" alt="思维导图演示" style="zoom:33%;" />

---

## 核心创新

### 1. Schema First Architecture

```
Natural Language → Diagram Schema → Mermaid Compiler → SVG
```

不做直接生成 Mermaid 代码的简单方案。而是让 LLM 输出结构化 Schema（Zod 校验），再通过编译器生成 DSL。这保证了：

- 输出稳定可预测——JSON 比自由文本更可靠
- 支持 Undo/Redo——Schema 快照即可回滚
- 便于增量编辑——Schema 是唯一数据源（Single Source of Truth）

### 2. Plugin Driven Diagram Engine

新增图表类型只需三步，**无需修改任何核心代码**：

```ts
interface DiagramPlugin {
  type: string;
  toolDefinition: ChatCompletionTool;   // OpenAI Function Calling 定义
  schema: ZodSchema;                    // Zod 数据校验
  compiler: (data: any) => string;      // Schema → Mermaid DSL
  validator: (data: any) => ValidationResult;
  promptHint: string;                   // 注入 System Prompt
}
```

目前内置 5 个插件：flowchart / architecture / er / sequence / mindmap。扩展新类型只需新建插件文件并注册。

### 3. Context-Aware Continuous Editing

多轮对话持续优化同一张图：

- 上下文自动回传（Schema 摘要 + 操作日志 + 焦点节点）
- LLM 基于当前状态增量修改，而非每次重新生成
- 支持模糊引用："把刚才那个节点改成蓝色"→自动解析目标

### 4. Graph Repair Mechanism

针对 Mermaid 复杂图布局问题，内置确定性修复模块：

- **孤立节点自动连接**——基于标签语义相似度匹配最近节点
- **连通分量桥接**——多组件图自动添加桥接边
- **空图线性链**——首次创建的节点自动连成链
- **ER 图实体名称**——使用 label 而非 hash ID，可读性更好

---

## 核心特性

### 纯语音驱动

- 按住说话，松开生成——全程零键鼠操作
- 连续交互：创建、修改、撤销、重做、清空
- ASR 实时语音识别 + LLM 流式思考过程展示

### Agent 智能理解

基于千问大模型 + Function Calling：

- 复杂指令自动拆解为结构化 Schema
- 多轮上下文记忆，持续优化同一张图不丢信息
- 模糊引用自动解析
- 中文颜色名自动转 CSS 值（"淡绿色"→`#90EE90`）
- **歧义反问**：遇到不确定的指令时，Agent 主动反问澄清（如"您指的是用户表还是订单表？"）

### 多画板 + 本地持久化

- 底部 Tab 栏管理多个独立画板（Draw.io 风格）
- 每个画板独立 undo/redo 栈、操作日志、LLM 上下文
- localStorage 自动存取，刷新/关闭页面不丢失

---

## 项目架构

<img src="E:\code_store\VoiceFlowAgent\README.assets\系统架构图.svg" alt="系统架构图" style="zoom:200%;" />

### 目录结构

```
src/
├── app/
│   ├── page.tsx                    # 主页面（Canvas + VoicePanel + BottomTabBar）
│   └── api/
│       ├── agent/route.ts          # LLM Agent API（SSE 流式 + Plugin 驱动）
│       └── speech/route.ts         # ASR WebSocket 中继
├── components/
│   ├── DiagramCanvas.tsx           # Mermaid SVG（缩放/拖拽/点阵背景）
│   ├── VoicePanel.tsx              # 语音面板 + 思考过程 + 追问展示
│   ├── BottomTabBar.tsx            # 多画板标签栏（双击重命名）
│   ├── ExportButton.tsx            # SVG 导出
│   └── ErrorBoundary.tsx           # React 错误边界
├── hooks/
│   ├── useSpeech.ts                # 浏览器音频采集（PCM 16kHz）
│   ├── useDiagramAgent.ts          # SSE 事件消费
│   └── useDiagramState.ts          # 多画板 BoardStore 状态管理
├── core/
│   ├── schema.ts                   # Zod 联合类型（5 种图 discriminated union）
│   ├── compiler.ts                 # Schema → Mermaid DSL（6 个编译函数）
│   ├── validator.ts                # 解析 → 标准化 → ID 生成 → 校验
│   ├── diagram-state.ts            # 单画板状态机（undo/redo/context）
│   ├── board-store.ts              # 多画板 + localStorage 持久化
│   ├── graph-repair.ts             # 图连通性自动修复
│   └── plugins/
│       ├── types.ts                # DiagramPlugin 接口
│       ├── registry.ts             # 插件注册中心
│       ├── flowchart.plugin.ts     # 流程图
│       ├── architecture.plugin.ts  # 架构图（subgraph 分层）
│       ├── er.plugin.ts            # ER 图
│       ├── sequence.plugin.ts      # 时序图
│       └── mindmap.plugin.ts       # 思维导图
└── lib/
    └── asr-pool.ts                 # ASR 连接池（预连接/指数退避）
```

---

## 支持的图表类型

| 类型 | 语音示例 | 特性 |
|------|----------|------|
| **流程图** | "画一个请假审批流程" | start/process/decision/end 节点，默认莫兰迪配色 |
| **架构图** | "画一个微服务系统架构图" | subgraph 分层 + groupColors，分组自动配色 |
| **ER 图** | "画一个用户表的 ER 图" | entity 属性字段，多表关联，多轮追加 |
| **时序图** | "画一个用户登录时序图" | participants/messages，sync/async/return |
| **思维导图** | "画一个前端技术栈思维导图" | 递归树结构，按深度自动配色 |

### 通用能力

- 节点颜色："把开始节点设为绿色"→自动转 CSS 颜色值
- 架构图分层配色：groupColors 控制分组背景 / node color 控制单节点
- 撤销/重做：快照式 undo/redo
- 清空画布 + Undo 恢复

---

## 快速开始

```bash
npm install

cp .env.example .env
# 编辑 .env：填入 DASHSCOPE_API_KEY

npm run dev          # → http://localhost:3000
npm test             # 50 个单元测试
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DASHSCOPE_API_KEY` | 阿里云百炼 API Key | 必填 |
| `LLM_MODEL` | 大模型 | `qwen-turbo` |
| `ASR_MODEL` | 语音识别模型 | `qwen3-asr-flash-realtime` |

推荐 `LLM_MODEL=qwen3.6-flash`，支持思考模式 + 流式推理。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js + React |
| 语言 | TypeScript |
| AI | DashScope（千问 LLM + 通义 ASR），OpenAI SDK 兼容模式 |
| 图表 | Mermaid（flowchart / erDiagram / architecture / sequenceDiagram / mindmap） |
| 校验 | Zod |
| 样式 | Tailwind CSS |
| 测试 | Vitest |

---

## Roadmap

- [x] 流程图 / ER 图 / 架构图（subgraph 分层）
- [x] 时序图 / 思维导图
- [x] 多画板 + 本地持久化
- [x] Plugin 插件架构 + 流式思考过程
- [ ] 甘特图 / 类图 / 状态图
- [ ] SVG / PNG 导出
- [ ] Draw.io 导出
- [ ] MCP Integration
- [ ] Agent Workflow Builder
- [ ] 暗色主题

---

## 项目依赖与原创声明

### 第三方依赖

| 依赖 | 用途 |
|------|------|
| **Next.js** | 全栈框架（SSR + API Routes + React 组件渲染） |
| **React** | UI 组件框架 |
| **TypeScript** | 类型系统 |
| **Mermaid** | 图表 DSL 解析与 SVG 渲染（flowchart / erDiagram / sequenceDiagram / mindmap） |
| **OpenAI SDK** | DashScope API 兼容调用（LLM + ASR） |
| **Zod** | Schema 校验（LLM 输出的结构化 JSON 校验） |
| **Tailwind CSS** | 原子化 CSS 样式 |
| **Lucide React** | UI 图标（麦克风、撤销、重做等） |
| **ws** | WebSocket 客户端（ASR 实时语音中继） |
| **Vitest** | 单元测试框架 |
| **ESLint** | 代码规范性检查 |
| **DashScope（阿里云百炼）** | 外部 AI 平台——Qwen LLM（千问 Function Calling）+ Qwen ASR（通义实时语音识别） |

### 原创功能部分

以下为本项目自主设计、独立实现的核心模块：

| 模块 | 说明 |
|------|------|
| **Schema First 架构** | LLM 输出 Zod 校验的结构化 JSON Schema → 编译器生成 Mermaid DSL，保证输出稳定可预测。 |
| **Plugin 插件注册中心** | `DiagramPlugin` 接口 + 动态注册 + 自动 Tool/Prompt 生成。新增图表类型仅需新建插件文件并注册，无需修改核心代码。内置 flowchart / architecture / ER / sequence / mindmap 5 个插件。 |
| **Graph Repair 图修复** | 确定性图连通性修复：孤立节点自动桥接、连通分量合并、空图线性链。 |
| **多画板 BoardStore** | 多独立画板管理（Draw.io 风格标签页）+ localStorage 持久化，刷新不丢失。 |
| **DiagramState 状态机** | 单画板快照式 undo/redo 栈、操作日志、焦点节点追踪、LLM 上下文回传。 |
| **上下文感知连续编辑** | 多轮对话中自动回传 Schema 摘要 + 操作日志 + 焦点节点，LLM 基于当前状态增量修改。 |
| **SSE 流式思考过程** | 利用 DashScope `enable_thinking` 参数获取 LLM 推理链，通过 SSE 实时推送至前端展示。 |
| **语音全链路** | 浏览器音频采集 PCM 16kHz → WebSocket 中继 → Qwen ASR 实时识别 → Agent API 处理 → SSE 流式返回，全程零键鼠操作。 |

---

## License

MIT
