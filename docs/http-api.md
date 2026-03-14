# companyClaw HTTP 接口文档

本文档描述当前服务实际提供的 HTTP 接口。

默认服务地址示例：

```text
http://127.0.0.1:18789
```

## 接口总览

```text
GET  /health
POST /agents
POST /runs
GET  /runs/:id
GET  /runs/:id/events?afterSeq=<n>
GET  /runs/:id/stream
POST /runs/:id/abort
```

## 1. 健康检查

### GET `/health`

用途：

- 检查 HTTP 服务是否已经启动

返回示例：

```json
{
  "ok": true,
  "service": "companyclaw-http",
  "host": "127.0.0.1",
  "port": 18789
}
```

## 2. 创建 Agent

### POST `/agents`

用途：

- 在 `~/.companyclaw/<agentId>/` 下创建一个新的独立 agent

请求体：

```json
{
  "name": "研究 Agent",
  "agentId": "claw_agent_deep_research"
}
```

字段说明：

- `name`: 必填，agent 中文名
- `agentId`: 必填，agent 英文目录名，直接作为 `~/.companyclaw/<agentId>/`

成功返回：`201 Created`

返回示例：

```json
{
  "name": "研究 Agent",
  "agentId": "claw_agent_deep_research",
  "createdAt": "2026-03-14T09:00:00.000Z",
  "rootDir": "/Users/zhaomingxuan/.companyclaw/claw_agent_deep_research",
  "workspaceDir": "/Users/zhaomingxuan/.companyclaw/claw_agent_deep_research/workspace"
}
```

创建完成后，目录结构大致如下：

```text
~/.companyclaw/
  agent/
    models.json
    auth.json
  claw_agent_deep_research/
    meta.json
    agent/
      models.json
      auth.json
    sessions.json
    sessions/
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

常见错误：

- `400 Bad Request`
  - 请求体不是对象
  - 缺少 `name`
  - 缺少 `agentId`
- `409 Conflict`
  - 同名 `agentId` 已存在
- `500 Internal Server Error`
  - workspace 模板目录不存在
  - 公共 seed 初始化失败

## 3. 创建 Run

### POST `/runs`

用途：

- 对某个已创建的 agent 发起一次异步运行

请求体：

```json
{
  "agentId": "claw_agent_deep_research",
  "message": "请先阅读工作区文件，然后总结你是谁、你能做什么",
  "sessionKey": "main",
  "sessionId": "optional-session-id",
  "paths": ["notes/today.md"],
  "extraSystemPrompt": "可选的额外系统提示",
  "traceConsole": false
}
```

字段说明：

- `agentId`: 必填，目标 agent
- `message`: 必填，用户输入
- `sessionKey`: 可选，会话键；未传时默认走 `main`
- `sessionId`: 可选，显式指定会话 id
- `paths`: 可选，附带给 agent 的本地路径数组
- `extraSystemPrompt`: 可选，追加系统提示
- `traceConsole`: 可选，是否把 trace 打到服务终端

路径规则：

- `paths` 里的每一项都必须位于该 agent 的 `workspace/` 下
- 相对路径会按 `~/.companyclaw/<agentId>/workspace/` 解析
- 越界路径会直接返回 `400`

成功返回：`202 Accepted`

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

常见错误：

- `400 Bad Request`
  - 请求体不是对象
  - 缺少 `agentId`
  - 缺少 `message`
  - `paths` 不是非空字符串数组
  - 路径越出 agent workspace
- `404 Not Found`
  - `agentId` 对应的 agent 不存在

## 4. 查询 Run 状态

### GET `/runs/:id`

用途：

- 查询单个 run 的当前状态和最终结果

返回示例：

```json
{
  "runId": "43f24157-f721-4238-9c23-f84cde63a8d0",
  "status": "succeeded",
  "createdAt": "2026-03-14T06:11:27.071Z",
  "startedAt": "2026-03-14T06:11:27.100Z",
  "endedAt": "2026-03-14T06:11:30.200Z",
  "request": {
    "agentId": "claw_agent_deep_research",
    "message": "hello",
    "sessionKey": "main"
  },
  "result": {
    "runId": "43f24157-f721-4238-9c23-f84cde63a8d0",
    "sessionId": "session-id",
    "sessionKey": "main",
    "sessionFile": "/Users/zhaomingxuan/.companyclaw/claw_agent_deep_research/sessions/session-id/transcript.jsonl",
    "logFile": "/Users/zhaomingxuan/.companyclaw/claw_agent_deep_research/sessions/session-id/runs/43f24157-f721-4238-9c23-f84cde63a8d0.jsonl",
    "text": "done",
    "model": {
      "provider": "sohu-bpd",
      "model": "qwen3.5:9b"
    }
  }
}
```

状态枚举：

- `queued`
- `running`
- `succeeded`
- `failed`
- `aborted`

常见错误：

- `404 Not Found`
  - run 不存在

## 5. 轮询 Run 事件

### GET `/runs/:id/events?afterSeq=<n>`

用途：

- 轮询某个 run 的事件列表

查询参数：

- `afterSeq`: 可选，默认 `0`，只返回序号大于该值的事件

返回示例：

```json
{
  "runId": "43f24157-f721-4238-9c23-f84cde63a8d0",
  "status": "running",
  "events": [
    {
      "seq": 1,
      "ts": "2026-03-14T09:00:00.000Z",
      "runId": "43f24157-f721-4238-9c23-f84cde63a8d0",
      "type": "run.start"
    },
    {
      "seq": 2,
      "ts": "2026-03-14T09:00:00.100Z",
      "runId": "43f24157-f721-4238-9c23-f84cde63a8d0",
      "type": "prompt.user"
    }
  ],
  "nextSeq": 2
}
```

常见错误：

- `404 Not Found`
  - run 不存在

## 6. 订阅 Run SSE 流

### GET `/runs/:id/stream`

用途：

- 通过 `text/event-stream` 持续接收某个 run 的事件

查询参数：

- `afterSeq`: 可选，默认 `0`，先补发 backlog，再持续推送后续事件

响应头：

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

事件格式：

```text
data: {"seq":1,"ts":"2026-03-14T09:00:00.000Z","runId":"...","type":"run.start"}

data: {"seq":2,"ts":"2026-03-14T09:00:00.100Z","runId":"...","type":"prompt.user"}
```

当 run 已结束时，服务端会自动结束连接。

常见错误：

- `404 Not Found`
  - run 不存在

## 7. 中止 Run

### POST `/runs/:id/abort`

用途：

- 中止一个仍在 `queued` 或 `running` 的 run

成功返回示例：

```json
{
  "runId": "43f24157-f721-4238-9c23-f84cde63a8d0",
  "status": "aborted",
  "createdAt": "2026-03-14T06:11:27.071Z",
  "startedAt": "2026-03-14T06:11:27.100Z",
  "endedAt": "2026-03-14T06:11:28.500Z",
  "request": {
    "agentId": "claw_agent_deep_research",
    "message": "hello"
  }
}
```

行为说明：

- 如果 run 已经是 `succeeded`、`failed` 或 `aborted`，会直接返回当前状态
- 如果 run 仍在执行，则会触发 abort，并把状态改成 `aborted`

常见错误：

- `404 Not Found`
  - run 不存在

## 8. 备注

- 当前接口全部返回 JSON，只有 `/runs/:id/stream` 返回 SSE
- 当前没有 `GET /agents`、`DELETE /agents`、agent 列表接口
- 当前没有同步执行接口，run 一律是异步创建后再查询/订阅
