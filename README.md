# companyClaw

`companyClaw` 是一个本地运行的最小通用代理 runtime。

它参考了 `openclaw` 的 workspace/runtime 思路，但保持独立实现。当前版本的重点是：

- 本机 HTTP 服务
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

## 目录结构

核心目录：

- `src/`：源码
- `test/`：测试
- `companyclaw.config.json`：当前工作区配置
- `.companyclaw/`：运行状态目录

运行后会生成：

```text
.companyclaw/
  sessions.json
  sessions/<sessionId>/transcript.jsonl
  sessions/<sessionId>/runs/<runId>.jsonl  # 仅在 --trace 时生成
  agent/models.json
  agent/auth.json
```

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

## 使用流程

### 1. 配置模型

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

### 2. 准备工作区文件

`companyClaw` 会把这些文件读进系统提示：

- [AGENTS.md](/Users/zhaomingxuan/code/claw/companyClaw/AGENTS.md)：运行规则和约束
- [SOUL.md](/Users/zhaomingxuan/code/claw/companyClaw/SOUL.md)：价值观和行为边界
- [USER.md](/Users/zhaomingxuan/code/claw/companyClaw/USER.md)：用户信息和偏好
- [IDENTITY.md](/Users/zhaomingxuan/code/claw/companyClaw/IDENTITY.md)：代理身份
- [TOOLS.md](/Users/zhaomingxuan/code/claw/companyClaw/TOOLS.md)：本地环境备忘
- [BOOTSTRAP.md](/Users/zhaomingxuan/code/claw/companyClaw/BOOTSTRAP.md)：首次初始化说明
- [MEMORY.md](/Users/zhaomingxuan/code/claw/companyClaw/MEMORY.md)：长期记忆

首次使用建议：

1. 先看一遍 `BOOTSTRAP.md`
2. 把 `USER.md` 和 `IDENTITY.md` 补完整
3. 把你自己的模型端点、命令、目录习惯写进 `TOOLS.md`

### 3. 启动 HTTP 服务

启动服务：

```bash
npm run serve
```

或者指定地址和端口：

```bash
node dist/src/cli.js serve --host 127.0.0.1 --port 18789
```

如果你想把每次 run 的详细 trace 落盘到 session 目录：

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

### 4. 调用 `/runs`

最小请求：

```bash
curl -s -X POST http://127.0.0.1:18789/runs \
  -H 'Content-Type: application/json' \
  -d '{
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
    "message": "请先阅读工作区文件，然后总结你是谁、你能做什么",
    "sessionKey": "main"
  },
  "runUrl": "/runs/43f24157-f721-4238-9c23-f84cde63a8d0",
  "eventsUrl": "/runs/43f24157-f721-4238-9c23-f84cde63a8d0/events",
  "streamUrl": "/runs/43f24157-f721-4238-9c23-f84cde63a8d0/stream",
  "abortUrl": "/runs/43f24157-f721-4238-9c23-f84cde63a8d0/abort"
}
```

### 5. 查询运行状态

```bash
curl -s http://127.0.0.1:18789/runs/<runId>
```

### 6. 看事件流

轮询事件：

```bash
curl -s "http://127.0.0.1:18789/runs/<runId>/events?afterSeq=0"
```

SSE 实时流：

```bash
curl -N http://127.0.0.1:18789/runs/<runId>/stream
```

### 7. 中止运行

```bash
curl -s -X POST http://127.0.0.1:18789/runs/<runId>/abort
```

### 8. 传本地路径给代理

HTTP 首版支持 `message + paths[]`。

例如让代理读取图片前先拿到图片路径：

```bash
curl -s -X POST http://127.0.0.1:18789/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "请描述这个图片的内容。必须先读取图片再回答。",
    "sessionKey": "image-demo",
    "workspaceDir": "/Users/zhaomingxuan",
    "paths": ["/Users/zhaomingxuan/Pictures/work_image/huamianai.png"]
  }'
```

