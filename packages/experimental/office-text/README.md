---
description: "Plain-text reading of Word, PowerPoint, Excel, and PDF documents through one model tool and a shared service."
kind: "package-reference"
---

# @deepseek-ai/dsh-office-text

English | [中文](README.zh.md)

## Summary

Read the text of office documents and PDFs without a Headless Office install: `office_text` returns Word paragraphs and table cells, presentation slide text, workbook rows, or PDF page text. The package also provides `ctx.officeText`, so later document consumers can reuse the same extractor and caps. It reads `.docx`, `.docm`, `.pptx`, `.pptm`, `.xlsx`, `.xlsm`, and `.pdf`; legacy binary formats are not supported.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin after `@deepseek-ai/dsh-tools`, a filesystem provider, and `@deepseek-ai/dsh-working-directory`:

```yaml
- name: 'cordis:@deepseek-ai/dsh-office-text'
  config:
    maxChars: 20000
    maxPages: 50
```

Ask the model to read a document, for example "summarize `~/Work/CRM/report.docx`". Relative paths resolve from the Session directory. `max_chars` and `max_pages` override the defaults per call, clamped to `maxCharsCap` and `maxPagesCap`.

The service is the reusable half:

```text
const result = await ctx.officeText.extract(target, { maxChars: 4000 }, signal)
```

Limits: `maxBytes` bounds one file read (64 MiB by default); `maxChars` and `maxPages` are defaults; the `…Cap` fields are hard ceilings. OOXML parts are decompressed with a per-part and combined budget, so a crafted archive cannot expand without bound.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/ooxml.ts` reads only the needed ZIP parts with `fflate` under size caps, then walks the XML in document order with `fast-xml-parser`, preserving paragraphs, tabs, breaks, table cells, and rows.
- `src/xlsx.ts` reads workbooks with ExcelJS and renders formatted cell values as tab-separated rows, one section per worksheet.
- `src/pdf.ts` extracts the text layer with the `pdfjs-dist` legacy build, which runs in Node without a DOM or worker; the loading task is destroyed after every read.
- `src/service.ts` owns format detection, the byte cap, and error mapping; `src/index.ts` adds path resolution, per-call caps, rendering, and the `ctx.officeText` service.

<a id="model-experience"></a>
## Model Experience

### Office text tool

#### What the model sees

One fixed `office_text` schema: `path`, optional `max_chars`, and optional `max_pages`. Its result is one text block with the canonical path, detected format, the extracted text, and a `[truncated]` marker when the cap clipped the document.

#### Token effect

The schema is a fixed addition to the tool list. A result carries at most the configured character cap (20,000 by default, 100,000 maximum), so one document can consume a large fraction of the context; truncation states that explicitly.

#### KV Cache effect

The schema is fixed for the lifetime of a Session and forms a stable prefix. Calls append their extracted text to the Session log; no earlier request tokens are replaced. Mounting or unmounting the plugin changes the tool set and therefore the prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Legacy binary Office formats** — `.doc`, `.ppt`, and `.xls` are rejected; converting them first needs an Office engine.
- **Word body only** — headers, footers, footnotes, comments, and tracked-change markup are not extracted.
- **Slides only** — speaker notes and embedded charts are not read.
- **Worksheet display values** — cached formula results are shown; formulas are not recalculated, and very large workbooks load whole into memory before the character cap applies.
- **PDF text layer only** — scanned pages without a text layer return little or no text; OCR is not included.
- **One document per call** — folders and recursive batches are not extracted; the model loops over paths.
- **No embedded media** — images, attachments, and charts inside documents are ignored.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`pdfjs-dist` is imported through `legacy/build/pdf.mjs` because the modern build expects browser hashing APIs in Node. The byte array is copied into a plain `Uint8Array` because pdfjs rejects Node `Buffer` instances. The workbook reader uses ExcelJS, already present in the workspace through the document preview, rather than a second spreadsheet engine.

</details>
