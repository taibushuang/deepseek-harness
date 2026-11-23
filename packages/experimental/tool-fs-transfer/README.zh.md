---
description: "逐字节复制与移动文件的工具，拒绝覆盖并复用沙箱升级流程。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-fs-transfer

[English](README.md) | 中文

## 概述

文件治理的两个模型工具：`fs_copy` 逐字节复制一个文件，`fs_move` 在不解码内容的情况下移动它。两者都拒绝已存在的目标、自动创建缺失的父目录，并能处理文本读写工具无法解码的 Office 文档、图片和其他二进制文件。工具通过 `ctx.fs.transferFile` 执行，沙箱策略、Windows DACL 保留与原子发布都留在文件系统提供方。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

把插件挂载在 `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-system-prompt`、一个文件系统提供方与 `@deepseek-ai/dsh-working-directory` 之后：

```yaml
- name: 'cordis:@deepseek-ai/dsh-tool-fs-transfer'
```

让模型整理文件，例如“把 `~/Downloads/report.docx` 移到 `~/Work/CRM升级/`，目录不存在就创建”。相对路径从 Session 目录解析。目标必须不存在；同名冲突以 `FS_ALREADY_EXISTS` 失败，模型会改用其他名字而不是覆盖。

移动会先发布目标。同卷移动把源硬链接到目标后再删除源，因此目标不会是残缺文件；不支持硬链接的卷回退为原子字节复制再删除。若发布成功但删除失败，结果返回 `sourceDeleted: false` 与失败原因，两个文件都保留。

在限制型文件系统下，工具会广告 `sandbox_permissions` 与 `justification`，走与 `write`、`edit`、`apply_patch`、shell 工具相同的审批流程。拒绝信息带共享的 `[sandbox: …]` 标记与升级提示。

<a id="understand-the-implementation"></a>
## 理解实现

`src/transfer.ts` 负责 schema、参数校验、Session 目录解析、结果渲染与 `createIfAbsent` 目标护栏。提供方一侧是 `FileSystem.transferFile`：`fs-local` 通过仅所有者可用的同级暂存目录完成字节复制，再用不可覆盖的硬链接发布（没有链接的卷用 `COPYFILE_EXCL`），保留源文件模式与被替换的 Windows 目标 DACL。`fs-sandbox` 用与其他变更相同的逐调用策略同时围栏两个路径。

`src/sandbox.ts` 为这两个工具绑定公共沙箱词汇——广告目标、严格更宽检查、审批、拒绝标记。它镜像 `tool-fs` 内部的控制器，因为该类不是公开导出；共享行为仍留在 `@deepseek-ai/dsh-sandbox`。

<a id="model-experience"></a>
## 模型体验

### 传输工具

#### 模型所见内容

两个固定工具 schema：`fs_copy` 复制文件且目标必须不存在，`fs_move` 移动文件并报告源是否已删除。每个结果是单个文本块，含规范目标路径、操作、字节大小；若移动保留了源，还附带失败码与原因。

#### Token 影响

两个固定 schema 会加入可调用工具的 Session 的每个请求。结果只含路径、操作、大小与至多一行警告，不回显文件内容。

#### KV 缓存影响

schema 在 Session 生命周期内固定，构成稳定前缀。调用结果追加到 Session 日志，不替换更早的请求 token。挂载或卸载插件会改变工具集合，从而改变前缀。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- **一次一个文件** — 不移动或复制目录、递归树或 glob 批次；由模型逐个路径循环。
- **不覆盖、不替换** — 每次调用要求目标不存在。提供方支持按已观察版本替换，但未暴露；更新需换名或人工处理。
- **仅本地提供方** — `transferFile` 没有 SSH 实现；远程文件系统返回 `FS_IO_ERROR` 而不是复制。
- **不删除、不改名** — 移到新名字即移动；删除文件（含旧版本清理）不在模型工具内。
- **每次升级都需审批** — 更宽访问需要 `sandbox_permissions` 与 `justification`，并要求已组合审批服务与调用 Agent，与其他变更工具一致。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 — 点击展开</summary>

沙箱控制器复刻自 `packages/fs/tool-fs/src/sandbox.ts`，因为该模块是内部模块，而插件入口只允许导出 Loader 契约。调整广告目标、审批请求或拒绝文案时需同步两处；共享函数位于 `@deepseek-ai/dsh-sandbox`。

</details>
