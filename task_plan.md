# companyClaw MVP 任务计划

## 目标

实现一个独立可运行的最小通用代理 runtime，入口为本地 CLI，核心能力包含：
- 会话解析与持久化
- 工作区 bootstrap 上下文
- 基于 `@mariozechner/pi-coding-agent` 的 agent 执行
- 通用代理工作区文件体系：`AGENTS.md`、`SOUL.md`、`USER.md`、`IDENTITY.md`、`TOOLS.md`、`BOOTSTRAP.md`、`MEMORY.md`
- 最小本地工具集：`read`、`write`、`edit`、`apply_patch`、`exec`
- 基础模型 fallback
- 单元测试与构建脚本

## 阶段

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 1. 规划文件与项目骨架 | complete | 已初始化项目结构、配置、测试框架 |
| 2. 配置/会话/提示词层 | complete | 已实现 config、session store、bootstrap prompt |
| 3. 工具与 runtime | complete | 已实现工具注册、pi adapter、runAgent 主链路 |
| 4. CLI 与测试 | complete | 已实现命令行入口、单元测试 |
| 5. 安装依赖与验证 | complete | 已完成安装依赖并通过 typecheck/test |

## 决策

- 项目形态：单包 TypeScript CLI
- 运行核心：直接依赖 `@mariozechner/pi-coding-agent`
- 状态目录：工作区内 `.companyclaw/`
- 默认会话键：`main`
- 默认产品定位：通用代理，不收窄为 coding agent
- MVP 不实现 Gateway、channel、UI、plugin、subagent

## 风险

- 本地尚未安装依赖，后续需要联网安装
- `pi-coding-agent` 的少量 API 需要通过兼容层包装
- fallback 场景要避免重复写入失败轮次的末尾用户消息
- 工作区文件体系要避免沦为“空模板”，必须对默认 prompt 真正生效
- 通用代理定位不能被本地代码工具重新带偏为 coding-only

## 结果

- `npm install --cache .npm-cache` 成功
- `npm run typecheck` 通过
- `npm test` 通过
- `npm run build` 通过
- 工作区文件体系已扩展为 `AGENTS/SOUL/USER/IDENTITY/TOOLS/BOOTSTRAP/MEMORY`
