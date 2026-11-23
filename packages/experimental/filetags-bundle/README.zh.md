---
description: "从插件页启用集中式文件标签、四个标签工具与右侧栏标签面板。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-filetags-bundle

[English](README.md) | 中文

## 概述

在 Web 或 Desktop 的插件页启用文件标签。该 bundle 会挂载[集中式标签数据库及其四个模型工具](../filetags/README.zh.md)、[右侧栏标签面板](../client-ui-filetags/README.zh.md)，打标签后整理文件用的[逐字节复制与移动工具](../tool-fs-transfer/README.zh.md)、[Office 与 PDF 纯文本读取](../office-text/README.zh.md)，以及[按规则整理文件夹的整理器](../file-organizer/README.zh.md)。整理器可以预览、执行、撤销并记录收件箱整理批次。标签保存在 Harness 主目录下的一个数据库中，被管理目录不会收到边车文件。发布配置默认不启用此 bundle。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

打开插件页，在 Official 分组中启用“文件标签”。该 bundle 插入 `filetags`（数据库位于 `$DSH_HOME/data/filetags.db`）、面板 `client-ui-filetags`、`tool-fs-transfer`、`office-text` 与 `file-organizer`。禁用后会移除工具与面板，数据库保留在原处，再次启用时标签仍在。

请模型给文件或文件夹打标签，例如“给 ~/notes 和 ~/notes/today.md 打上 work 标签”。在右侧栏的引导页选择“标签”，然后选择标签或输入表达式。整理收件箱时，可以让它预览 `~/Inbox` 到 `~/Documents/Library` 的规则，再执行返回的批次；`organize_undo` 可撤销。

<a id="understand-the-implementation"></a>
## 理解实现

bundle 补丁插入宿主插件、仅浏览器端的面板与工具。标签插件拥有 SQLite 数据库、四个标签工具和 `fileTags` 远程命名空间；面板挂载该命名空间生成的贡献并注册 `tags` 标签页类型；`tool-fs-transfer` 在文件系统提供方之上提供 `fs_copy` 与 `fs_move`；`office-text` 提供读取 Word、PowerPoint、Excel 与 PDF 的 `office_text`；`file-organizer` 基于 `ctx.fs.transferFile` 提供四个 `organize_*` 工具，用存储域保存 journal，并通过已挂载的 `fileTags` 服务可选打标签。任何一行都不会向被标记目录写入标签元数据。

<a id="model-experience"></a>
## 模型体验

### 文件标签工具

#### 模型所见内容

十一个工具 schema：[filetags](../filetags/README.zh.md#model-experience) 中描述的四个工具——`filetags_tag`、`filetags_untag`、`filetags_search` 和 `filetags_list`——加上 [tool-fs-transfer](../tool-fs-transfer/README.zh.md#model-experience) 的 `fs_copy` 与 `fs_move`、[office-text](../office-text/README.zh.md#model-experience) 的 `office_text`，以及 [file-organizer](../file-organizer/README.zh.md#model-experience) 的 `organize_preview`、`organize_apply`、`organize_undo` 和 `organize_history`。本 bundle 不添加自己的提示词文本。

#### Token 影响

该 bundle 为可调用工具的 Session 中每个请求增加十一个固定工具 schema。搜索结果随匹配数量增长，上限 200 条；传输结果只含路径、操作与大小；文档读取最多携带配置的字符上限；整理结果最多回显 `maxDisplayEntries` 条移动，但仍报告完整总数。

#### KV 缓存影响

除工具本身已增加的 schema 外不会失效。bundle 不贡献逐轮文本；启用或禁用会改变工具集合，从而改变前缀。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- **默认禁用** — 需按 profile 启用；发布配置不会选中它。
- **每个宿主一个数据库** — bundle 使用一个固定路径，因此共享主目录的两个宿主只有指向该文件时才共享标签。
- **不跟随移动** — 被重命名或删除的路径会保留记录，直到取消标签；宿主与面板的限制同样适用。
- **整理器需手动或定时触发** — bundle 不添加文件监视器；周期整理由 `schedule_create` 加 prompt 完成，或由用户直接调用工具。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 — 点击展开</summary>

无。

</details>
