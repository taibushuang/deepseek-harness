---
description: "Durable personal tasks with six model tools, a tasks Remote namespace, and a right Sidebar panel."
kind: "package-reference"
---

# @deepseek-ai/dsh-tasks

English | [中文](README.zh.md)

## Summary

Keep one personal task list across Sessions: add a task from chat, list it by status, deadline, tag, or related file, update it, complete it, reopen it, and remove the record. Tasks live in a `tasks` storage domain (JSON or SQLite through `storage-domain`), not in Session events, so they survive restarts and can be read by the [right Sidebar panel](../client-ui-tasks/README.md) and the model tools over one Remote namespace.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it after `@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-storage-domain`. The [tasks bundle](../tasks-bundle/README.md) also mounts the right Sidebar panel.

```yaml
- name: 'cordis:@deepseek-ai/dsh-tasks'
  config:
    maxTasks: 5000
    maxList: 500
```

Ask the model to add a task: "remind me to send the Q4 report next Friday, related to `~/Work/report.docx`, tag work". It calls `task_add`; `task_list` returns open tasks sorted by due date; `task_complete` marks one done. A due date is an ISO string. Tags are single words. File paths are stored for later reference and are never modified.

The model tools are `task_add`, `task_list`, `task_view`, `task_update`, `task_complete`, and `task_remove`. `task_remove` deletes only the task record, never a file. Recurring reminders are not tasks: create a `schedule` task that calls the task tools or posts a reminder.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/spec.ts` declares the `tasks` domain with one `tasks` table keyed by task id.
- `src/service.ts` owns validation, sorting, the task limit, Remote methods (`add`, `list`, `view`, `update`, `complete`, `remove`), and the six tools.
- `src/types.ts` is the shared task schema and request vocabulary; the browser imports the same types.
- `src/index.ts` exports the Cordis class plugin and its Config schema.
- The service opens the storage domain on first use and closes it with the plugin; failed opens retry on the next call.

<a id="model-experience"></a>
## Model Experience

### Task tools

#### What the model sees

Six fixed tool schemas. `task_add` takes a title and optional ISO due date, priority, file paths, tags, and notes. `task_list` filters by open/done/all, tag, file path, and limit; results are sorted open first, then due date, priority, and creation. `task_view` reads one id. `task_update` replaces only supplied fields; an empty `due_at` or `notes` clears it. `task_complete` defaults to done and `done: false` reopens. `task_remove` deletes the record and reports `removed: true`.

#### Token effect

Six schema definitions add a fixed prefix cost. A list result is capped by `maxList`; each task carries its title, dates, tags, paths, and notes, so long notes and many paths grow the result. Mutations return one task.

#### KV Cache effect

Schemas are static. Results append after the reusable prefix; completing or listing tasks does not rewrite earlier messages.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- One flat list: no projects, subtasks, dependencies, or assignees.
- Recurrence is not modeled; use `schedule` for repeating reminders.
- File paths are recorded as supplied and are not fingerprinted or followed when a file moves.
- The browser panel refreshes on open and after its own actions; another tab's changes appear after a refresh.
- Due dates are stored as ISO instants; the panel groups them in the browser's local day boundaries.
- Removing a task is final for that record; there is no recycle bin.

### Dev Note

<a id="dev-note"></a>

The service exposes the same operations to tools and Remote callers, so the panel and the model cannot drift. Task records are plain JSON and contain no absolute resource handles beyond the paths the user supplied.
