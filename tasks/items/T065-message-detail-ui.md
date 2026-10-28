---
id: T065
title: "Message detail UI"
phase: P3
status: done
owner: "claude"
type: code
size: L
deps: [T062, T027, T028]
paths: [app/pages/inbox/[id].vue, app/components/message/]
refs: [MOBILE-ADD §10.2]
reqs: [FR-READ-06]
updated: 2026-10-28
---

# T065 — Message detail UI

## Goal
Thread view, sandboxed sanitized HTML (iframe sandbox + CSP), load-images opt-in, link guard dialog, attachments list (metadata only), AI card slot.

## Acceptance
- [x] XSS corpus renders inert in the browser test
- [x] Images blocked by default
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 13:34Z claimed by claude
- 2026-10-28 13:42Z Message detail: thread cards, sandboxed iframe (allow-scripts, opaque origin) with hash-only CSP and iframe csp attr, images blocked until per-message opt-in (https only), link guard dialog via postMessage, attachment names only, AI slot. Chromium tests: 19-payload XSS corpus inert sanitized AND raw, no external requests. Client code imports shared/ via #shared
- 2026-10-28 13:42Z status -> done
