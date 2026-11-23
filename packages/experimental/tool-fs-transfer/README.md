---
description: "Byte-exact file copy and move tools with no-overwrite guards and sandbox escalation."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-fs-transfer

English | [中文](README.zh.md)

## Summary

Two model tools for file governance: `fs_copy` copies one file byte for byte, and `fs_move` moves it without decoding. Both refuse an existing destination, create missing parent directories, and carry Office documents, images, and other binaries that the text read/write tools cannot handle. The tools run over `ctx.fs.transferFile`, so sandbox policy, Windows DACL preservation, and atomic publication stay with the filesystem provider.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin after `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-system-prompt`, a filesystem provider, and `@deepseek-ai/dsh-working-directory`:

```yaml
- name: 'cordis:@deepseek-ai/dsh-tool-fs-transfer'
```

Ask the model to sort a file, for example "move `~/Downloads/report.docx` to `~/Work/CRM升级/`, creating the folder". Relative paths resolve from the Session directory. The destination must not exist; a conflicting name fails with `FS_ALREADY_EXISTS`, so the model picks another name instead of overwriting.

A move publishes the destination first. A same-volume move links the source to the destination and then removes the source, so the destination is never partial; a volume that cannot hard-link falls back to an atomic byte copy plus removal. If publication succeeds but removal fails, the result reports `sourceDeleted: false` with the failure and both files remain.

Under a confining filesystem the tools advertise `sandbox_permissions` and `justification`, using the same approval sequence as `write`, `edit`, `apply_patch`, and the shell tools. A denial carries the shared `[sandbox: …]` marker and the escalation hint.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/transfer.ts` owns schemas, argument checks, Session-directory resolution, result rendering, and the `createIfAbsent` destination guard. The provider side is `FileSystem.transferFile`: `fs-local` stages a byte copy through an owner-only sibling directory and publishes it with a no-replace hard link (or `COPYFILE_EXCL` on volumes without links), preserving the source mode and a replaced Windows destination's DACL. `fs-sandbox` fences both paths through the same per-call policy as the other mutations.

`src/sandbox.ts` binds the public sandbox vocabulary — advertised targets, strict-wider check, approval, denial marker — for these two tools. It mirrors the controller inside `tool-fs` because that class is not a public export; the shared behavior stays in `@deepseek-ai/dsh-sandbox`.

<a id="model-experience"></a>
## Model Experience

### Transfer tools

#### What the model sees

Two fixed tool schemas: `fs_copy` copies a file whose destination must not exist, and `fs_move` moves a file and reports whether the source was removed. Each result is one text block with the canonical destination, the operation, the byte size, and — for a move that retained its source — a warning with the failure code and message.

#### Token effect

Two fixed schemas join every request in a Session that can call them. Results are a path, an operation, a size, and at most one warning line; no file content is echoed.

#### KV Cache effect

The schemas are fixed for the lifetime of a Session and form a stable prefix. Calls append results to the Session log; no earlier request tokens are replaced. Mounting or unmounting the plugin changes the tool set and therefore the prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One file per call** — directories, recursive trees, and glob batches are not transferred; the model loops over paths.
- **No overwrite or replace** — every call requires an absent destination. Replacing an observed version exists in the provider but is not exposed, so an update uses a new name or a manual step.
- **Local provider only** — `transferFile` has no SSH implementation; remote filesystems report `FS_IO_ERROR` instead of copying.
- **No delete or rename** — moving to a new name is a move; removing files, including cleanup of superseded versions, stays outside the model tools.
- **Escalation asks once per call** — a wider retry needs `sandbox_permissions` plus `justification` and an approval service with a calling Agent, exactly like the other mutating tools.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The sandbox controller is duplicated from `packages/fs/tool-fs/src/sandbox.ts` because that module is internal and the plugin entry may export only the Loader contract. Keep both in step when the advertised targets, approval request, or denial text changes; the shared functions live in `@deepseek-ai/dsh-sandbox`.

</details>
