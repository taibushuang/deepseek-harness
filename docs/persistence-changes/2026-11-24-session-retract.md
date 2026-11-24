---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-24-session-retract

English | [中文](2026-11-24-session-retract.zh.md)

## Summary

Adds the session/retract log-only tombstone event and the retraction user-message source kind used by the empty developer replacement that shadows a retracted surface range.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-24-session-retract
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-11-05-timeline-priority-notice"
    after: "37b0fed74bbd2a46883dcc3c80f52494e692c6d8102f5de70559cd806c3cca4c"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-11-05-timeline-priority-notice"
    after: "d1dfc4a17a97ea922687d8643bc115bef645bdcea36131077c82dabbf058be24"
    decision: same-version
  - root: "event:session/retract"
    previous: null
    after: "43694ab4747176f29b7fee2afef1a25b3a792f988db90a824848c547b909ebf3"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-11-05-timeline-priority-notice"
    after: "6b24cebc10a7d84df170574bd21597b72820d0d62ef2c339aca4662093c981a1"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-11-05-timeline-priority-notice"
    after: "4c757c3dfe27b6763e72b44034f44072c78273d5d356c1e42ee8d14a8086732d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing events keep their schemas and meaning. New readers hide the shadowed range from model input, keep the raw events for audit, and render one tombstone. Older readers do not know session/retract, which carries no ignorable marker, so they refuse a log containing one instead of reconstructing a conversation with a silently missing tombstone. The empty developer replacement itself remains inert for readers that project empty developer content.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/api/session-controller: 1165 tests passed, including the new retract host suite for range shadowing, older-turn cuts, non-user targets, running turns, and pending queues. pnpm exec vitest run packages/client/ui-chat: 1035 tests passed, including retraction marker filtering, navigation filtering, and edit/retract actions. pnpm run build:check passed host and client aggregate checks.

<a id="dev-note"></a>
## Dev Note

None.
