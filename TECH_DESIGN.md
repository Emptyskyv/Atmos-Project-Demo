# Atoms —— AI Web App 生成平台 · Demo 方案（可在线访问 / 后端 Agent / GPT-5.2）

## Context

在 `/Users/bytedance/atoms_project` 从零搭建一个面向非技术用户的 AI Web App 生成平台 Demo。用户通过对话描述需求，平台自动完成 **需求理解 → 代码生成 → 预览调试 → 发布部署 → 分享链接** 的全流程。

本轮方案确认后的硬约束如下：

1. **整体必须可在线访问**：平台本身和用户生成的 App 都要能通过公网 URL 打开。
2. **后端语言锁定为 TypeScript / Node**：方便在 Vercel 上部署和维护。
3. **Agent loop 必须运行在后端**：前端不负责 LLM 推理和会话编排。
4. **模型必须接入 OpenAI GPT-5.2**：这是核心能力，不能降级或替换。
5. **Agent 框架采用 OpenAI Agents SDK**：API 层按 OpenAI 官方推荐走 Responses API。
6. **基础设施尽量保持免费层可运行**：Vercel / Supabase / WebContainer 继续使用免费方案。

### 关于成本约束的修正

原始文档中把目标表述为“全链路零付费”。在 **GPT-5.2 必接** 且由平台后端统一调用的前提下，这个定义需要调整。

- **基础设施** 仍可保持免费层运行
- **LLM 调用** 无法做到天然免费
- 当前方案采用：
  - **平台后端统一读取 `OPENAI_API_KEY`**
  - 变量先留空占位，后续由项目维护者补充
  - 平台侧需自行承担 GPT-5.2 成本并做额度保护

因此，新的准确表述应为：

> **基础设施零固定成本可行，GPT-5.2 调用成本由平台预算承担，`OPENAI_API_KEY` 先留空待后续填写。**

---

## 一、架构总览（确认后的主方案）

```
┌──────────────────────────────────────────────────────────────────┐
│  [访客 / 评审]                                                   │
│        │                                                         │
│        ▼                                                         │
│  [Atoms 平台]  ← Vercel Hobby                                    │
│  atoms.vercel.app                                                 │
│    ├─ Next.js 前端工作台                                          │
│    │   ├─ 用户 / 助手双列聊天视图                                 │
│    │   ├─ 折叠式工具日志                                          │
│    │   ├─ Monaco / xterm / iframe 预览                           │
│    │   └─ 浏览器内 WebContainer                                  │
│    │                                                              │
│    └─ Node Runtime 后端                                           │
│        ├─ Hono / Route Handlers API                               │
│        ├─ OpenAI Agents SDK runtime                               │
│        ├─ Responses API + GPT-5.2                                 │
│        ├─ Run 状态机 / SSE 推流 / Tool Result 回调                │
│        └─ Vercel Publish 代理                                     │
│                 │                                                 │
│                 ├─ 生成期：Agent 在后端决策，工具在前端执行        │
│                 └─ 发布期：后端读取 Snapshot 并发布到 Vercel      │
│                                                                   │
│  [Supabase Free]                                                  │
│    ├─ Auth                                                        │
│    ├─ Postgres（Project / Run / Message / Snapshot）             │
│    └─ Storage（项目 tarball）                                     │
│                                                                   │
│  [OpenAI]                                                         │
│    └─ Responses API + GPT-5.2                                     │
│                                                                   │
│  [Vercel Deployments API]                                         │
│    └─ 为每个 Atoms 项目生成或更新可分享的公网 URL                 │
└──────────────────────────────────────────────────────────────────┘
```

### 核心职责切分

| 层 | 责任 |
|---|---|
| **前端** | UI 渲染、WebContainer 执行工具、预览、上传快照、展示 Run 流 |
| **后端** | Agent loop、GPT-5.2 调用、会话状态、消息持久化、发布、权限控制 |
| **OpenAI** | 推理、工具调用决策、结构化输出 |
| **Supabase** | 用户、项目、运行记录、消息、快照、发布元数据 |
| **Vercel** | Atoms 平台本身托管，以及生成 App 的公网部署 |

### 一个重要澄清

前端虽然不负责 Agent loop，但也**不只是纯渲染层**。因为 WebContainer 只能在浏览器内运行，所以前端仍要承担：

- 工具执行器
- 文件系统与终端桥接
- 预览更新
- 将工具结果回传后端

