---
description: "文件整理卡片的浏览器端：在聊天中执行或撤销一个已预览的整理批次。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-file-organizer

[English](README.md) | 中文

## 概述

`organize_files` 动作卡片的浏览器端。`organize_preview` 生成计划后，助手可以给出一张卡片，显示目录与移动数量，以及 **执行**、**撤销**、**取消** 按钮。卡片把用户选择发给 [file-organizer](../file-organizer/README.zh.md) 拥有的 Host kind；该 kind 调用现有的无覆盖执行/撤销服务。卡片自身不保存状态，也不直接操作文件。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

把它与 `@deepseek-ai/dsh-action-cards`、`@deepseek-ai/dsh-client-ui-action-cards`、`@deepseek-ai/dsh-file-organizer` 一起挂载。[文件标签 bundle](../filetags-bundle/README.zh.md) 已经组合了它们。打开插件页并启用“文件标签”。

让模型整理收件箱。它预览计划后，答案下方会出现卡片；点**执行**移动文件，点**取消**保持不变，点**撤销**恢复已完成批次。卡片绝不覆盖目标，也不会在点击前执行。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/client/Card.tsx` 用 zod 校验卡片的 `details`，渲染摘要与按钮，并把 Host 阶段（`applied`、`partial`、`undone`、`undoPartial`、`failed`）映射为本地化状态。
- `src/client/mount.ts` 为动作 `organize_files` 注册卡片 body 与 8 语言文案；插件卸载时同时移除。
- Host kind 位于 [file-organizer](../file-organizer/README.zh.md)，负责执行/撤销，并通过 `actionCards.record` 记录阶段。
- 共享框架由 `client-ui-action-cards` 提供，负责隐藏答案里的 `action-card` 代码块并派发动作。

<a id="model-experience"></a>
## 模型体验

### 整理卡片

#### 模型所见内容

body 不添加请求内容。模型看到的是自己写在答案里的 `action-card` 代码块，以及点击后 action-cards 的状态通知。决策阶段与指导由 Host kind 拥有。

#### Token 影响

没有固定 schema 或提示词文本。卡片代码块是普通答案文本，body 不增加 token。

#### KV 缓存影响

无。渲染、折叠与点击不改变请求前缀；只有之后的 action-cards 状态通知会追加新上下文。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- 模型必须输出 `action-card` 代码块；格式错误或遗漏时不会出现卡片。定时运行应直接调用 `organize_apply`。
- 每轮只展示一张卡片；后续卡片会替换尚未开始的上一张。
- body 只显示数量与目录，不显示完整移动列表；完整预览在卡片上方的助手回答里。
- 仅浏览器端；无界面与 CLI 使用模型工具。

### 开发备注

<a id="dev-note"></a>

body 故意不调用自己的 Remote：它使用共享 action-card 的 `act` 回调，让访问检查、live root 检查与决策记录集中在一处。
