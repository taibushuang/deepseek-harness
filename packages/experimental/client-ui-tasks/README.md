---
description: "Right Sidebar task page: due-date groups, quick add, complete/reopen, and remove over the tasks Remote namespace."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-tasks

English | [中文](README.zh.md)

## Summary

The right Sidebar's Tasks page. It lists open tasks in **Overdue**, **Today**, **This week**, and **Later** groups, keeps completed tasks in **Done**, and adds a title from a quick input. A checkbox completes or reopens a task; the remove button deletes only the task record. All reads and writes go over the `tasks` Remote namespace owned by [tasks](../tasks/README.md).

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it beside `@deepseek-ai/dsh-tasks`. The [tasks bundle](../tasks-bundle/README.md) composes both. Open Plugins and enable Tasks; the panel appears in the right Sidebar, and the model tools are available in every conversation.

Type a title and press **Add** for a quick task; use chat when you need a due date, tags, priority, notes, or related files. The panel refreshes on open and after its own actions.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/client/mount.ts` mounts the generated `tasks` Remote, registers the `tasks` tab type, dictionaries, and the panel body.
- `src/client/TaskPanel.tsx` groups tasks in the browser's local day boundaries, renders the quick-add form, and sends complete/remove calls.
- `src/client/face.ts` unwraps Remote results into the operations the panel calls.
- The Host service in [tasks](../tasks/README.md) owns storage, validation, sorting, and the model tools.

<a id="model-experience"></a>
## Model Experience

### Task panel

#### What the model sees

No prompt or schema is added by the panel. The model sees the `task_*` tools owned by [tasks](../tasks/README.md); panel actions do not enter model context by themselves.

#### Token effect

None. Panel rendering, grouping, and quick add do not add request tokens.

#### KV Cache effect

None. The panel reads and writes through the Remote namespace without changing the request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Quick add sets only a title; due dates, tags, priority, notes, and file links come from chat tools.
- The panel refreshes on open and after its own actions; another tab's changes appear after a refresh.
- The panel shows a due date and tag line, not the full notes or file list; use `task_view` or chat for details.
- Deleting a task removes its record immediately; there is no undo.
- Browser-only: headless runs use the model tools.

### Dev Note

<a id="dev-note"></a>

The panel intentionally keeps no local task store: the Remote namespace is the single source, so a restart, refresh, or another client sees the same records.
