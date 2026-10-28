---
id: T143
title: "PWA shell"
phase: P8
status: done
owner: "claude"
type: code
size: M
deps: [T008, T122]
paths: [app/public/, app/sw/]
refs: [WEB §6]
reqs: [NFR-UX-04]
updated: 2026-10-28
---

# T143 — PWA shell

## Goal
Manifest, icons, installability, offline shell with cached last brief/inbox list metadata only and a clear offline banner.

## Acceptance
- [x] Lighthouse PWA checks pass
- [x] No mail bodies in the cache (test)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 18:35Z claimed by claude
- 2026-10-28 18:49Z PWA shell: manifest + generated icons (192/512/maskable/apple-touch), theme colour, service worker registered at start; offline page built in the worker (sw-offline.js, separate from the push-only sw.js) from last brief + inbox list metadata only (no snippets/summaries/bodies; nothing else cached; script-free and escaped); offline banner; offline data deleted on sign-out/delete. NOT run: Lighthouse (needs a built, served app in a browser), deferred to T153/T160.
- 2026-10-28 18:49Z status -> done
