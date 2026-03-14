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
