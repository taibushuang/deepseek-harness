---
description: "右侧栏任务页：按到期分组、快速添加、完成/重开与删除，读写 tasks Remote 命名空间。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-tasks

[English](README.md) | 中文

## 概述

右侧栏的“任务”页。它把未完成任务分成 **逾期**、**今天**、**本周**、**以后** 四组，已完成任务放在 **已完成**；顶部可快速输入标题添加任务。勾选框完成任务或重新打开；删除按钮只删除任务记录。所有读写都走 [tasks](../tasks/README.zh.md) 拥有的 `tasks` Remote 命名空间。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

把它与 `@deepseek-ai/dsh-tasks` 一起挂载。[任务 bundle](../tasks-bundle/README.zh.md)已经组合两者。打开插件页启用“任务”；右侧栏出现任务页，所有会话都能使用模型工具。

输入标题并按**添加**即可快速建任务；需要截止日期、标签、优先级、备注或关联文件时，用对话创建。面板在打开时和自身操作后刷新。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/client/mount.ts` 挂载生成的 `tasks` Remote，注册 `tasks` 标签页类型、文案与面板 body。
- `src/client/TaskPanel.tsx` 按浏览器本地日界分组，渲染快速添加表单，并发送完成/删除调用。
- `src/client/face.ts` 把 Remote 结果解包成面板调用的操作。
- Host 服务位于 [tasks](../tasks/README.zh.md)，负责存储、校验、排序与模型工具。

<a id="model-experience"></a>
## 模型体验

### 任务面板

#### 模型所见内容

面板不添加提示词或 schema。模型看到的是 [tasks](../tasks/README.zh.md) 拥有的 `task_*` 工具；面板操作本身不进入模型上下文。

#### Token 影响

无。面板渲染、分组与快速添加不增加请求 token。

#### KV 缓存影响

无。面板通过 Remote 命名空间读写，不改变请求前缀。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- 快速添加只设置标题；截止日期、标签、优先级、备注与文件关联通过对话工具设置。
- 面板在打开时和自身操作后刷新；其他 tab 的变更需要刷新后可见。
- 面板只显示截止日期与标签行，不显示完整备注或文件列表；详情用 `task_view` 或对话查看。
- 删除任务会立即移除记录，没有撤销。
- 仅浏览器端；无界面运行使用模型工具。

### 开发备注

<a id="dev-note"></a>

面板刻意不保留本地任务存储：Remote 命名空间是唯一数据源，因此重启、刷新或另一个客户端看到的是同一份记录。
