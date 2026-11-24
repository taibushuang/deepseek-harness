---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-24-session-retract

[English](2026-11-24-session-retract.md) | 中文

## 概述

新增仅记录用的 session/retract tombstone 事件，以及 retraction 用户消息来源类型；Host 用一条空的 developer 替换消息覆盖被撤回的 surface 区间。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-24-session-retract
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-05-timeline-priority-notice"
    after: "37b0fed74bbd2a46883dcc3c80f52494e692c6d8102f5de70559cd806c3cca4c"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-05-timeline-priority-notice"
    after: "d1dfc4a17a97ea922687d8643bc115bef645bdcea36131077c82dabbf058be24"
    decision: same-version
  - root: "event:session/retract"
    previous: null
    after: "43694ab4747176f29b7fee2afef1a25b3a792f988db90a824848c547b909ebf3"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-05-timeline-priority-notice"
    after: "6b24cebc10a7d84df170574bd21597b72820d0d62ef2c339aca4662093c981a1"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-05-timeline-priority-notice"
    after: "4c757c3dfe27b6763e72b44034f44072c78273d5d356c1e42ee8d14a8086732d"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有事件的 schema 与语义不变。新读取器会从模型输入中隐藏被覆盖区间，保留原始事件用于审计，并显示一条 tombstone。旧读取器不认识不带 ignorable 标记的 session/retract，因此会拒绝包含该事件的日志，而不是在缺少 tombstone 的情况下静默重建对话。空的 developer 替换消息对把空 developer 内容投影为空的读取器仍然无副作用。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/api/session-controller：1165 个测试通过，包括新增的撤回 Host 用例（区间覆盖、历史轮次、非用户目标、运行中轮次与待处理队列）。pnpm exec vitest run packages/client/ui-chat：1035 个测试通过，包括 tombstone 过滤、导航过滤与编辑/撤回操作。pnpm run build:check 的 Host 与 Client 聚合检查通过。

<a id="dev-note"></a>
## 开发备注

无。
