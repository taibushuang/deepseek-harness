---
description: "Enable durable personal tasks, their six model tools, and the right Sidebar Tasks page from the Plugins page."
kind: "package-bundle"
---

# @deepseek-ai/dsh-tasks-bundle

English | [中文](README.zh.md)

## Summary

Enable personal tasks on the Web or Desktop Plugins page. The bundle mounts the [tasks service and its six model tools](../tasks/README.md) and the [right Sidebar Tasks page](../client-ui-tasks/README.md). Tasks live in one storage domain under the Harness home, not in Session events, so they survive restarts. Shipped profiles leave the bundle disabled.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open Plugins and enable Tasks in the Official group. The bundle inserts `tasks` and `client-ui-tasks`. Disabling it removes the tools and the page and leaves stored tasks in place, so they return when it is enabled again.

Ask the model to add a task, or type a title in the right Sidebar's Tasks page. The model tools can set due dates, tags, priority, notes, and related files; the page groups open tasks by due date and completes or reopens them.

<a id="understand-the-implementation"></a>
## Understand the implementation

The bundle patch inserts the Host service and the browser panel. The Host service owns the `tasks` storage domain, the six tools, and the `tasks` Remote namespace; the panel mounts that namespace and registers the `tasks` tab type. No row writes tasks into a Session event or a managed file.

<a id="model-experience"></a>
## Model Experience

### Task tools

#### What the model sees

Six tool schemas from [tasks](../tasks/README.md#model-experience): `task_add`, `task_list`, `task_view`, `task_update`, `task_complete`, and `task_remove`. The bundle adds no prompt text of its own.

#### Token effect

Six fixed schemas on every request where the tools are visible. List results are capped by `maxList`; mutations return one task.

#### KV Cache effect

Schemas are static; results append after the reusable prefix. Enabling or disabling the bundle changes the tool set and therefore the prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Disabled by default** — the bundle must be enabled per profile.
- **No recurrence** — use `schedule` for repeating reminders.
- **One flat list** — no projects, subtasks, assignees, or completion history beyond `completedAt`.
- **Panel refresh** — another tab's changes appear after a refresh.

### Dev Note

<a id="dev-note"></a>

The bundle composes existing packages and adds no tools or storage of its own.
