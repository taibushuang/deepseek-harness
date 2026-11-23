---
description: "Rule-driven folder organization with preview, no-overwrite apply, undo, durable history, and optional file tagging."
kind: "package-reference"
---

# @deepseek-ai/dsh-file-organizer

English | [中文](README.zh.md)

## Summary

Organize one directory's direct files by name rules: preview the exact moves, apply them without overwriting anything, undo a completed batch, and list durable batches after a restart. Rules can route files into another tree (an inbox folder into a categorized library), and each rule can attach tags through a mounted `filetags` service. The package provides the `organize_*` tools and `ctx.fileOrganizer`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Scheduled inbox pass](#scheduled-inbox-pass)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin after `@deepseek-ai/dsh-tools`, a filesystem provider, `@deepseek-ai/dsh-working-directory`, and `@deepseek-ai/dsh-storage-domain`:

```yaml
- name: 'cordis:@deepseek-ai/dsh-file-organizer'
  config:
    maxFiles: 1000
    maxDisplayEntries: 100
    maxHistory: 50
```

The `@deepseek-ai/dsh-filetags` service is optional. When it is mounted, rule tags are attached after a successful move; without it, moves still complete and the result says tagging was unavailable.

Preview first, then apply the returned batch id:

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

`destination_root` defaults to the organized directory. `others_target` and `others_tags` handle files matching no rule. A rule tag must be one word without whitespace. Directories, hidden names, and symlinks are skipped, never moved.

`organize_undo` reverses every move an applied batch completed. `organize_history` lists recent batches with status and move count. Both read the same durable journal, so they keep working after a Host restart.

Folder tags are a separate concern: `filetags_tag` accepts directories, so a categorized destination folder can carry its own tags and be found later with `filetags_search` without adding files to it. The organizer never writes into a managed directory except the moves the user approved.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/rules.ts` validates targets (relative, no `..`, no absolute paths, no NUL) and compiles ordered globs with `picomatch`. First match wins; the planner is pure and unit-tested.
- `src/service.ts` owns path resolution, the file cap, destination-exists checks, `ctx.fs.transferFile` moves, the busy lock per batch, undo re-checks, and tag writing.
- `src/spec.ts` declares the `file_organizer` storage domain with one `batches` table keyed by batch id; `storage-domain` persists every outcome between moves.
- `src/index.ts` registers `organize_preview`, `organize_apply`, `organize_undo`, and `organize_history`, resolves relative paths from the Session directory, and exposes `ctx.fileOrganizer`.
- Moves use `expectedDestination: createIfAbsent`, so an existing destination is rejected by the filesystem rather than overwritten. Undo applies the same rule in reverse and leaves an occupied original path alone.

<a id="scheduled-inbox-pass"></a>
## Scheduled inbox pass

Scheduling belongs to the existing `schedule` service; this package adds no scheduler. Create one recurring task whose prompt runs the inbox pass, for example:

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

Use `schedule_create` with an RFC 5545 `DTSTART`/`RRULE` and a `session` target. The service delivers the prompt at each occurrence and catches up with the latest missed occurrence, so the recipe needs no loop of its own. A standing approval is appropriate only because every move is no-overwrite and undoable; ad-hoc runs still require the user to approve the preview.

<a id="model-experience"></a>
## Model Experience

### Organizer tools

#### What the model sees

`organize_preview` returns the batch id, absolute directory, planned and skipped counts, and up to `maxDisplayEntries` moves and skips. Skips use stable reasons: `hidden`, `not-a-file`, `unmatched`, `exists`, and `limit`. `organize_apply` and `organize_undo` return per-move outcomes with `done`, `failed`, `skipped`, `restored`, or `undo-failed`, plus a reason such as `missing`, `exists`, `not-a-file`, `tagging unavailable`, or a coded filesystem failure. `organize_history` returns one line per batch.

#### Token effect

Preview output is capped by `maxDisplayEntries` while the totals still report the full plan, so a large inbox costs a bounded result. Apply and undo report the same cap. The durable record keeps every move, so truncation never loses the ability to undo.

#### KV Cache effect

Tool schemas and descriptions are static. Results vary with the plan, so the cache prefix stays stable across calls; only the appended result changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Direct children only: nested files and hidden directories are not traversed. Run one preview per inbox level.
- Name rules only: no MIME sniffing, content matching, dates, or size conditions yet.
- No overwrite and no rename-on-conflict: an existing destination is reported and left untouched.
- Tagging needs a mounted `filetags` service; the move is not rolled back when tagging fails.
- Undo of a partially applied batch skips moves that never completed.
- A move is not atomic across filesystems; `transferFile` uses the provider's copy-then-remove fallback.
- The journal stores absolute paths. Moving or renaming the managed tree outside the organizer makes old batches un-undoable.

### Dev Note

<a id="dev-note"></a>

Run the package tests from the repository root:

```sh
pnpm exec vitest run packages/experimental/file-organizer
pnpm exec vitest run packages/experimental/file-organizer --coverage \
  --coverage.include='packages/experimental/file-organizer/src/**'
```

The suite covers pure rules, the service over real `storage-json` + `storage-domain` + `fs-local`, and a real Loader composition with the four tools. `pnpm run build`, `doc-sync`, `hygiene`, and `constraints` are the release gates.
