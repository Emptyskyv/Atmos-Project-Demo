# Atoms 项目当前进展总结

日期：2026-04-09

## 当前结论

项目已经从“只有前端壳子和浏览器侧实验性工具调用”推进到“后端主导的 Agent Runtime MVP 骨架”。

当前已经打通的主链路：

- 用户注册 / 登录
- Dashboard 创建项目
- 项目初始模板快照写入本地存储
- 工作区页面加载本地 workspace 文件
- Run-centered REST + SSE 基础链路
- 后端执行工具调用
- 前端消费 assistant 消息 / tool log / workspace 文件更新

但当前还**不能视为完全可用的 MVP**，因为最关键的一步“Agent 稳定持续调用模型并完成多轮任务”仍受上游模型服务影响，真实联调时仍会出现 provider 返回 `Access denied`，导致 run 中断。

## 已完成内容

### 1. 认证与基础产品流

- 已实现邮箱 + 密码注册
- 已实现邮箱 + 密码登录
- 密码已做服务端哈希存储
- 登录态已接入后端 session 校验
- Dashboard 可以展示当前登录用户，并创建项目

### 2. 项目与持久化

- 已接入本地 PostgreSQL 持久化主数据
- 已有 Prisma schema 与迁移
- 项目、消息、运行记录、工具调用、快照、发布任务等已落库
- 快照文件已走本地文件存储
- workspace 已走本地目录持久化

当前本地持久化方案：

- 结构化数据：PostgreSQL
- 快照归档：仓库内 `.data/snapshots/`
- 解包后的运行工作区：仓库内 `.data/workspaces/`

### 3. Agent Runtime 架构迁移

已完成从旧的浏览器执行工具模式，迁移到后端执行工具模式。

当前模型工具面已经统一为：

- `bash`
- `read`
- `write`
- `edit`
- `list`
- `glob`
- `grep`
- `applyPatch`

对应已完成内容：

- 新工具协议定义
- 后端 local workspace 服务
- 后端 process manager
- 后端 tool executor
- `runs` 路由改为服务端收到 `tool_request` 后直接执行
- 执行结果通过 SSE 回传前端
- 前端不再负责 `/tool-results` 回填执行

### 4. OpenAI-compatible Chat Completions 接入

当前已按 `POST /v1/chat/completions` 方式接入 OpenAI-compatible provider。

已完成：

- `OPENAI_BASE_URL` / `OPENAI_API_KEY` / header 透传
- compat runtime 走 chat completions
- 工具调用与工具恢复消息格式已适配
- 已验证最小两轮“tool call -> tool result -> continue”协议本身可工作

### 5. 前端工作区

前端当前已具备以下能力：

- 两列聊天时间线
- tool log 折叠展示
- 文件树展示
- 当前代码文件展示
- 终端日志展示
- 预览面板占位与 preview URL 消费

已确认：

- 新创建项目可正常打开工作区
- 文件树可显示 starter template 文件
- 代码区可展示文件内容
- 发送 prompt 后会进入 `Running...`
- assistant 首轮消息与 tool log 可回流到界面

### 6. 旧项目兼容修复

本轮还修复了一个真实联调问题：

- 之前某些项目创建成功，但 starter snapshot 文件未真正落盘
- 后续打开项目时 `GET /api/projects/:id` 会返回 500

现在已修复：

- 新项目 starter snapshot 会正常落盘
- 旧的坏项目在读取 workspace 时会自动回退到模板自愈，不再直接 500

## 本轮重点验证结果

已通过的验证：

- `pnpm vitest tests/api/projects.test.ts tests/api/runs.test.ts tests/lib/openai-compatible-runtime.test.ts tests/lib/openai-compat-runtime.test.ts tests/hooks/useRunStream.test.tsx tests/hooks/useWorkspaceState.test.tsx tests/webcontainer/bridge.test.ts tests/components/chat-panel.test.tsx tests/components/workspace-runtime-panels.test.tsx`
- 结果：`9` 个 test files，`35` 个 tests 全部通过
- `npx tsc --noEmit` 通过
- 针对本轮核心文件的 `eslint` 通过

已完成的真实本地烟雾联调：

- 注册
- 登录
- 创建新项目
- 打开 workspace
- 查看 starter files
- 发送 prompt
- 观察 assistant 首轮输出与 tool log

## 当前明确缺陷

### 1. 上游模型服务仍会中断真实 run

这是当前最关键缺陷。

现象：

- 真实联调时，run 会在首轮或后续轮次失败
- 数据库中记录的错误为上游 provider 返回 `Access denied`
- 当前实际联调用模型是 `glm-5`

影响：

- Agent 无法稳定完成多轮任务
- 代码修改、预览启动等完整闭环无法稳定走通

判断：

- 这更像是 provider 侧权限 / 风控 / 额度问题
- 当前本地 runtime 协议本身已做最小复现，协议不是根因

### 2. 还没有完成“成功生成代码并启动预览”的稳定闭环验证

虽然本地工具链与 preview 能力已经接上，但因为上游模型调用不稳定，真实联调还没有稳定跑通以下完整成功路径：

- 模型连续多轮调用工具
- 修改 `app/page.tsx`
- 执行 `bash` 启动 dev server
- 前端收到 preview URL
- 预览面板成功展示页面

这一步目前是“架构已到位，但联调未稳定通过”。

### 3. 当前真实联调模型并不是目标中的 GPT-5.2

当前运行记录里，实际模型是 `glm-5`。

这意味着：

- 系统的 OpenAI-compatible 接口模式已经具备
- 但“目标模型为 GPT-5.2”的最终目标还未完成验证

如果要满足最初目标，需要后续换成一个真实可用、权限正常的 GPT-5.2 provider 继续联调。

### 4. 还没有做全仓全量回归

当前通过的是本轮核心链路相关测试，不是整个仓库的全量验收。

风险：

- 仓库中仍有大量历史改动未统一收敛
- 其他未覆盖区域仍可能存在兼容性问题

### 5. 运行失败时的用户体验仍偏粗糙

当前前端会看到：

- `run failed`
- tool log
- assistant 首轮回复

但还缺少更强的用户可理解性，例如：

- 更清晰的错误分类
- 区分本地工具错误和上游模型错误
- 给出恢复建议

## 当前状态判断

如果以“架构骨架 + 主链路接通”为标准，项目已经进入 **后端 Agent Runtime MVP 骨架完成** 阶段。

如果以“用户可以稳定用它完成真实任务”为标准，项目目前仍处于：

- 基础功能基本具备
- 关键运行链路已打通
- 但受上游模型服务问题阻塞，尚未达到稳定可用 MVP

## 下一步建议

### 优先级 P0

- 更换或修复当前 provider，使模型服务稳定可用
- 使用目标模型重新做完整联调
- 跑通一次真实成功路径：
  - 读文件
  - 改文件
  - 启动 dev server
  - 返回 preview URL
  - 前端看到预览

### 优先级 P1

- 补充 run 失败场景的 UI 提示
- 增加更多 API / runtime / workspace 集成测试
- 做一次更大范围的全量回归

### 优先级 P2

- 收敛当前脏工作区
- 整理文档与配置说明
- 统一剩余历史实现与新 runtime 方案