因此更准确的说法是：

> **前端负责渲染和浏览器侧工具执行，后端负责完整的 Agent 编排与状态控制。**

---

## 二、为什么采用 OpenAI Agents SDK，而不是其他 Agent 框架

本项目的目标不是做一个通用 Agent 平台，而是尽快落地一个基于 **GPT-5.2** 的可在线 Web App 生成产品 Demo。因此框架选型优先级是：

1. 与 GPT-5.2 的适配成本最低
2. 对工具调用、流式输出、会话状态支持完整
3. 适合在 TypeScript / Node + Vercel 上部署
4. 对首版 Demo 的复杂度友好

### 选型结论

| 方案 | 结论 | 原因 |
|---|---|---|
| **OpenAI Agents SDK** | **采用** | 与 OpenAI 模型原生对齐，内建 tools、handoffs、sessions、streaming、trace，最适合 GPT-5.2 主导场景 |
| LangGraph | 暂不采用 | 更适合复杂图式编排和持久工作流，但首版 Demo 会引入额外抽象和维护成本 |
| LangChain | 暂不作为核心 runtime | 更适合作为上层封装，不如 OpenAI Agents SDK 贴合当前核心约束 |
| Eino | 暂不采用 | 需要转向 Go 生态，不符合后端语言锁定为 TypeScript / Node 的约束 |
| DeerFlow / DeerCode | 作为参考，不作为底座 | 更像工程参考实现或上层方案，不是当前最直接的 runtime 选择 |

### 采用 OpenAI Agents SDK 的收益

- **模型一致性强**：项目核心就是 GPT-5.2，不需要做额外 provider 适配层。
- **工具调用语义天然匹配**：更适合 `writeFile / readFile / runCommand / readLogs` 这种工具模式。
- **更容易做 Run 生命周期管理**：便于把运行过程建模成 `run -> tool wait -> resume -> complete`。
- **后续扩展空间仍然足够**：如果未来真的需要多 Agent 图编排，再考虑引入 LangGraph 也不迟。

### 不采用自研 Agent loop 的原因

完全手写 loop 在 Demo 初期看起来更轻，但很快会遇到这些问题：

- 工具调用协议定义和恢复机制
- 模型输出流和中断控制
- 运行会话持久化
- 人工取消 / 重试 / 超时 / 幂等处理
- Trace 与调试可观测性

这些能力本质上已经接近一个 Agent runtime，自研性价比不高。

---

## 三、免费资源与成本边界

| 能力 | 服务 | 说明 |
|---|---|---|
| 平台前后端托管 | **Vercel Hobby** | 托管 Atoms 平台 |
| 数据库 | **Supabase Free** | 用户、项目、Run、消息、发布记录 |
| 对象存储 | **Supabase Storage** | Snapshot tarball |
| 生成期沙箱 | **WebContainer API** | 浏览器内执行用户项目 |
| 生成 App 托管 | **Vercel Deployments API** | 给每个 Atoms 项目生成分享 URL |
| LLM | **OpenAI GPT-5.2** | 必选，不能免费，由平台后端配置 API Key |
| 域名 | **`*.vercel.app`** | 可不购买自定义域名 |

### GPT-5.2 配置方式

当前方案固定采用平台后端配置：

- 后端通过环境变量 `OPENAI_API_KEY` 调用 GPT-5.2
- 该变量当前在文档和 `.env.example` 中先留空
- 后续由项目维护者在部署前自行填写
- API Key 只允许存在于服务端环境变量，不向前端下发

为了控制成本，后端必须补齐：

- 用户级频控
- 项目级 Run 步数限制
- 单日调用预算
- 发布频率限制

---

## 四、远程使用的关键链路

### 链路 1：访客打开平台

```
访客浏览器 → atoms.vercel.app → Next.js SSR → Supabase Auth 登录
```

- 登录方式：Supabase Auth 的 Magic Link
- 登录后进入 Dashboard，看到自己的项目列表和最近运行记录

### 链路 2：对话生成 App（生成期）

```
浏览器输入需求
  → POST /api/projects/:id/runs
  → 后端创建 Run
  → 后端读取 OPENAI_API_KEY（部署时填写）
  → OpenAI Agents SDK + GPT-5.2 开始执行
  → GET /api/runs/:runId/stream (SSE)
  → 后端持续推送 assistant delta / tool_request / run status
  → 前端 WebContainer 执行 tool_request
  → POST /api/runs/:runId/tool-results
  → 后端恢复 Run，继续调用模型
  → 生成完成后持久化消息与状态
```

