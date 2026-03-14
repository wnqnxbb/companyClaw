# TOOLS.md

这里记录的是当前工作区里的“本地事实”，不是抽象能力说明。

## 当前工具能力

- `read`：读取工作区文件
- `write`：写入工作区文件
- `edit`：按旧文本/新文本修改文件
- `apply_patch`：批量补丁修改
- `exec`：执行本地 shell 命令

## 当前模型配置

- 配置文件：`companyclaw.config.json`
- 当前已验证的自定义模型端点：
  - provider: `sohu-bpd`
  - model: `qwen3.5:9b`
  - baseUrl: `http://aibook.adrd.sohuno.com/bpd_model/v1`
  - apiKeyEnv: `SOHU_BPD_API_KEY`

## 当前状态目录

- `~/.companyclaw/agent/models.json`
- `~/.companyclaw/agent/auth.json`
- `~/.companyclaw/<agentId>/meta.json`
- `~/.companyclaw/<agentId>/sessions.json`
- `~/.companyclaw/<agentId>/sessions/<sessionId>/transcript.jsonl`
- `~/.companyclaw/<agentId>/sessions/<sessionId>/runs/<runId>.jsonl`（仅在 `--trace` 时生成）
- `~/.companyclaw/<agentId>/workspace/AGENTS.md`
- `~/.companyclaw/<agentId>/workspace/HEARTBEAT.md`

## 常用命令

- 安装依赖：`npm install --cache .npm-cache`
- 类型检查：`npm run typecheck`
- 测试：`npm test`
- 构建：`npm run build`
- 启动服务：`npm run serve`
- 创建 agent：`curl -s -X POST http://127.0.0.1:18789/agents -H 'Content-Type: application/json' -d '{"name":"研究 Agent","agentId":"claw_agent_deep_research"}'`