服务会校验这些路径必须位于 `workspaceDir` 下，否则直接返回 `400`。

## 一个完整示例

```bash
export SOHU_BPD_API_KEY=your_key_here

npm run build
npm run serve

curl -s -X POST http://127.0.0.1:18789/runs \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "先阅读 AGENTS.md、SOUL.md、USER.md、IDENTITY.md、TOOLS.md，然后用三句话介绍你自己",
    "sessionKey": "intro"
  }'
```

## 配置说明

`companyclaw.config.json` 里最重要的是模型配置：

```json
{
  "runtime": {
    "observability": {
      "enabled": true,
      "console": false,
      "includePrompts": true,
      "includeToolArgs": true,
      "includeToolResults": true,
      "includeAssistantDeltas": true,
      "includeLlmRequests": true
    }
  },
  "primaryModel": {
    "provider": "sohu-bpd",
    "id": "qwen3.5:9b",
    "api": "openai-completions",
    "baseUrl": "http://aibook.adrd.sohuno.com/bpd_model/v1",
    "apiKeyEnv": "SOHU_BPD_API_KEY",
    "contextWindow": 128000,
    "maxTokens": 8192,
    "reasoning": false,
    "input": ["text"]
  }
}
```

字段含义：

- `provider`：provider 名称，可自定义
- `id`：模型 id
- `api`：当前默认用 `openai-completions`
- `baseUrl`：OpenAI 兼容端点根路径
- `apiKeyEnv`：从哪个环境变量读取密钥
- `contextWindow`：上下文窗口大小
- `maxTokens`：最大输出 token

日志相关字段：

- `enabled`：是否允许生成 trace；真正落盘还需要在启动时显式传 `--trace`
- `console`：是否默认把详细 trace 打到终端
- `includePrompts`：是否记录完整 prompt
- `includeToolArgs`：是否记录工具参数
- `includeToolResults`：是否记录工具结果
- `includeAssistantDeltas`：是否记录流式输出增量
- `includeLlmRequests`：是否记录每次发给模型的上下文

## HTTP 接口

```bash
GET  /health
POST /runs
GET  /runs/:id
GET  /runs/:id/events?afterSeq=<n>
GET  /runs/:id/stream
POST /runs/:id/abort
```

## 调试命令

虽然 HTTP 是正式入口，CLI `agent` 仍保留给本地调试和 smoke test：

```bash
npm run agent -- --message "你好"
node dist/src/cli.js agent --message "只回复一句话" --json
node dist/src/cli.js agent --message "你好" --trace --json
```

## 当前限制

当前版本还没有：

- Web UI
- 多渠道接入
- 浏览器工具
- 子代理
- cron / heartbeat

它现在是一个本机单用户的最小 HTTP runtime。

## 故障排查

### 模型调用失败

先检查：

1. 环境变量是否存在
2. `companyclaw.config.json` 的 `baseUrl` 是否正确
3. 模型 id 是否和服务端一致

### 自定义端点能 curl 通，但 HTTP run 不通

先确认：

- HTTP 服务启动进程继承了正确的环境变量
- `companyclaw.config.json` 已经指向正确模型
- 已执行过 `npm run build`
- 没有把旧的状态目录误当成新配置结果

必要时可以删除本地状态目录后重试：

```bash
rm -rf .companyclaw
```

### 我想看每次和模型的交互

看实时事件流：

```bash
curl -N http://127.0.0.1:18789/runs/<runId>/stream
```

看结构化日志文件：

```bash
ls .companyclaw/sessions
tail -n 50 .companyclaw/sessions/<sessionId>/runs/<runId>.jsonl
```

## 文件职责

- `AGENTS.md`：规则
- `SOUL.md`：灵魂
- `USER.md`：用户
- `IDENTITY.md`：身份
- `TOOLS.md`：工具和环境
- `BOOTSTRAP.md`：首次初始化
- `MEMORY.md`：长期记忆

这套设计参考了 `openclaw`，但做了通用代理化收敛。
