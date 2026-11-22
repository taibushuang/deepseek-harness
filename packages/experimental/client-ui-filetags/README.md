---
description: "Right Sidebar tag panel: filter tags, search by tag expression, and change a path's tags over the fileTags Remote namespace."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-filetags

English | [中文](README.zh.md)

## Summary

The right Sidebar's Tags page. It lists every tag with its path count, filters the list as the reader types, runs a tag expression such as `project and not archive`, and changes one path's tags in place. Reads and writes go over the `fileTags` Remote namespace owned by [filetags](../filetags/README.md); the panel adds no storage of its own.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Enable the [File tags bundle](../filetags-bundle/README.md) on the Web or Desktop Plugins page. The bundle mounts this panel together with the Host service and its model tools. Open the right Sidebar, choose Tags from its add menu, and select tags or type an expression.

Selecting a chip adds it to the expression; selecting another tag extends the conjunction. Typing in the expression field replaces the chip selection. Results are capped at 200 rows by the Host and are filtered locally by path. Each row lists its tags, adds tag names typed in its field, and removes a tag from its × control. The write is applied before the row and tag counts refresh; a failed write keeps the previous row and reports it.

The panel sends absolute paths to the Host only. It never opens a file; the Desktop open-in-app control is not part of this version.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/client/mount.ts` mounts the generated `fileTags` contribution with `ctx.remote.$mount`, then registers the `tags` tab type, its body seat, and eight dictionaries. `createFace` unwraps `RemoteResult` and maps invalid-argument failures to their localized message. `src/client/FiletagsBody.tsx` keeps one debounced expression query and one generation counter: a successful write bumps the counter, which reloads the tag list and repeats the current search. `src/client/presentation.ts` holds the pure derivations, including the two in-memory filters that follow the Client search rule — tag names as fuzzy keys, paths as contiguous substrings.

<a id="model-experience"></a>
## Model Experience

### Tag panel

#### What the model sees

None. The panel reads and writes tag records over the `fileTags` Remote namespace; it sends no model request and adds no Session event.

#### Token effect

Zero direct token effect. The panel changes the tag database, which later file-tag tool calls read, but it contributes no prompt or tool schema of its own.

#### KV Cache effect

Does not invalidate. The panel adds no request tokens; a Session's prompt prefix and tool schemas stay unchanged while the panel is open.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No open-in-app control** — the panel shows paths but cannot open them. `ui-open-in-app` exposes slot-scoped faces rather than a Client service, so a later change must add a shared surface before this panel can reuse it.
- **No missing-path state** — the database records a `missing` flag, but move-follow is deferred, so the panel does not label stale rows yet.
- **No virtual scrolling** — the Host caps a search at 200 rows; the list renders them all.
- **Absolute paths only** — the panel shows the stored absolute path; it does not shorten it to the Session workspace.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
