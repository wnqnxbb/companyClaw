# companyClaw

`companyClaw` 是一个本地运行的最小通用代理 runtime。

它参考了 `openclaw` 的 workspace/runtime 思路，但保持独立实现。当前版本重点是：

- 本机 HTTP 服务
- 多 agent workspace
- 会话持久化
- 工作区文件驱动的系统提示
- 最小工具集：`read`、`write`、`edit`、`apply_patch`、`exec`
- 支持 OpenAI 兼容模型端点和基础 fallback

## 当前适合做什么

- 日常问答
- 写作、改写、总结
- 研究与整理
- 本地文件处理
- 需要时执行终端命令
- coding 任务

注意：`companyClaw` 的默认定位是通用代理，不是只会写代码的代理。

## 安装

在项目目录执行：

```bash
npm install --cache .npm-cache
```

## 构建与测试

```bash
npm run typecheck
npm test
npm run build
```

## 配置模型

默认读取当前目录下的 `companyclaw.config.json`。

如果你用 OpenAI：

```bash
export OPENAI_API_KEY=your_key_here
```

如果你用自定义 OpenAI 兼容端点，比如当前已经验证过的 `sohu-bpd`：

```bash
export SOHU_BPD_API_KEY=your_key_here
```

当前仓库里的 [companyclaw.config.json](/Users/zhaomingxuan/code/claw/companyClaw/companyclaw.config.json) 已经配置好了这个示例端点：

- provider: `sohu-bpd`
- model: `qwen3.5:9b`
- baseUrl: `http://aibook.adrd.sohuno.com/bpd_model/v1`

如果你要换模型，可以参考 [companyclaw.config.example.json](/Users/zhaomingxuan/code/claw/companyClaw/companyclaw.config.example.json)。

## 模板目录

新 agent 的 workspace 模板保存在：

- [templates/agent-workspace/AGENTS.md](/Users/zhaomingxuan/code/claw/companyClaw/templates/agent-workspace/AGENTS.md)
- [templates/agent-workspace/SOUL.md](/Users/zhaomingxuan/code/claw/companyClaw/templates/agent-workspace/SOUL.md)
- [templates/agent-workspace/USER.md](/Users/zhaomingxuan/code/claw/companyClaw/templates/agent-workspace/USER.md)
- [templates/agent-workspace/IDENTITY.md](/Users/zhaomingxuan/code/claw/companyClaw/templates/agent-workspace/IDENTITY.md)
- [templates/agent-workspace/TOOLS.md](/Users/zhaomingxuan/code/claw/companyClaw/templates/agent-workspace/TOOLS.md)
- [templates/agent-workspace/BOOTSTRAP.md](/Users/zhaomingxuan/code/claw/companyClaw/templates/agent-workspace/BOOTSTRAP.md)
- [templates/agent-workspace/HEARTBEAT.md](/Users/zhaomingxuan/code/claw/companyClaw/templates/agent-workspace/HEARTBEAT.md)
- [templates/agent-workspace/MEMORY.md](/Users/zhaomingxuan/code/claw/companyClaw/templates/agent-workspace/MEMORY.md)

## 运行目录结构

服务启动时不会自动创建任何 `claw_agent_xxx` 目录。只有调用 `POST /agents` 之后，才会在 `~/.companyclaw` 下生成对应 agent。

公共 seed：

```text
~/.companyclaw/
  agent/
    models.json
    auth.json
```

单个 agent：

```text
~/.companyclaw/
  claw_agent_deep_research/
    meta.json
    agent/
      models.json
      auth.json
    sessions.json
    sessions/
      <sessionId>/
        transcript.jsonl
        runs/
          <runId>.jsonl  # 仅在 --trace 时生成
    workspace/
      AGENTS.md
      SOUL.md
      USER.md
      IDENTITY.md
      TOOLS.md
      BOOTSTRAP.md
      HEARTBEAT.md
      MEMORY.md
```

旧的 `~/.companyclaw/logs`、`~/.companyclaw/transcripts`、`~/.companyclaw/sessions.json` 不会自动迁移，也不会删除。

## 启动 HTTP 服务

```bash
npm run serve
```

或者指定地址和端口：

```bash
node dist/src/cli.js serve --host 127.0.0.1 --port 18789
```

如果你想把每次 run 的详细 trace 落盘到对应 session 目录：

```bash
node dist/src/cli.js serve --host 127.0.0.1 --port 18789 --trace
```

成功后会输出：

