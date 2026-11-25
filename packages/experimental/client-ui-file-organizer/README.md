---
description: "Browser body for file-organizer action cards: apply or undo a previewed organization batch from chat."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-file-organizer

English | [中文](README.zh.md)

## Summary

The browser half of the `organize_files` action card. After `organize_preview` plans a batch, the assistant can offer a card that shows the directory and move counts with **Apply**, **Undo**, and **Cancel** controls. The body sends the chosen verb to the Host kind owned by [file-organizer](../file-organizer/README.md); that kind calls the existing no-overwrite apply/undo service. The body adds no storage and no file operation of its own.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it beside `@deepseek-ai/dsh-action-cards`, `@deepseek-ai/dsh-client-ui-action-cards`, and `@deepseek-ai/dsh-file-organizer`. The [filetags bundle](../filetags-bundle/README.md) already composes them. Open Plugins and enable File tags.

Ask the model to organize an inbox. After it previews the plan, the card appears below the answer; **Apply** moves the files, **Cancel** leaves them in place, and **Undo** reverses a completed batch. The card never overwrites a destination and never runs before the click.

<a id="understand-the-implementation"></a>
## Understand the implementation

- `src/client/Card.tsx` validates the card's `details` with zod, renders the summary and controls, and maps Host phases (`applied`, `partial`, `undone`, `undoPartial`, `failed`) to localized status.
- `src/client/mount.ts` registers the body for action `organize_files` and its eight-language copy; unloading the plugin removes both.
- The Host kind in [file-organizer](../file-organizer/README.md) performs the apply/undo and records the phase through `actionCards.record`.
- The shared frame in `client-ui-action-cards` hides the answer's `action-card` block and supplies the action dispatch.

<a id="model-experience"></a>
## Model Experience

### Organization card

#### What the model sees

The body adds no request content. The model sees the `action-card` block it wrote in its own answer and, after a click, the action-cards status notice. The Host kind owns both the decision phases and their guidance.

#### Token effect

No fixed schema or prompt text. The card block is ordinary answer text, and the body adds no tokens.

#### KV Cache effect

None. Rendering, folding, and clicking the card do not change the request prefix; only the later action-cards status notice appends new context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The model must emit the `action-card` block; a malformed or omitted block offers no card. Use `organize_apply` directly for scheduled runs.
- One card is offered per turn. A later card replaces an unstarted earlier card.
- The body shows counts and the directory, not the full move list; the assistant's preview above the card carries the details.
- The body is browser-only; headless and CLI runs use the model tools.

### Dev Note

<a id="dev-note"></a>

The body deliberately calls no Remote of its own: it uses the shared action-card `act` callback, so access checks, live-root checks, and decision recording stay in one place.
