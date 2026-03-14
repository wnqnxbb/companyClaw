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