```json
{
  "ok": true,
  "host": "127.0.0.1",
  "port": 18789,
  "baseUrl": "http://127.0.0.1:18789"
}
```

## HTTP 接口

```text
GET  /health
POST /agents
POST /runs
GET  /runs/:id
GET  /runs/:id/events?afterSeq=<n>
GET  /runs/:id/stream
POST /runs/:id/abort
```

### 1. 创建 agent

```bash
curl -s -X POST http://127.0.0.1:18789/agents \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "研究 Agent",
    "agentId": "claw_agent_deep_research"
  }'
```

成功返回示例：

```json
{
  "name": "研究 Agent",
  "agentId": "claw_agent_deep_research",
  "createdAt": "2026-03-14T09:00:00.000Z",
  "rootDir": "/Users/zhaomingxuan/.companyclaw/claw_agent_deep_research",
  "workspaceDir": "/Users/zhaomingxuan/.companyclaw/claw_agent_deep_research/workspace"
}
```

如果 `agentId` 已存在，会返回 `409`。

### 2. 调用 `/runs`

`POST /runs` 现在必须传 `agentId`，服务端会自动加载对应 agent 的 `workspace/` 和运行态目录。

最小请求：

```bash
curl -s -X POST http://127.0.0.1:18789/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "agentId": "claw_agent_deep_research",
    "message": "请先阅读工作区文件，然后总结你是谁、你能做什么",
    "sessionKey": "main"
  }'
```

返回示例：

```json
{
  "runId": "43f24157-f721-4238-9c23-f84cde63a8d0",
  "status": "queued",
  "createdAt": "2026-03-14T06:11:27.071Z",
  "request": {
    "agentId": "claw_agent_deep_research",
    "message": "请先阅读工作区文件，然后总结你是谁、你能做什么",
    "sessionKey": "main"
  },
  "runUrl": "/runs/43f24157-f721-4238-9c23-f84cde63a8d0",
  "eventsUrl": "/runs/43f24157-f721-4238-9c23-f84cde63a8d0/events",
  "streamUrl": "/runs/43f24157-f721-4238-9c23-f84cde63a8d0/stream",
  "abortUrl": "/runs/43f24157-f721-4238-9c23-f84cde63a8d0/abort"
}
```

### 3. 查询运行状态

```bash
curl -s http://127.0.0.1:18789/runs/<runId>
```

### 4. 看事件流

轮询事件：

```bash
curl -s "http://127.0.0.1:18789/runs/<runId>/events?afterSeq=0"
```

SSE 实时流：

```bash
curl -N http://127.0.0.1:18789/runs/<runId>/stream
```

### 5. 中止运行

```bash
curl -s -X POST http://127.0.0.1:18789/runs/<runId>/abort
```

### 6. 传本地路径给代理

HTTP 支持 `message + paths[]`，但这些路径必须位于目标 agent 的 `workspace/` 下。

例如：

```bash
curl -s -X POST http://127.0.0.1:18789/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "agentId": "claw_agent_deep_research",
    "message": "请先读取附带文件，再总结重点。",
    "sessionKey": "file-demo",
    "paths": ["notes/today.md"]
  }'
```

服务会把 `notes/today.md` 解析到：

`~/.companyclaw/claw_agent_deep_research/workspace/notes/today.md`

如果路径越出该 workspace，会直接返回 `400`。

## 一个完整示例

```bash
export SOHU_BPD_API_KEY=your_key_here

npm run build
npm run serve

curl -s -X POST http://127.0.0.1:18789/agents \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "研究 Agent",
    "agentId": "claw_agent_deep_research"
  }'

curl -s -X POST http://127.0.0.1:18789/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "agentId": "claw_agent_deep_research",
    "message": "先阅读 AGENTS.md、SOUL.md、USER.md、IDENTITY.md、TOOLS.md、HEARTBEAT.md，然后用三句话介绍你自己",
    "sessionKey": "intro"
  }'
```

## 常见排查

1. `POST /agents` 返回 `500`
   通常是模板目录不存在，先检查 [templates/agent-workspace](/Users/zhaomingxuan/code/claw/companyClaw/templates/agent-workspace)。
2. `POST /runs` 返回 `404`
   通常是 `agentId` 对应目录还没创建，先调用 `/agents`。
3. `POST /runs` 返回 `400`
   常见原因是 `paths` 越出了 `workspace/`。
4. 模型调用失败
   检查环境变量、`companyclaw.config.json` 的 `baseUrl`，以及 `~/.companyclaw/agent/models.json` 是否正常生成。
