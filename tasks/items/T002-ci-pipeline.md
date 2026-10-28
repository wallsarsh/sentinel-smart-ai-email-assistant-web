---
id: T002
title: "CI pipeline"
phase: P0
status: done
owner: "claude-sonnet-5-5"
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
- [x] CI runs on PR and main; fails on any check
- [x] npm cache enabled
- [x] Dependency audit step with allowlist file
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:24Z claimed by claude-sonnet-5-5
- 2026-10-28 10:24Z CI: check, build, audit gate with expiring allowlist (npm cache on); audit gate unit-tested
- 2026-10-28 10:24Z status -> done