关键点：

- **Agent loop 始终在后端**
- **工具执行始终在前端 WebContainer**
- **前后端通过 Run-centered REST + SSE 协同**

### 链路 3：发布分享（分享期）

```
用户点 Publish
  → 前端先 POST /api/projects/:id/snapshots 上传当前 tarball
  → 后端写入 Supabase Storage，并返回 snapshotId
  → 前端再 POST /api/projects/:id/publish { snapshotId }
  → 后端从 Storage 取回 snapshot
  → 调用 Vercel Deployments API
  → 轮询部署状态
  → 返回 *.vercel.app URL
```

这样可以避免：

- 前端一次发布重复上传两份工程文件
- 发布和持久化各走一套独立文件协议

### 链路 4：持久化与回访

- 每次发布前都会形成一个明确的 `Snapshot`
- 用户再次登录后，可从最近 `Snapshot` 恢复项目到 WebContainer
- `Run` 和 `Message` 历史可以用于回放之前的生成过程
- 已发布的 Vercel URL 可持续分享

---

## 五、部署平台本身（Atoms）的步骤

1. **GitHub 仓库**：代码 push 到 `github.com/<user>/atoms`
2. **Vercel 连接**：导入仓库并部署 Next.js 应用
3. **环境变量**（Vercel UI）：
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   VERCEL_TOKEN=...
   VERCEL_TEAM_ID=...
   OPENAI_API_KEY=
   OPENAI_MODEL=gpt-5.2
   ```
4. **Supabase 初始化**：
   - 创建项目
   - 跑数据库迁移
   - 创建 `project-snapshots` bucket，设为私有
5. **WebContainer 所需头配置**：
   ```
   Cross-Origin-Embedder-Policy: require-corp
   Cross-Origin-Opener-Policy: same-origin
   ```
6. **Vercel Deployments API Token**：
   - 为平台账号生成 Token
   - 用于创建和更新用户作品部署
7. **发布策略**：
   - 每个 Atoms 项目绑定一个固定的 Vercel project slug
   - 后续发布只更新同一个 Vercel project

---

## 六、技术栈（确认版本）

| 层 | 选型 | 备注 |
|---|---|---|
| 平台前端 | Next.js 15 + React 19 + TypeScript + Tailwind + shadcn/ui | 主工作台 UI |
| API 层 | Next.js Route Handlers + Hono + Node Runtime + SSE | 保持同仓部署，提升路由组织与中间件能力 |
| 编辑器 / 终端 | Monaco + xterm.js | 代码和终端体验 |
| 前端状态 | Zustand + TanStack Query | 项目状态和接口请求 |
| 认证 | Supabase Auth | Magic Link |
| DB | Supabase Postgres + Prisma | 项目、消息、Run、发布记录 |
| Storage | Supabase Storage | Snapshot tarball |
| 沙箱 | WebContainer API | 浏览器内运行生成中的项目 |
| Agent Runtime | **OpenAI Agents SDK** | 后端主导的 Agent loop |
| LLM API | **OpenAI Responses API** | 统一调用入口 |
| 模型 | **GPT-5.2** | 硬约束 |
| 发布 | Vercel Deployments API | 生成公网 URL |
| 打包 / 解包 | tar-stream / fflate | Snapshot 上传与恢复 |

---

## 七、前端展示目标（确认版）

前端工作台不是展示“原始 Agent 事件流”，而是展示一层更稳定的产品化视图：

1. **用户消息**
2. **助手消息**
3. **工具日志折叠块**

也就是说：

- 聊天区只展示用户和助手两列内容
- 工具过程默认折叠
- 原始 SSE 事件只作为内部协议，不直接暴露给用户

这样能避免 UI 被底层 runtime 事件绑死，也更容易后续替换部分工具实现。

---

## 八、项目结构（单仓库）

```
atoms_project/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   └── page.tsx
│   ├── projects/[id]/
│   │   └── page.tsx
│   ├── api/
│   │   ├── auth/me/route.ts
│   │   ├── projects/route.ts
│   │   ├── projects/[id]/route.ts
│   │   ├── projects/[id]/messages/route.ts
│   │   ├── projects/[id]/runs/route.ts
│   │   ├── runs/[id]/route.ts
│   │   ├── runs/[id]/stream/route.ts
│   │   ├── runs/[id]/tool-results/route.ts
│   │   ├── runs/[id]/cancel/route.ts
│   │   ├── projects/[id]/snapshots/route.ts
│   │   ├── snapshots/[id]/download/route.ts
│   │   ├── projects/[id]/publish/route.ts
│   │   ├── publish/[id]/route.ts
│   │   └── publish/[id]/stream/route.ts
│   └── layout.tsx
├── components/
│   ├── workspace/
│   │   ├── ChatPanel.tsx
│   │   ├── ToolLogAccordion.tsx
│   │   ├── CodePanel.tsx
│   │   ├── TerminalPanel.tsx
│   │   ├── PreviewPanel.tsx
│   │   ├── FileTree.tsx
│   │   └── PublishDialog.tsx
│   └── ui/
├── lib/
│   ├── agent/
│   │   ├── runtime.ts
│   │   ├── runner.ts
│   │   ├── sessions.ts
│   │   ├── events.ts
│   │   ├── prompts/
│   │   └── tools/
│   │       ├── definitions.ts
│   │       ├── dispatcher.ts
│   │       └── serializers.ts
│   ├── webcontainer/
│   │   ├── client.ts
│   │   ├── bridge.ts
│   │   ├── fs.ts
│   │   └── tarball.ts
│   ├── publish/
│   │   ├── deploy.ts
│   │   └── project-map.ts
│   ├── llm/
│   │   └── openai.ts
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── storage.ts
│   └── db/
│       └── schema.prisma
├── templates/
│   └── nextjs-basic/
├── next.config.js
├── package.json
└── .env.example
```

---

## 九、关键实现要点

### 9.1 Run-centered 架构，而不是“前端自己跑 Agent”

当前确认方案下，运行过程必须围绕 `Run` 实体组织：

1. 前端发起 `POST /projects/:id/runs`
2. 后端创建 `Run` 记录并进入 `running`
3. 后端通过 OpenAI Agents SDK + GPT-5.2 驱动一次完整执行
4. 如需工具，后端把工具请求推到 SSE
5. 前端执行完工具后调用 `POST /runs/:id/tool-results`
6. 后端恢复 `Run`
7. 最终把结果写回 `Message`、`Run`、`Project`

这种模型的优势：

- 状态清晰
- 更适合中断、取消、重试和断线恢复
- 更适合落库和调试
- 更符合 OpenAI Agents SDK 的使用方式

### 9.2 工具调用必须显式可恢复

因为工具执行在浏览器，而 Agent 在后端，所以工具调用协议至少要满足：

- 每次工具请求有唯一 `toolCallId`
- 后端在等待工具结果时把 `Run` 状态切到 `waiting_for_tool`
- 工具结果回传时做幂等校验，防止重复提交
- SSE 断线后，前端能通过 `GET /runs/:id` 恢复当前挂起状态

### 9.3 发布采用 Snapshot-first

发布流程不直接从前端把完整文件集合发给 `/publish`，而是：

1. 先上传 Snapshot
2. 再按 `snapshotId` 触发发布

这样更清晰，也更容易：

- 复用快照做回滚
- 失败后重试发布
- 记录“哪个版本被发布了”

### 9.4 Vercel 发布策略必须是“同项目复用”

为了避免 Hobby 限额过快耗尽，必须把策略明确下来：

- 一个 Atoms `Project` 对应一个 Vercel project
- 多次发布更新同一个 Vercel project
- 不允许每次发布都创建全新 project

---

## 十、数据模型（精简版 Prisma）

```prisma
model User {
  id          String       @id @default(cuid())
  email       String       @unique
  projects    Project[]
}

