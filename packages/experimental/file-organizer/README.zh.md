---
description: "按规则整理文件夹：预览、无覆盖执行、撤销、持久历史，并可选自动打标签。"
kind: "package-reference"
---

# @deepseek-ai/dsh-file-organizer

[English](README.md) | 中文

## 概述

按文件名规则整理一个目录的直接文件：先预览准确的移动计划，再执行且绝不覆盖，完成后可撤销，重启后仍可查看历史批次。规则可以把文件投递到另一棵树（例如从收件箱送入分类资料库），每条规则还可通过已挂载的 `filetags` 服务自动打标签。本包提供 `organize_*` 工具与 `ctx.fileOrganizer`。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [定时收件箱整理](#scheduled-inbox-pass)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

把插件挂载在 `@deepseek-ai/dsh-tools`、文件系统提供方、`@deepseek-ai/dsh-working-directory` 与 `@deepseek-ai/dsh-storage-domain` 之后：

```yaml
- name: 'cordis:@deepseek-ai/dsh-file-organizer'
  config:
    maxFiles: 1000
    maxDisplayEntries: 100
    maxHistory: 50
```

`@deepseek-ai/dsh-filetags` 服务是可选的。挂载后，规则标签会在移动成功后附加；未挂载时移动仍会完成，结果会说明标签不可用。

先预览，再用返回的 batch id 执行：

```text
organize_preview(
  directory: "~/Inbox",
  destination_root: "~/Documents/Library",
  rules: [
    { pattern: "*.pdf", target: "Contracts", tags: ["contract"] },
    { pattern: "*.xlsx", target: "Sheets", tags: ["finance"] }
  ],
  others_target: "Unsorted",
  others_tags: ["triage"]
)
organize_apply(batch_id: "...", confirm: true)
```

`destination_root` 默认为被整理目录。`others_target` 与 `others_tags` 处理不匹配任何规则的文件。规则标签必须是不含空白的单个词。目录、隐藏名称与符号链接会被跳过，绝不移动。

`organize_undo` 逆向恢复一个已执行批次完成的全部移动。`organize_history` 列出最近批次的状态与移动数。二者读取同一份持久 journal，Host 重启后仍可用。

文件夹标签是另一件事：`filetags_tag` 接受目录，因此分类后的目标文件夹可以携带自己的标签，之后用 `filetags_search` 找到它，而不必向其中新增文件。除用户批准的移动外，整理器不会向被管理目录写入任何内容。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/rules.ts` 校验目标（相对路径、无 `..`、非绝对路径、无 NUL），并用 `picomatch` 编译有序 glob。首个匹配生效；规划器是纯函数并有单测。
- `src/service.ts` 负责路径解析、文件数上限、目标存在性检查、`ctx.fs.transferFile` 移动、按批次互斥锁、撤销前复查与标签写入。
- `src/spec.ts` 声明 `file_organizer` 存储域，只有一张以 batch id 为键的 `batches` 表；`storage-domain` 在每次移动之间持久化结果。
- `src/index.ts` 注册 `organize_preview`、`organize_apply`、`organize_undo` 与 `organize_history`，从 Session 目录解析相对路径，并暴露 `ctx.fileOrganizer`。
- 移动使用 `expectedDestination: createIfAbsent`，目标已存在时由文件系统拒绝而不是覆盖。撤销按相反方向应用同一规则，原路径被占用时保持文件不动并报告。

<a id="scheduled-inbox-pass"></a>
## 定时收件箱整理

调度交给现有的 `schedule` 服务；本包不新增调度器。创建一个重复任务，其 prompt 执行收件箱整理（下面这段英文 prompt 可直接使用）：

```text
Every weekday at 09:00, sort ~/Inbox into ~/Documents/Library:
- *.pdf -> Contracts, tag contract
- *.xlsx -> Sheets, tag finance
- everything else -> Unsorted, tag triage

Call organize_preview first. If the plan has moves, call organize_apply with
confirm: true (this rule set is pre-approved), then report the moved files and
any skipped or failed moves. If organize_preview fails, report the error and
do not retry destructive steps.
```

用 `schedule_create` 提供 RFC 5545 的 `DTSTART`/`RRULE` 与 `session` 目标。服务会在每个触发点投递 prompt，并补执行最近一次错过的触发，因此配方自身不需要循环。只有因为每次移动都无覆盖且可撤销，预先批准才是合理的；临时运行仍应让用户先确认预览。

<a id="model-experience"></a>
## 模型体验

### 整理工具

#### 模型所见内容

`organize_preview` 返回 batch id、绝对目录、计划与跳过数量，以及最多 `maxDisplayEntries` 条移动与跳过。跳过原因是稳定的：`hidden`、`not-a-file`、`unmatched`、`exists`、`limit`。`organize_apply` 与 `organize_undo` 返回逐移动结果，状态为 `done`、`failed`、`skipped`、`restored` 或 `undo-failed`，并带原因，例如 `missing`、`exists`、`not-a-file`、`tagging unavailable` 或带错误码的文件系统失败。`organize_history` 每个批次返回一行。

#### Token 影响

预览结果受 `maxDisplayEntries` 限制，但总数仍报告完整计划，因此大收件箱的结果大小有界。执行与撤销使用同一上限。持久记录保留每次移动，截断不会损失撤销能力。

#### KV 缓存影响

工具 schema 与描述是静态的。结果随计划变化，因此缓存前缀在调用之间保持稳定；只有追加的结果变化。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- 只处理直接子项：不遍历嵌套文件与隐藏目录。收件箱的每一层各运行一次预览。
- 仅按文件名规则：暂不支持 MIME 嗅探、内容匹配、日期或大小条件。
- 不覆盖、不冲突改名：目标已存在时报告并保持原样。
- 打标签需要已挂载的 `filetags` 服务；打标签失败不会回滚移动。
- 撤销部分执行的批次时，未完成的移动会被跳过。
- 跨文件系统的移动不是原子的；`transferFile` 使用提供方的先复制后删除回退。
- journal 保存绝对路径。在整理器之外移动或重命名被管理树会使旧批次无法撤销。

### 开发备注

<a id="dev-note"></a>

在仓库根运行本包测试：

```sh
pnpm exec vitest run packages/experimental/file-organizer
pnpm exec vitest run packages/experimental/file-organizer --coverage \
  --coverage.include='packages/experimental/file-organizer/src/**'
```

测试覆盖纯规则、基于真实 `storage-json` + `storage-domain` + `fs-local` 的服务，以及包含四个工具的真实 Loader 组合。`pnpm run build`、`doc-sync`、`hygiene` 与 `constraints` 是发布门禁。
