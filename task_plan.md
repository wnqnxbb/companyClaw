# companyClaw MVP 任务计划

## 目标

实现一个独立可运行的最小通用代理 runtime，正式入口改为本机 HTTP 服务，核心能力包含：
- 会话解析与持久化
- 工作区 bootstrap 上下文
- 基于 `@mariozechner/pi-coding-agent` 的 agent 执行
- 通用代理工作区文件体系：`AGENTS.md`、`SOUL.md`、`USER.md`、`IDENTITY.md`、`TOOLS.md`、`BOOTSTRAP.md`、`MEMORY.md`
- 最小本地工具集：`read`、`write`、`edit`、`apply_patch`、`exec`
- 基础模型 fallback
- 异步 Run API 与 SSE 事件流
- 单元测试与构建脚本

## 阶段

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 1. 规划文件与项目骨架 | complete | 已初始化项目结构、配置、测试框架 |
| 2. 配置/会话/提示词层 | complete | 已实现 config、session store、bootstrap prompt |
| 3. 工具与 runtime | complete | 已实现工具注册、pi adapter、runAgent 主链路 |
| 4. CLI 与测试 | complete | 已实现命令行入口、单元测试 |
| 5. 安装依赖与验证 | complete | 已完成安装依赖并通过 typecheck/test |
| 6. session 目录化与 trace 开关 | complete | 已改为 `.companyclaw/sessions/<sessionId>/...`，并把 trace 调整为显式开启 |
| 7. 多 agent workspace 与创建接口 | complete | 已新增 `POST /agents`、`agentId` 驱动的 `/runs`、模板目录与多 agent 路径解析 |

## 决策

- 项目形态：单包 TypeScript CLI
- 运行核心：直接依赖 `@mariozechner/pi-coding-agent`
- 状态目录：工作区内 `.companyclaw/`
- 默认会话键：`main`
- 默认产品定位：通用代理，不收窄为 coding agent
- HTTP 交互模型：异步 Run API + SSE
- 服务边界：本机单用户，默认 127.0.0.1
- MVP 不实现多渠道 Gateway、UI、plugin、subagent
- 新目录方案：`.companyclaw/sessions/<sessionId>/transcript.jsonl`
- 新 trace 方案：`.companyclaw/sessions/<sessionId>/runs/<runId>.jsonl`
- trace 改为显式开启，默认不落盘 run log
- `serve --trace` 开启 HTTP run 文件落盘，`agent --trace` 同时开启文件 trace 与终端 trace
- 多 agent 根目录：固定为 `~/.companyclaw`
- 多 agent 模型 seed：根 `~/.companyclaw/agent/`
- HTTP 创建接口：`POST /agents`
- HTTP 运行接口：`POST /runs` 必须携带 `agentId`
- workspace 模板目录：`templates/agent-workspace/`
- 默认 bootstrap 文件新增 `HEARTBEAT.md`

## 风险

- 本地尚未安装依赖，后续需要联网安装
- `pi-coding-agent` 的少量 API 需要通过兼容层包装
- fallback 场景要避免重复写入失败轮次的末尾用户消息
- 工作区文件体系要避免沦为“空模板”，必须对默认 prompt 真正生效
- 通用代理定位不能被本地代码工具重新带偏为 coding-only
- HTTP 层要避免重新发明第二套日志格式，必须复用现有 TraceRecord
- 旧 `sessions.json` 中的 `sessionFile` 可能仍指向历史 `transcripts/*.jsonl`
- 目录迁移后，README 和测试里的旧路径断言都需要一起更新
- HTTP `/runs/:id/events` 依赖 trace record 回调，不能因为关闭文件落盘而一并关掉事件流
- 根目录 `AGENTS.md` 仍承担仓库级代理说明，不能直接删除，否则后续会话会丢失仓库指令
- `POST /runs` 的路径校验现在基于 agent `workspace/`，旧客户端如果继续传 `workspaceDir` 会失败

## 本轮验证

- `npm run typecheck` 通过
- `npm test` 通过
- `npm run build` 通过
- `npx vitest run test/agent-workspace.test.ts test/prompt.test.ts test/http-server.test.ts` 通过

## 结果

- `npm install --cache .npm-cache` 成功
- `npm run typecheck` 通过
- `npm test` 通过
- `npm run build` 通过
- 工作区文件体系已扩展为 `AGENTS/SOUL/USER/IDENTITY/TOOLS/BOOTSTRAP/MEMORY`
- 已切换到 `feature/http-run-api` 开发分支
- 已实现 `/health`、`/runs`、`/runs/:id`、`/runs/:id/events`、`/runs/:id/stream`、`/runs/:id/abort`
- 已完成 `POST /agents`，会在 `~/.companyclaw/<agentId>/` 下生成独立运行态与 `workspace/`
- 已完成 `/runs` 的 `agentId` 强制化，并把路径校验切到 agent `workspace/`
- 已完成 `templates/agent-workspace/` 模板目录与 `HEARTBEAT.md`
