---
description: "从插件页启用持久化个人待办、六个模型工具与右侧栏任务页。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-tasks-bundle

[English](README.md) | 中文

## 概述

在 Web 或 Desktop 的插件页启用个人待办。该 bundle 会挂载[任务服务及其六个模型工具](../tasks/README.zh.md)和[右侧栏任务页](../client-ui-tasks/README.zh.md)。任务存放在 Harness 主目录下的一个存储域中，不写入 Session 事件，因此重启后仍在。发布配置默认不启用此 bundle。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

打开插件页，在 Official 分组中启用“任务”。该 bundle 插入 `tasks` 与 `client-ui-tasks`。禁用后会移除工具与页面，已存任务保留，再次启用时仍在。

让模型添加任务，或在右侧栏任务页输入标题。模型工具可设置截止日期、标签、优先级、备注与关联文件；页面按到期分组，并支持完成或重新打开。

<a id="understand-the-implementation"></a>
## 理解实现

bundle 补丁插入宿主服务与浏览器面板。宿主服务拥有 `tasks` 存储域、六个工具和 `tasks` Remote 命名空间；面板挂载该命名空间并注册 `tasks` 标签页类型。不会把任务写入 Session 事件或被管理文件。

<a id="model-experience"></a>
## 模型体验

### 任务工具

#### 模型所见内容

[tasks](../tasks/README.zh.md#model-experience) 提供的六个工具 schema：`task_add`、`task_list`、`task_view`、`task_update`、`task_complete`、`task_remove`。本 bundle 不添加自己的提示词文本。

#### Token 影响

工具可见时，每个请求增加六个固定 schema。列表结果受 `maxList` 限制；变更返回一个任务。

#### KV 缓存影响

schema 固定；结果追加在可复用前缀之后。启用或禁用 bundle 会改变工具集合，从而改变前缀。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- **默认禁用** — 需按 profile 启用。
- **不支持重复** — 重复提醒使用 `schedule`。
- **单一扁平列表** — 没有项目、子任务、负责人，除 `completedAt` 外没有完成历史。
- **面板刷新** — 其他 tab 的变更需要刷新后可见。

### 开发备注

<a id="dev-note"></a>

bundle 只组合现有包，不添加自己的工具或存储。