model Project {
  id               String     @id @default(cuid())
  userId           String
  name             String
  description      String?
  templateKey      String
  status           String
  deployedUrl      String?
  vercelProjectSlug String?
  latestSnapshotId String?
  latestRunId      String?
  snapshots        Snapshot[]
  runs             Run[]
  messages         Message[]
  updatedAt        DateTime   @updatedAt
  createdAt        DateTime   @default(now())
}

model Run {
  id                String    @id @default(cuid())
  projectId         String
  userId            String
  model             String
  status            String
  waitingToolCallId String?
  startedAt         DateTime?
  finishedAt        DateTime?
  lastError         Json?
  createdAt         DateTime  @default(now())
}

model Message {
  id         String   @id @default(cuid())
  projectId  String
  runId      String?
  kind       String
  payload    Json
  createdAt  DateTime @default(now())
}

model Snapshot {
  id          String   @id @default(cuid())
  projectId   String
  storageKey  String
  summary     String?
  deployedUrl String?
  createdAt   DateTime @default(now())
}

model PublishJob {
  id          String   @id @default(cuid())
  projectId   String
  snapshotId  String
  status      String
  deployedUrl String?
  lastError   Json?
  createdAt   DateTime @default(now())
}

```

---

## 十一、开发路线图（更新后）

### Day 1-2 · 基础设施与认证

1. 初始化 Next.js 项目
2. Vercel 部署平台本身
3. Supabase Auth / DB / Storage 初始化
4. 配置 WebContainer 所需响应头

### Day 3-4 · 后端 Agent Runtime 打通

5. 接入 OpenAI Agents SDK
6. 锁定 GPT-5.2 + Responses API
7. 建立 `Run` 模型与 SSE 流
8. 跑通最小链路：创建 run -> 返回 assistant 文本

### Day 5 · WebContainer 工具桥接

9. 定义工具协议：`writeFile / readFile / listFiles / runCommand / readLogs`
10. 前端执行工具并回传结果
11. 跑通最小闭环：请求“做一个计数器” -> 写文件 -> 启动 dev server -> iframe 预览

### Day 6 · 工作台 UI

12. 实现用户 / 助手聊天视图
13. 实现折叠工具日志
14. 接入 Monaco / xterm / FileTree / PreviewPanel

### Day 7 · Snapshot 与 Publish

15. Snapshot 上传和恢复
16. `snapshotId -> publish` 发布链路
17. 展示分享链接和二维码

### Day 8 · 稳定性与运营保护

18. Run 取消 / 超时 / 重试
19. 配额限制和发布频控
20. 错误处理、README、Demo 脚本

---

## 十二、验证方式（端到端）

1. 另一台设备打开 `atoms.vercel.app`，完成登录
2. 在部署环境补全 `OPENAI_API_KEY` 后，确认能发起 GPT-5.2 Run
3. 输入“做一个 TODO 列表带本地存储”
4. 观察：
   - 聊天区显示用户消息
   - 助手消息流式输出
   - 工具日志以折叠块形式出现
   - iframe 成功显示预览
5. 再输入“加一个深色模式切换”
6. 检查：
   - Run 状态从 `running` 到 `completed`
   - 文件被更新
   - 预览热刷新
7. 点击 Publish
8. 等待拿到 `*.vercel.app` 链接
9. 用另一台无关设备打开链接，确认作品可用
10. 关闭浏览器后重新打开项目，确认可从 Snapshot 恢复

---

## 十三、主要风险与兜底

| 风险 | 兜底 |
|---|---|
| **GPT-5.2 成本不可忽略** | 平台统一承担模型成本，必须加每日额度、并发限制和项目级限流 |
| **后端 Run 等待浏览器工具结果时可能断线** | Run 状态持久化到 DB；工具等待用 `waiting_for_tool` 表达；前端支持断线重连 |
| **WebContainer 浏览器兼容性有限** | 首版明确桌面 Chromium 优先；发布后的作品面向全设备 |
| **Vercel Hobby 发布额度有限** | 每用户每日发布次数限制；同一 Atoms 项目复用一个 Vercel project |
| **平台 API Key 安全** | `OPENAI_API_KEY` 仅放在服务端环境变量，不向前端透出；区分开发和生产环境 |
| **生成内容可滥用平台发布能力** | 限制模板、依赖白名单、构建命令和产物类型 |
| **长对话上下文膨胀** | 定期压缩对话摘要；控制单次 Run 的最大迭代和 token 预算 |

---

## 十四、关键文件清单（开工时直接创建）

| 路径 | 作用 |
|---|---|
| `app/api/projects/[id]/runs/route.ts` | 创建 Run |
| `app/api/runs/[id]/stream/route.ts` | Run SSE 流 |
| `app/api/runs/[id]/tool-results/route.ts` | 浏览器回传工具结果 |
| `app/api/runs/[id]/cancel/route.ts` | 取消运行 |
| `app/api/projects/[id]/messages/route.ts` | 时间线读取 |
| `app/api/projects/[id]/snapshots/route.ts` | Snapshot 上传 |
| `app/api/projects/[id]/publish/route.ts` | 发布入口 |
| `app/api/publish/[id]/stream/route.ts` | 发布进度流 |
| `lib/agent/runtime.ts` | OpenAI Agents SDK 运行时封装 |
| `lib/agent/runner.ts` | Run 生命周期控制 |
| `lib/agent/sessions.ts` | 会话恢复与持久化 |
| `lib/agent/tools/dispatcher.ts` | 工具调用调度 |
| `lib/webcontainer/bridge.ts` | 前端工具执行桥 |
| `lib/publish/deploy.ts` | 封装 Vercel Deployments API |
| `components/workspace/ChatPanel.tsx` | 用户 / 助手聊天 UI |
| `components/workspace/ToolLogAccordion.tsx` | 折叠工具日志 |
| `prisma/schema.prisma` | 数据模型 |

---

## 总结：当前确认方案如何满足目标

### 可在线访问

- Atoms 平台本身部署在 `atoms.vercel.app`
- 每个生成的作品通过 Vercel 获取独立公网链接
- 用户可在手机和其他设备上直接访问已发布作品

### 后端主导

- Agent loop 完整运行在 TypeScript / Node 后端
- 前端只负责 UI 和浏览器内工具执行
- OpenAI GPT-5.2 通过 OpenAI Agents SDK + Responses API 接入

### 成本边界清晰

- 基础设施仍可使用免费层
- GPT-5.2 不是免费能力，需由平台预算承接

---

# 附录 A · 前后端对接 IDL（重写版）

> 这一版 IDL 以 **Run-centered REST + SSE** 为核心，匹配“后端 Agent loop + 前端 WebContainer 工具执行”的架构。

## A.1 通用约定

- **Base URL**: `https://atoms.vercel.app/api`
- **认证方式**: Supabase Auth JWT，放在 `Authorization: Bearer <access_token>`
- **内容类型**: `application/json`，SSE 端点除外
- **时间格式**: ISO 8601
- **幂等要求**：
  - `tool-results` 需要 `clientSequence`
  - 相同 `toolCallId + clientSequence` 重复提交必须安全

