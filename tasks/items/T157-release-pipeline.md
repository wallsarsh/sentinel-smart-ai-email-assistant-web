---
id: T157
title: "Release pipeline"
phase: P9
status: todo
owner: ""
type: config
size: S
deps: [T156]
paths: [.github/workflows/release.yml]
refs: [WEB §9]
reqs: [NFR-MNT-03]
updated: 2026-10-28
---

# T157 — Release pipeline

## Goal
Tagged builds: checks, image push, staging deploy, manual promotion to prod, source maps stored privately.

## Acceptance
- [ ] Rollback documented
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
