---
description: "持久化个人待办：六个模型工具、tasks Remote 命名空间与右侧栏任务页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tasks

[English](README.md) | 中文

## 概述

跨会话维护一份个人待办列表：在对话里添加任务，按状态、截止日期、标签或关联文件列出，修改、完成、重新打开或删除记录。任务存放在 `tasks` 存储域（通过 `storage-domain` 使用 JSON 或 SQLite），不写入 Session 事件，因此重启后仍在；[右侧栏任务页](../client-ui-tasks/README.zh.md)和模型工具通过同一个 Remote 命名空间读写。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

把它挂载在 `@deepseek-ai/dsh-tools` 与 `@deepseek-ai/dsh-storage-domain` 之后。[任务 bundle](../tasks-bundle/README.zh.md)还会挂载右侧栏面板。

```yaml
- name: 'cordis:@deepseek-ai/dsh-tasks'
  config:
    maxTasks: 5000
    maxList: 500
```

让模型添加任务：“下周五提醒我交 Q4 报告，关联 `~/Work/report.docx`，标签 work”。它会调用 `task_add`；`task_list` 按截止日期返回未完成任务；`task_complete` 标记完成。截止日期是 ISO 字符串，标签是单个词，文件路径只保存以便后续引用，不会被修改。

模型工具是 `task_add`、`task_list`、`task_view`、`task_update`、`task_complete`、`task_remove`。`task_remove` 只删除任务记录，不删除文件。重复提醒不属于任务：用 `schedule` 创建定时任务来调用任务工具或发送提醒。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/spec.ts` 声明 `tasks` 域与一张以任务 id 为键的 `tasks` 表。
- `src/service.ts` 负责校验、排序、数量上限、Remote 方法（`add`、`list`、`view`、`update`、`complete`、`remove`）以及六个工具。
- `src/types.ts` 是共享的任务 schema 与请求类型；浏览器复用同一份类型。
- `src/index.ts` 导出 Cordis 类插件与 Config schema。
- 服务首次使用时打开存储域，并随插件关闭；打开失败会在下次调用时重试。

<a id="model-experience"></a>
## 模型体验

### 任务工具

#### 模型所见内容

六个固定工具 schema。`task_add` 接收标题，以及可选的 ISO 截止日期、优先级、文件路径、标签和备注。`task_list` 按 open/done/all、标签、文件路径和数量过滤；结果按未完成优先、截止日期、优先级、创建时间排序。`task_view` 读取一个 id。`task_update` 只替换传入字段；`due_at` 或 `notes` 传空字符串表示清除。`task_complete` 默认完成，`done: false` 重新打开。`task_remove` 删除记录并返回 `removed: true`。

#### Token 影响

六个 schema 是固定前缀成本。列表结果受 `maxList` 限制；每个任务携带标题、日期、标签、路径和备注，因此长备注与大量路径会增大结果。变更返回一个任务。

#### KV 缓存影响

schema 固定。结果追加在可复用前缀之后；完成或列出任务不会改写更早的消息。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- 单一扁平列表：没有项目、子任务、依赖或负责人。
- 不建模重复规则；重复提醒交给 `schedule`。
- 文件路径按传入值保存，不做指纹，也不跟随文件移动。
- 浏览器面板在打开时和自身操作后刷新；其他 tab 的变更需要刷新后可见。
- 截止日期存为 ISO 瞬时值；面板按浏览器本地日界分组。
- 删除任务对该记录是最终操作，没有回收站。

### 开发备注

<a id="dev-note"></a>

服务把同一组操作暴露给工具和 Remote，因此面板与模型不会分叉。任务记录是普通 JSON，除用户提供的路径外不持有资源句柄。