统一错误结构：

```ts
interface ApiError {
  error: {
    code:
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'VALIDATION'
      | 'RATE_LIMIT'
      | 'RUN_NOT_ACTIVE'
      | 'TOOL_RESULT_CONFLICT'
      | 'OPENAI_UPSTREAM_ERROR'
      | 'VERCEL_DEPLOY_FAILED'
      | 'INTERNAL'
    message: string
    details?: unknown
  }
}
```

---

## A.2 领域类型（前后端共享）

```ts
// ========== User ==========
interface User {
  id: string
  email: string
  name: string | null
  createdAt: string
}

// ========== Project ==========
type ProjectStatus =
  | 'idle'
  | 'running'
  | 'waiting_for_tool'
  | 'publishing'
  | 'error'

interface Project {
  id: string
  userId: string
  name: string
  description: string | null
  templateKey: string
  status: ProjectStatus
  deployedUrl: string | null
  vercelProjectSlug: string | null
  latestSnapshotId: string | null
  latestRunId: string | null
  createdAt: string
  updatedAt: string
}

// ========== Run ==========
type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_tool'
  | 'completed'
  | 'failed'
  | 'cancelled'

interface Run {
  id: string
  projectId: string
  userId: string
  status: RunStatus
  model: 'gpt-5.2'
  waitingToolCallId: string | null
  startedAt: string | null
  finishedAt: string | null
  lastError: ApiError['error'] | null
  createdAt: string
}

// ========== Snapshot ==========
interface Snapshot {
  id: string
  projectId: string
  storageKey: string
  summary: string | null
  deployedUrl: string | null
  createdAt: string
}

// ========== Publish Job ==========
type PublishStatus =
  | 'queued'
  | 'uploading'
  | 'building'
  | 'ready'
  | 'error'

interface PublishJob {
  id: string
  projectId: string
  snapshotId: string
  status: PublishStatus
  deployedUrl: string | null
  error: ApiError['error'] | null
  createdAt: string
}

// ========== Timeline ==========
interface BaseTimelineItem {
  id: string
  projectId: string
  runId: string | null
  createdAt: string
}

interface UserMessageItem extends BaseTimelineItem {
  kind: 'user'
  text: string
}

interface AssistantMessageItem extends BaseTimelineItem {
  kind: 'assistant'
  text: string
  status: 'streaming' | 'completed'
}

interface ToolLogLine {
  ts: string
  stream: 'stdout' | 'stderr' | 'info'
  text: string
}

interface ToolLogItem extends BaseTimelineItem {
  kind: 'tool_log'
  toolCallId: string
  toolName:
    | 'writeFile'
    | 'editFile'
    | 'readFile'
    | 'listFiles'
    | 'runCommand'
    | 'readLogs'
    | 'startDevServer'
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  summary: string
  collapsedByDefault: true
  logs: ToolLogLine[]
}

type TimelineItem =
  | UserMessageItem
  | AssistantMessageItem
  | ToolLogItem

// ========== Tool Call ==========
interface ToolCallRequest {
  toolCallId: string
  runId: string
  name: ToolLogItem['toolName']
  input: Record<string, unknown>
}

interface ToolResultPayload {
  toolCallId: string
  output: unknown
  isError?: boolean
  durationMs?: number
  filesChanged?: string[]
  previewUrl?: string | null
  logs?: ToolLogLine[]
  clientSequence: number
}

// ========== Template ==========
interface Template {
  key: string
  name: string
  description: string
  tarballUrl: string
}
```

