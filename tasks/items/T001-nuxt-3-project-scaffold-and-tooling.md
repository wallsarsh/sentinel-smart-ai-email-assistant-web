---
id: T001
title: "Nuxt 3 project scaffold and tooling"
phase: P0
status: done
owner: "claude-sonnet-5-5"
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
- [x] `npm run dev`, `build`, `check` (lint + typecheck + test) work from a clean clone
- [x] Folder layout matches WEB §3 (`server/`, `app/`, `shared/`, `tests/`)
- [x] Node version pinned (`.nvmrc`, `engines`)
- [x] Definition of Done met (CONV §10): tests added, `npm run check` (lint, typecheck, test) green, send-gate check passes

## Log
- 2026-10-28 10:21Z claimed by claude-sonnet-5-5
- 2026-10-28 10:23Z Nuxt 4 (Vue 3, Nitro) scaffold: pinia, tailwind, eslint, prettier, vitest, strict TS; check/build verified; /api/health serves
- 2026-10-28 10:23Z status -> done
