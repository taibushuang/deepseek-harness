# File tags, organization, and tasks

English | [中文](office-assistant.zh.md)

## Summary

The optional office-assistant pieces add a central tag database, a rule-driven folder organizer, a confirmation card, durable personal tasks, and a legacy TagSpaces importer. Tags and tasks live in Harness data, never in sidecar files inside a managed directory. Shipped profiles keep these experimental bundles disabled; enable them from Plugins.

## Table of Contents

- [Enable the pieces](#enable)
- [Tag files and folders](#tags)
- [Organize an inbox](#organize)
- [Confirm from chat](#confirm)
- [Run an inbox pass on a schedule](#schedule-pass)
- [Track personal tasks](#tasks)
- [Import old TagSpaces data](#import)
- [Edit or retract a sent message](#retract)
- [Current boundaries](#boundaries)
- [Further Exploration](#further-exploration)

<a id="enable"></a>
## Enable the pieces

Open **Plugins** and enable **File tags** and **Tasks** in the Official group. File tags mounts the tag database, its tools, the right Sidebar tag panel, the organizer, its confirmation card, and Office/PDF text reading. Tasks mounts the task service, six task tools, and the right Sidebar Tasks page.

Both bundles write to the Harness home, not to the folders you manage. Disabling a bundle removes its tools and panels and leaves the stored data in place.

<a id="tags"></a>
## Tag files and folders

Ask the model to tag a path, or use the right Sidebar Tags page. Tags are one-word names; `and`, `or`, and `not` are reserved for expressions. A tag can be attached to a directory as well as a file. Search accepts an expression such as `project and not archive`.

The four basic tools are `filetags_tag`, `filetags_untag`, `filetags_search`, and `filetags_list`. The fifth, `filetags_import`, is described below.

<a id="organize"></a>
## Organize an inbox

Ask the model to sort an inbox, for example:

> Preview moving files from `~/Inbox` into `~/Documents/Library`: PDFs to Contracts with tag contract, spreadsheets to Sheets with tag finance, and everything else to Unsorted with tag triage.

The model calls `organize_preview` with `destination_root`, ordered `rules`, `others_target`, and optional tags. The preview lists every move and every skip. Nothing moves until `organize_apply`. Moves never overwrite an existing destination; a conflict is reported and left in place. `organize_undo` reverses a completed batch, and `organize_history` lists recent batches after a restart.

<a id="confirm"></a>
## Confirm from chat

When the organizer and action cards are mounted, a previewed batch can appear as a card below the answer. **Apply** runs the batch, **Cancel** leaves the files alone, and **Undo** reverses a completed batch. Scheduled or headless runs call the tools directly instead.

<a id="schedule-pass"></a>
## Run an inbox pass on a schedule

There is no separate watcher or scheduler. Use the existing Schedule tools: create a task whose instruction runs `organize_preview`, then `organize_apply`, and reports moved, skipped, and failed files. A weekday 09:00 rule is a common choice. A missed occurrence is caught up with the latest one.

<a id="tasks"></a>
## Track personal tasks

Ask the model to add a task, for example:

> Remind me to send the Q4 report next Friday. It relates to `~/Work/report.docx`, tag it work, priority high.

The model uses `task_add`; `task_list` filters by open/done/all, tag, file path, and limit; `task_update` changes fields; `task_complete` completes or reopens; `task_remove` deletes only the record. The right Sidebar Tasks page groups open tasks into Overdue, Today, This week, and Later, keeps completed tasks in Done, and supports quick add and completion.

Tasks are not repeating reminders. For recurrence, create a Schedule task that calls the task tools or posts a reminder.

<a id="import"></a>
## Import old TagSpaces data

`filetags_import` reads a legacy TagSpaces library without modifying it. It understands `.ts/tsi.json` tag records and `[tag another]` groups in file names. Call it with `confirm: false` first to see scanned files, tags, and sample entries; call again with `confirm: true` to write only the central tag database. It does not import thumbnails, history, colors, or multi-word tags, and it does not rename files.

<a id="retract"></a>
## Edit or retract a sent message

A completed user message offers **Edit** and **Retract** on hover. Either action hides that message, its answer, and every later turn from the model context and the transcript, and leaves one "message retracted" marker. Edit puts the original text back in the composer; sending starts a new turn. The raw Session log keeps the original events for audit, so this is not secure deletion, and tool side effects already produced are not undone.

<a id="boundaries"></a>
## Current boundaries

- Tags are central; a moved file is not followed yet. Use `filetags_tag` on the new path if you move a tagged file outside the organizer.
- Organizer rules use paths and file names, not folder tags.
- Tasks are one flat list: no projects, subtasks, assignees, or recurrence.
- File links on tasks are references; the panel does not follow moves.
- Retraction restores text only, not attachments, and is not a secure erase.
- The task and tag panels refresh on open and after their own actions.

<a id="further-exploration"></a>
## Further Exploration

- [filetags package](../../../packages/experimental/filetags/README.md)
- [file-organizer package](../../../packages/experimental/file-organizer/README.md)
- [tasks package](../../../packages/experimental/tasks/README.md)
- [tasks panel](../../../packages/experimental/client-ui-tasks/README.md)
- [Schedule reminders](schedule.md)
