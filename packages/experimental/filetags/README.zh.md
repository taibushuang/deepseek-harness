---
description: "面向机器上任意文件和目录的中央数据库标签，并以标签表达式搜索，作为模型工具提供。"
kind: "package-reference"
---

# @deepseek-ai/dsh-filetags

[English](README.md) | 中文

## 概述

为机器上任意文件和目录添加标签，并通过标签表达式（例如 `project and not archive`）再次找到它们。标签保存在 Harness 数据目录下的一个中央 SQLite 数据库中，因此不会在任何被管理路径旁写入边车文件。四个模型工具暴露该存储：`filetags_tag`、`filetags_untag`、`filetags_search` 和 `filetags_list`。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在 `cordis.yml` 中，把插件挂载在 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-tool-executor-native` 与 `@deepseek-ai/dsh-system-prompt` 之后。插件需要 `ctx.tools`。

```yaml
- name: 'cordis:@deepseek-ai/dsh-filetags'
  config:
    path: '/Users/me/.dsh/data/filetags.db'
```

`path` 是数据库文件。默认值为 Harness 主目录 `data` 类别下的 `filetags.db`。文件及其目录在首次使用时以仅所有者可访问的权限创建。关闭插件会移除这四个工具，数据库保留在原处。

传给工具的路径必须是绝对路径。标签是一个不含空白和括号的单词；`and`、`or`、`not` 保留给表达式。标签在首次使用时创建，在其最后一个路径被取消标记时删除。

<a id="understand-the-implementation"></a>
## 理解实现

数据库有三张表：`tags`；以绝对路径为键的 `entries`，记录打标签时观察到的类型、大小和修改时间；以及连接两者的 `entry_tags`。`src/schema.ts` 通过 `PRAGMA user_version` 打开数据库，其他已存储版本会被拒绝，而不是迁移。`src/query.ts` 按 `not`、`and`、`or` 的优先级解析表达式，并编译为基于 `entries` 的布尔条件，其中标签名为绑定参数。`src/store.ts` 负责写入；每次打标签或取消标签都在一个 `BEGIN IMMEDIATE` 事务中运行，取消标签会删除不再有关联的条目和标签。

搜索结果最多返回 200 条，按路径排序。被移动或删除的路径会保留其记录；存储层尚不跟随移动。

<a id="model-experience"></a>
## 模型体验

### 请求上下文与条件

#### 模型所见内容

只要挂载了插件，四个工具的 schema 及其描述就会被发送。每个工具返回一个 JSON 对象：打标签和取消标签返回 `tagged` 或 `removed` 计数，搜索返回 `entries`，列出返回 `tags` 或 `entry`。

#### Token 影响

四个 schema 是工具列表中固定增加的部分。一次搜索最多返回 200 条，每条包含路径和标签名，因此结果大小随匹配数量增长。打标签与取消标签的结果只是一个计数。

#### KV 缓存影响

工具 schema 在 Session 生命周期内保持不变，因此构成稳定前缀。每次调用与结果都追加到 Session 日志中，不替换更早的请求 token。改变挂载的工具集合会使该前缀的复用失效。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- **不跟随移动和删除** — 被重命名或删除的已标记路径会保留其记录，直到取消标记，因此搜索可能返回已不存在的路径。基于指纹的移动跟随被延期。
- **没有 `tag=value` 键值对** — 标签是普通名称。值、蕴含关系和已保存查询均未建模。
- **标签名区分大小写** — `Project` 与 `project` 是不同的标签。
- **没有 Client UI** — 工具是唯一入口；尚无浏览面板。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 — 点击展开</summary>

无。

</details>
