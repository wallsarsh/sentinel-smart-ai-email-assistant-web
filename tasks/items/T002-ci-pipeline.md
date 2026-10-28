---
id: T002
title: "CI pipeline"
phase: P0
status: todo
owner: ""
type: config
size: S
deps: [T001]
paths: [.github/workflows/ci.yml]
refs: [WEB §11]
reqs: [NFR-MNT-02]
updated: 2026-10-28
---

# T002 — CI pipeline

## Goal
GitHub Actions: install, lint, typecheck, unit tests, build, send-gate check, audit.

## Acceptance
- [ ] CI runs on PR and main; fails on any check
- [ ] npm cache enabled
- [ ] Dependency audit step with allowlist file
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