---

## A.3 REST 接口清单

### A.3.1 认证

Supabase Auth 在前端直接处理，后端只校验 JWT。

```yaml
GET /auth/me
  描述: 返回当前用户
  Response 200:
    { user: User }
  Response 401:
    ApiError
```

### A.3.2 Projects

```yaml
GET /projects
  描述: 列出当前用户的所有项目
  Response 200:
    { projects: Project[] }

POST /projects
  描述: 创建新项目
  Body:
    {
      name: string
      description?: string
      templateKey: string
    }
  Response 201:
    { project: Project }

GET /projects/:id
  描述: 项目详情
  Response 200:
    {
      project: Project
      latestRun: Run | null
      latestSnapshot: Snapshot | null
    }
  Response 404:
    ApiError

PATCH /projects/:id
  描述: 更新项目元数据
  Body:
    {
      name?: string
      description?: string
    }
  Response 200:
    { project: Project }

DELETE /projects/:id
  描述: 删除项目及其运行、消息、快照元数据；不保证删除已发布的 Vercel URL
  Response 204
```

### A.3.3 Timeline / Messages

> 前端只读时间线，不再负责反向上报 assistant/tool 消息。

```yaml
GET /projects/:id/messages
  Query:
    ?limit=50&before=<timelineItemId>
  Response 200:
    {
      items: TimelineItem[]
      hasMore: boolean
    }
```

