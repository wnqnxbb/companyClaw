# companyClaw MVP 调研记录

## 当前仓库事实

- `companyClaw/` 当前为空目录。
- `openclaw/` 是大型 TypeScript monorepo。
- `openclaw` runtime 核心链路为：
  `commands/agent.ts -> model-fallback.ts -> pi-embedded-runner -> tools/session transcript`
- `openclaw` 的 CLI 经常优先走 Gateway，但可回退到本地 embedded runtime。

## 可复用思路

- `pi-coding-agent` 的最小调用链是：
  `createAgentSession(...)` + `session.prompt(...)`
- 会话持久化模型可简化为：
  `sessions.json` + `transcripts/<sessionId>.jsonl`
- 工具层可以直接使用 `createReadTool` / `createWriteTool` / `createEditTool`
- 自定义工具需要转换成 `ToolDefinition[]`
- `SessionManager.open(sessionFile)` 可复用既有 transcript

## 方向修正

- `companyClaw` 的默认定位已经从“代码代理”修正为“通用代理”。
- coding 相关工具保留，但只是一类能力，不应主导默认 prompt 和工作区文件设计。
- 需要引入 `openclaw` 风格的工作区文件分层：
  `AGENTS.md / SOUL.md / USER.md / IDENTITY.md / TOOLS.md / BOOTSTRAP.md / MEMORY.md`

## 明确不做

- Gateway RPC / WebSocket
- channel 适配与消息投递
- ACP 双 runtime
- 监控、usage、plugin、browser、memory、cron、subagent

## 依赖事实

- `openclaw/package.json` 固定了：
  - `@mariozechner/pi-coding-agent@0.57.1`
  - `typescript@^5.9.3`
  - `tsx@^4.21.0`
  - `vitest@^4.1.0`
  - `commander@^14.0.3`
  - `zod@^4.3.6`
- 本地尚未安装 `openclaw/node_modules`

## 实现后补充发现

- `DefaultResourceLoader` 在当前版本必须显式传入 options。
- `createWriteTool` / `createEditTool` 当前版本没有 `workspaceOnly` 选项，需要在外层自己做路径校验。
- `SessionManager` 与 `createAgentSession` 的最小可用组合已经足够支撑 MVP，无需引入 `openclaw` 的大部分 runner 包装层。

## 2026-03-14 session/trace 改造补充发现

- 当前 transcript 路径由 `resolveSession()` 直接拼到 `.companyclaw/transcripts/<sessionId>.jsonl`。
- 当前 run log 路径由 `createRunLogger()` 直接拼到 `.companyclaw/logs/runs/<runId>.jsonl`。
- `run.start` 事件已经把 `sessionId`、`sessionKey`、`sessionFile`、`logFile` 一起写入，适合保留 run 边界后迁移到 session 目录下。
- 当前 HTTP 请求只有 `traceConsole`，还没有“是否写 run log”的显式开关；要新增启动参数或 runtime 级别开关。
- `RunManager` 的 `/events` 与 `/stream` 依赖 `onRecord` 回调；如果把 logger 直接关掉，会导致 HTTP 事件流也丢失。
- 因此需要把“生成 TraceRecord”和“写 JSONL 文件”拆开：不落盘时仍然继续向内存事件流推送记录。

## 2026-03-14 多 agent workspace 改造补充发现

- 当前 `loadConfig()` 适合作为“服务级配置”来源，但不适合直接承担 agent 实例路径解析；新增 `resolveAgentRuntimeConfig()` 更稳。
- 仓库根目录的 `AGENTS.md` 不能直接搬走，否则后续会话不会再自动读取这个仓库级说明；实现上采用“保留根文件 + 新增模板目录”的策略。
- `companyclaw.config.json` 显式写死了 `bootstrapFiles`，如果不把 `HEARTBEAT.md` 加进去，运行时即使有模板文件也不会加载。
- `resolveWithinRoot()` 抛的是普通错误；HTTP 层需要显式把路径越界映射成 `400`，否则会误报成 `500`。
- 只给 `RunManager` 传 `request` 不够，多 agent 模式下必须把“本次 run 对应的运行时 config”一起带进去，否则 `runAgent()` 无法切到正确 agent 目录。
