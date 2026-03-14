# companyClaw

`companyClaw` 是一个本地运行的最小通用代理 runtime。

它参考了 `openclaw` 的 workspace/runtime 思路，但保持独立实现。当前版本的重点是：

- 本地 CLI 调用
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
  transcripts/*.jsonl
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

### 3. 运行代理

最简单的方式：

```bash
npm run agent -- --message "请先阅读工作区文件，然后总结你是谁、你能做什么"
```

或者直接运行构建后的 CLI：

```bash
node dist/src/cli.js agent --message "帮我总结这个目录的用途"
```

如果想看结构化结果：

```bash
node dist/src/cli.js agent --message "只回复一句话介绍自己" --json
```

### 4. 继续同一个会话

默认会话键是 `main`，所以你连续执行命令时会复用上下文：

```bash
node dist/src/cli.js agent --message "记住我偏好中文回复"
node dist/src/cli.js agent --message "复述一下你刚记住的偏好"
```

你也可以显式指定会话键：

```bash
node dist/src/cli.js agent --session-key planning --message "帮我做项目规划"
node dist/src/cli.js agent --session-key planning --message "继续刚才的规划"
```

如果你已经拿到某次返回里的 `sessionId`，也可以直接续接：

```bash
node dist/src/cli.js agent --session-id <session-id> --message "继续上次的话题"
```

### 5. 看详细交互日志

`companyClaw` 现在会默认把每次运行的完整结构化日志写到：

```text
.companyclaw/logs/runs/<runId>.jsonl
```

日志会包含：

- `run.start`
- `prompt.system`
- `prompt.user`
- `model.attempt`
- `llm.request`
- `tool.start`
- `tool.end`
- `assistant.delta`
- `assistant.final`
- `run.end`

如果你想在终端实时看到这些日志，执行时加 `--trace`：

```bash
node dist/src/cli.js agent --message "你好" --trace --json
```

说明：

- 详细 trace 会输出到 `stderr`
- 最终结果或 `--json` 输出仍然走 `stdout`
- 返回的 JSON 里会包含 `logFile`

## 一个完整示例

```bash
export SOHU_BPD_API_KEY=your_key_here

npm run build

node dist/src/cli.js agent --message "先阅读 AGENTS.md、SOUL.md、USER.md、IDENTITY.md、TOOLS.md，然后用三句话介绍你自己" --json
```

如果你想同时看到实时 trace：

```bash
node dist/src/cli.js agent --message "先阅读工作区文件，然后介绍你自己" --trace --json
```

## 配置说明

`companyclaw.config.json` 里最重要的是模型配置：

```json
{
  "runtime": {
    "observability": {
      "enabled": true,
      "logDir": "logs",
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

- `enabled`：是否开启日志
- `logDir`：日志目录，默认写到 `.companyclaw/logs`
- `console`：是否默认把详细 trace 打到终端
- `includePrompts`：是否记录完整 prompt
- `includeToolArgs`：是否记录工具参数
- `includeToolResults`：是否记录工具结果
- `includeAssistantDeltas`：是否记录流式输出增量
- `includeLlmRequests`：是否记录每次发给模型的上下文

## 常用命令

```bash
npm run typecheck
npm test
npm run build
npm run agent -- --message "你好"
node dist/src/cli.js agent --message "只回复一句话" --json
node dist/src/cli.js agent --message "你好" --trace --json
```

## 当前限制

当前版本还没有：

- Web UI
- Gateway / WebSocket
- 多渠道接入
- 浏览器工具
- 子代理
- cron / heartbeat

它现在是一个本地 CLI 优先的最小 runtime。

## 故障排查

### 模型调用失败

先检查：

1. 环境变量是否存在
2. `companyclaw.config.json` 的 `baseUrl` 是否正确
3. 模型 id 是否和服务端一致

### 自定义端点能 curl 通，但 runtime 不通

先确认：

- `companyclaw.config.json` 已经指向正确模型
- 已执行过 `npm run build`
- 没有把旧的状态目录误当成新配置结果

必要时可以删除本地状态目录后重试：

```bash
rm -rf .companyclaw
```

### 我想看每次和模型的交互

直接这样运行：

```bash
node dist/src/cli.js agent --message "你好" --trace --json
```

然后查看返回里的 `logFile`，或者手动打开：

```bash
ls .companyclaw/logs/runs
tail -n 50 .companyclaw/logs/runs/<runId>.jsonl
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