### A.3.4 Runs

```yaml
POST /projects/:id/runs
  描述: 发起一次新的生成或修改请求
  Body:
    {
      userMessage: {
        text: string
      }
      baseSnapshotId?: string | null
      clientState?: {
        activeFile?: string | null
        openFiles?: string[]
        previewUrl?: string | null
      }
    }
  Response 201:
    {
      run: Run
      streamUrl: string
    }
  Response 409:
    ApiError   # 项目已有活跃 run

GET /projects/:id/runs
  Query:
    ?limit=20
  Response 200:
    { runs: Run[] }

GET /runs/:id
  描述: 查询单个 run 的当前状态，用于断线恢复
  Response 200:
    {
      run: Run
      pendingToolCall?: ToolCallRequest
    }
  Response 404:
    ApiError

POST /runs/:id/tool-results
  描述: 前端把 WebContainer 工具执行结果回传给后端，供 run 继续执行
  Body: ToolResultPayload
  Response 202:
    {
      run: Run
    }
  Response 409:
    ApiError   # 非当前等待中的 toolCallId 或重复提交冲突

POST /runs/:id/cancel
  描述: 取消运行中的 run
  Response 202:
    { run: Run }
```

### A.3.5 Snapshots

```yaml
POST /projects/:id/snapshots
  描述: 上传当前 WebContainer 工程快照
  Content-Type: multipart/form-data
  FormData:
    - file: Blob (tar.gz)
    - summary?: string
    - sourceRunId?: string
  Response 201:
    { snapshot: Snapshot }
  Response 413:
    ApiError

GET /projects/:id/snapshots
  Response 200:
    { snapshots: Snapshot[] }

GET /snapshots/:id/download
  描述: 获取 tarball 的临时下载 URL
  Response 200:
    {
      url: string
      expiresAt: string
    }
```

