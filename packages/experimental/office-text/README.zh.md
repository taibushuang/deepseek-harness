---
description: "通过一个模型工具与共享服务读取 Word、PowerPoint、Excel 与 PDF 文档的纯文本。"
kind: "package-reference"
---

# @deepseek-ai/dsh-office-text

[English](README.md) | 中文

## 概述

无需安装无头 Office 即可读取办公文档与 PDF 的文本：`office_text` 返回 Word 段落与表格单元格、演示文稿幻灯片文本、工作簿行或 PDF 页面文本。本包还提供 `ctx.officeText`，后续文档消费者可复用同一抽取器与上限。支持 `.docx`、`.docm`、`.pptx`、`.pptm`、`.xlsx`、`.xlsm` 与 `.pdf`；不支持旧版二进制格式。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

把插件挂载在 `@deepseek-ai/dsh-tools`、文件系统提供方与 `@deepseek-ai/dsh-working-directory` 之后：

```yaml
- name: 'cordis:@deepseek-ai/dsh-office-text'
  config:
    maxChars: 20000
    maxPages: 50
```

让模型读文档，例如“总结 `~/Work/CRM/report.docx`”。相对路径从 Session 目录解析。`max_chars` 与 `max_pages` 按调用覆盖默认值，并受 `maxCharsCap`、`maxPagesCap` 硬上限约束。

服务是可复用的一半：

```text
const result = await ctx.officeText.extract(target, { maxChars: 4000 }, signal)
```

限制：`maxBytes` 约束单文件读取（默认 64 MiB）；`maxChars`、`maxPages` 是默认值，带 `Cap` 的字段是硬上限。OOXML 解压有单部件与总量预算，构造的压缩包无法无限膨胀。

<a id="understand-the-implementation"></a>
## 理解实现

- `src/ooxml.ts` 用 `fflate` 在尺寸上限内只解压所需 ZIP 部件，再用 `fast-xml-parser` 按文档顺序遍历 XML，保留段落、制表符、换行、表格单元格与行。
- `src/xlsx.ts` 用仓库固定的 SheetJS 构建读取工作簿，把格式化后的单元格值渲染为制表符分隔的行，每个工作表一节。
- `src/pdf.ts` 用 `pdfjs-dist` legacy 构建抽取文本层，可在 Node 下无 DOM、无 worker 运行；每次读取后销毁加载任务。
- `src/service.ts` 负责格式识别、字节上限与错误映射；`src/index.ts` 增加路径解析、逐调用上限、渲染与 `ctx.officeText` 服务。

<a id="model-experience"></a>
## 模型体验

### Office 文本工具

#### 模型所见内容

一个固定的 `office_text` schema：`path`、可选的 `max_chars` 与 `max_pages`。结果是单个文本块，含规范路径、识别出的格式、抽取文本；被上限截断时带 `[truncated]` 标记。

#### Token 影响

schema 是工具列表的固定增量。单个结果最多携带配置的字符上限（默认 20,000，最大 100,000），因此一份文档可能占用很大一部分上下文；截断会明确标注。

#### KV 缓存影响

schema 在 Session 生命周期内固定，构成稳定前缀。调用把抽取文本追加到 Session 日志，不替换更早的请求 token。挂载或卸载插件会改变工具集合，从而改变前缀。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- **旧版二进制 Office 格式** — `.doc`、`.ppt`、`.xls` 会被拒绝；转换需先使用 Office 引擎。
- **仅 Word 正文** — 页眉、页脚、脚注、批注与修订标记不抽取。
- **仅幻灯片** — 演讲者备注与内嵌图表不读取。
- **工作表显示值** — 显示公式的缓存结果，不重新计算；超大工作簿会在字符上限生效前整体载入内存。
- **仅 PDF 文本层** — 无文本层的扫描页几乎没有文本；不含 OCR。
- **一次一份文档** — 不抽取目录或递归批次；由模型逐个路径循环。
- **不含内嵌媒体** — 文档中的图片、附件与图表会被忽略。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 — 点击展开</summary>

`pdfjs-dist` 通过 `legacy/build/pdf.mjs` 导入，因为现代构建在 Node 下需要浏览器哈希 API。字节数组会复制成普通 `Uint8Array`，因为 pdfjs 拒绝 Node `Buffer` 实例。工作簿读取使用文档预览已引入的 ExcelJS，而不是再引入第二套表格引擎。

</details>
