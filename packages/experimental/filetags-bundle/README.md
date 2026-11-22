---
description: "Enable central-database file tags, the four tag tools, and the right Sidebar tag panel from the Plugins page."
kind: "package-bundle"
---

# @deepseek-ai/dsh-filetags-bundle

English | [中文](README.zh.md)

## Summary

Enable file tags on the Web or Desktop Plugins page. The bundle mounts the [central tag database and its four model tools](../filetags/README.md) and the [right Sidebar tag panel](../client-ui-filetags/README.md). Tags live in one database under the Harness home, so no managed directory receives a sidecar file. Shipped profiles leave the bundle disabled.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open Plugins and enable File tags in the Official group. The bundle inserts two rows: `filetags` with the database at `$DSH_HOME/data/filetags.db`, and `client-ui-filetags` for the panel. Disabling it removes the tools and the panel and leaves the database in place, so tags return when it is enabled again.

Ask the model to tag a file or folder, for example "tag ~/notes and ~/notes/today.md with work". In the right Sidebar, open Tags and select a chip or type an expression to find them again.

<a id="understand-the-implementation"></a>
## Understand the implementation

The bundle patch inserts the Host plugin and the browser-only panel. The Host plugin owns the SQLite database, the four tools, and the `fileTags` Remote namespace; the panel mounts that namespace's generated contribution and registers the `tags` tab type. Neither row writes into the tagged directories.

<a id="model-experience"></a>
## Model Experience

### File-tag tools

#### What the model sees

The four tool schemas described in [filetags](../filetags/README.md#model-experience): `filetags_tag`, `filetags_untag`, `filetags_search`, and `filetags_list`. The bundle adds no prompt text of its own.

#### Token effect

The bundle adds the four fixed tool schemas to every request in a Session that can call tools. Search results grow with the number of matches, capped at 200 entries.

#### KV Cache effect

Does not invalidate beyond the schemas the tools already add. The bundle contributes no per-turn text; enabling or disabling it changes the tool set, which changes the prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Disabled by default** — the bundle must be enabled per profile; profiles do not select it.
- **One database per Host** — the bundle uses one fixed path, so two Hosts sharing a home would share tags only when both point at that file.
- **Moves are not followed** — a renamed or removed path keeps its row until it is untagged; the Host and panel limitations apply.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
