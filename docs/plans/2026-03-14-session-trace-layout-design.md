# session trace 目录改造设计

日期：2026-03-14

## 背景

当前实现中：

- transcript 落在 `.companyclaw/transcripts/<sessionId>.jsonl`
- run trace 落在 `.companyclaw/logs/runs/<runId>.jsonl`

这样按单次 run 排查很方便，但按会话查看历史比较分散，也不符合用户对“一个会话一组文件”的心智模型。

## 目标

- 把 transcript 和 run trace 都收拢到 session 目录下
- 保留 run 级边界，避免多轮或并发 run 混到同一个文件里
- trace 改为显式开启，默认不生成 run trace 文件
- 保持 HTTP `/runs/:id/events` 和 `/runs/:id/stream` 的事件流能力

## 最终结构

```text
.companyclaw/
  sessions.json
  sessions/
    <sessionId>/
      transcript.jsonl
      runs/
        <runId>.jsonl
  agent/
    models.json
    auth.json
```

规则：

- transcript 始终按 session 维度保存
- 只有在 `companyclaw serve --trace` 或 `companyclaw agent --trace` 时，才写 `runs/<runId>.jsonl`
- 即使没有 `--trace`，HTTP run 事件流也必须正常工作

## 兼容策略

- `sessions.json` 里的 `sessionFile` 继续作为真实来源
- 已存在的旧 session 可以继续指向历史 transcript 文件
- 新创建的 session 统一使用新的 session 目录布局

## 风险点

- 如果把 logger 直接关掉，会连带丢失 HTTP 事件流
- README、TOOLS、测试里的旧路径说明都需要同步修改
- 已存在的旧 session 不做自动搬迁，后续如果需要可单独补迁移工具
