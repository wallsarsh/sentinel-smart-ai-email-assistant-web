---
id: T001
title: "Nuxt 3 project scaffold and tooling"
phase: P0
status: todo
owner: ""
type: code
size: M
deps: []
paths: [package.json, nuxt.config.ts, eslint.config.js, vitest.config.ts, tsconfig.json]
refs: [WEB §3, WEB §11]
reqs: [NFR-MNT-01]
updated: 2026-10-28
---

# T001 — Nuxt 3 project scaffold and tooling

## Goal
Create the Nuxt 3 (Vue 3, TypeScript strict) app with Nitro server, Pinia, Tailwind, ESLint, Prettier, Vitest and the `npm run check` script.

## Acceptance
- [ ] `npm run dev`, `build`, `check` (lint + typecheck + test) work from a clean clone
- [ ] Folder layout matches WEB §3 (`server/`, `app/`, `shared/`, `tests/`)
- [ ] Node version pinned (`.nvmrc`, `engines`)
- [ ] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
