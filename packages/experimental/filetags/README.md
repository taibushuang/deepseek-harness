---
description: "Central-database tags for files and directories anywhere on the machine, with tag-expression search as model tools."
kind: "package-reference"
---

# @deepseek-ai/dsh-filetags

English | [中文](README.zh.md)

## Summary

Attach tags to files and directories anywhere on this machine and find them again by tag expression, such as `project and not archive`. Tags live in one central SQLite database under the Harness data directory, so no sidecar file is written next to any managed path. Four model tools expose the store: `filetags_tag`, `filetags_untag`, `filetags_search`, and `filetags_list`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin in a `cordis.yml` after `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-tool-executor-native`, and `@deepseek-ai/dsh-system-prompt`. The plugin needs `ctx.tools`.

```yaml
- name: 'cordis:@deepseek-ai/dsh-filetags'
  config:
    path: '/Users/me/.dsh/data/filetags.db'
```

`path` is the database file. The default is `filetags.db` under the `data` category of the Harness home. The file and its directory are created owner-only on first use. Turning the plugin off removes the four tools and leaves the database in place.

Paths passed to the tools must be absolute. A tag is one word without whitespace or parentheses; `and`, `or`, and `not` are reserved for expressions. Tags are created on first use and deleted when their last path is untagged.

<a id="understand-the-implementation"></a>
## Understand the implementation

The database has three tables: `tags`, `entries` keyed by absolute path with the type, size, and modification time observed when tagged, and `entry_tags` linking the two. `src/schema.ts` opens the database with `PRAGMA user_version`; any other stored version is rejected rather than migrated. `src/query.ts` parses an expression with the precedence `not`, then `and`, then `or`, and compiles it to a boolean over `entries` whose tag names are bound parameters. `src/store.ts` owns writes; each tag or untag call runs in one `BEGIN IMMEDIATE` transaction, and untag removes entries and tags left without links.

Search results are capped at 200 entries sorted by path. A path that is moved or deleted keeps its row; the store does not yet follow moves.

<a id="model-experience"></a>
## Model Experience

### Request context and condition

#### What the model sees

The four tool schemas and their descriptions are sent whenever the plugin is mounted. Each tool returns a JSON object: `tagged` or `removed` counts, `entries` for search, and `tags` or `entry` for list.

#### Token effect

The four schemas are a fixed addition to the tool list. A search returns at most 200 entries, each with a path and tag names, so its result size grows with the number of matches. Tag and untag results are a single count.

#### KV Cache effect

The tool schemas are fixed for the lifetime of a Session, so they form a stable prefix. Each call and result is appended to the Session log; no earlier request tokens are replaced. Changing the set of mounted tools invalidates reuse of that prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Moves and deletions are not followed** — a tagged path that is renamed or removed keeps its row until it is untagged, so search can return paths that no longer exist. Move-follow by fingerprint is deferred.
- **No `tag=value` pairs** — tags are plain names. Values, implications, and saved queries are not modeled.
- **Case-sensitive tag names** — `Project` and `project` are different tags.
- **No Client UI** — the tools are the only surface; no browsing panel exists yet.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