### A.3.6 Publish

```yaml
POST /projects/:id/publish
  描述: 基于某个 snapshot 发布到 Vercel
  Body:
    {
      snapshotId: string
      displayName?: string
    }
  Response 202:
    {
      publishJob: PublishJob
      streamUrl: string
    }
  Response 429:
    ApiError

GET /publish/:id
  描述: 查询发布状态
  Response 200:
    { publishJob: PublishJob }

GET /publish/:id/stream
  描述: SSE 返回发布状态流
  Content-Type: text/event-stream
```

### A.3.7 Templates

```yaml
GET /templates
  描述: 获取可用模板列表
  Response 200:
    { templates: Template[] }
```

---

## A.4 Run SSE 事件协议（后端 -> 前端）

> 这些事件是内部运行协议。前端最终只渲染用户消息、助手消息和折叠工具日志。

```ts
type RunStreamEvent =
  | {
      type: 'run_started'
      run: Run
    }
  | {
      type: 'assistant_message_delta'
      runId: string
      messageId: string
      delta: string
    }
  | {
      type: 'assistant_message_completed'
      runId: string
      message: AssistantMessageItem
    }
  | {
      type: 'tool_call_requested'
      runId: string
      toolCall: ToolCallRequest
    }
  | {
      type: 'tool_log_delta'
      runId: string
      toolCallId: string
      line: ToolLogLine
    }
  | {
      type: 'tool_call_completed'
      runId: string
      toolLog: ToolLogItem
    }
  | {
      type: 'run_waiting_for_tool'
      runId: string
      toolCallId: string
    }
  | {
      type: 'run_resumed'
      runId: string
      toolCallId: string
    }
  | {
      type: 'run_completed'
      run: Run
    }
  | {
      type: 'run_failed'
      runId: string
      error: ApiError['error']
    }
  | {
      type: 'heartbeat'
      ts: string
    }
```

---

## A.5 Publish SSE 事件协议

```ts
type PublishStreamEvent =
  | {
      type: 'publish_status'
      publishJobId: string
      status: PublishStatus
      message?: string
    }
  | {
      type: 'publish_completed'
      publishJob: PublishJob
    }
  | {
      type: 'publish_failed'
      publishJobId: string
      error: ApiError['error']
    }
```

---

## A.6 前端需要的环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_BASE_URL=/api
```

---

## A.7 后端需要的环境变量

```bash
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VERCEL_TOKEN
VERCEL_TEAM_ID
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.2
PUBLISH_DAILY_LIMIT_PER_USER=5
RUN_MAX_STEPS=20
SNAPSHOT_MAX_SIZE_MB=10
```

---

## A.8 错误码字典

| code | HTTP | 说明 |
|---|---|---|
| `UNAUTHORIZED` | 401 | JWT 缺失或非法 |
| `FORBIDDEN` | 403 | 访问他人资源 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION` | 400 | 请求体校验失败 |
| `RATE_LIMIT` | 429 | 达到用户或平台限流 |
| `RUN_NOT_ACTIVE` | 409 | Run 已结束，不能继续写入工具结果 |
| `TOOL_RESULT_CONFLICT` | 409 | `toolCallId` 或 `clientSequence` 冲突 |
| `OPENAI_UPSTREAM_ERROR` | 502 | OpenAI 上游错误 |
| `VERCEL_DEPLOY_FAILED` | 502 | Vercel 发布失败 |
| `INTERNAL` | 500 | 未分类服务端错误 |

---

## A.9 前后端并行开发建议

1. **先冻结 Run 协议**：`POST /runs`、`GET /runs/:id/stream`、`POST /tool-results` 是核心中的核心。
2. **先做最小链路**：只实现 `user -> assistant text`，确认 GPT-5.2 与 SSE 工作正常。
3. **第二步接工具**：先只做 `writeFile` 和 `runCommand` 两个工具。
4. **前端不要依赖原始事件形态渲染 UI**：统一转成 `TimelineItem` 再展示。
5. **发布链路独立验收**：至少验证成功、Vercel 失败、配额超限三条路径。
6. **Snapshot-first 不要回退**：不要重新引入“publish 直接上传 files[]”这条支线。
