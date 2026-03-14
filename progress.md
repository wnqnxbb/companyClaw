# companyClaw MVP 进度日志

## 2026-03-13

- 已完成：基于 `openclaw` 梳理 runtime 最小闭环，产出技术方案。
- 已确认：MVP 采用 CLI 优先、代码代理定位、允许依赖 `@mariozechner/pi-coding-agent`。
- 已完成：初始化 `companyClaw` 项目骨架与规划文件。
- 已完成：实现配置加载、session store、bootstrap prompt、工具层、pi 适配层、runtime、CLI。
- 已完成：新增单元测试覆盖 config / session / apply_patch / fallback runtime。
- 已完成：使用 `npm install --cache .npm-cache` 安装依赖并通过 `npm run typecheck` 与 `npm test`。
- 已完成：修复自定义 provider `models.json` 结构并验证 `sohu-bpd/qwen3.5:9b` 可联通。
- 已完成：把 workspace 文件体系从 coding-only 调整为通用代理设计，并纳入默认 prompt。
- 已完成：新增 `AGENTS.md`、`SOUL.md`、`USER.md`、`IDENTITY.md`、`TOOLS.md`、`BOOTSTRAP.md`、`MEMORY.md`。
- 已完成：新增 prompt 相关测试并通过 `typecheck/test/build`。

## 2026-03-14

- 已完成：在 `companyClaw` 目录初始化独立 git 仓库。
- 已完成：提交 `main` 基线并推送到 GitHub。
- 已完成：切出 `feature/http-run-api` 分支。
- 已完成：把 `runAgent` 扩展为可传 `runId`、`abortSignal`、`onRecord`。
- 已完成：新增 `RunManager` 与原生 Node HTTP 服务。
- 已完成：新增 `/health`、`/runs`、`/runs/:id`、`/runs/:id/events`、`/runs/:id/stream`、`/runs/:id/abort`。
- 已完成：新增 HTTP server 测试并通过 `typecheck/test/build`。
- 已完成：本地 smoke 验证 `/health` 和 `POST /runs` 可用。
- 进行中：按用户确认方案改造 session 目录结构，把 transcript 与 run log 统一收拢到 `.companyclaw/sessions/<sessionId>/`。
- 进行中：把 run trace 改为显式开启，默认不生成 run log 文件。
- 已完成：新增 `src/session/paths.ts`，把 transcript 与 run log 路径统一到 session 目录。
- 已完成：`serve --trace` 改为服务级 run log 开关；`agent --trace` 同时开启 run log 与终端 trace。
- 已完成：保留 HTTP `/runs/:id/events` 和 `/runs/:id/stream` 的事件流，不再依赖文件落盘是否开启。
- 已完成：同步更新 README、TOOLS.md、配置样例与相关测试。
- 已完成：验证 `npm run typecheck`、`npm test`、`npm run build` 全部通过。
- 已完成：新增 `src/agent-workspace.ts`，统一处理 `agentId` 校验、agent 目录解析和 `POST /agents` 创建逻辑。
- 已完成：新增 `templates/agent-workspace/`，把 workspace 模板和 `HEARTBEAT.md` 固化到仓库内。
- 已完成：`POST /runs` 改为必须传 `agentId`，并按 agent `workspace/` 做路径校验。
- 已完成：新增 `test/agent-workspace.test.ts`，并扩展 HTTP / prompt 测试覆盖多 agent 行为。
- 已完成：再次验证 `npm run typecheck`、`npm test`、`npm run build` 全部通过。
