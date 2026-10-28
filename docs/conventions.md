# Conventions

1. TypeScript strict, no `any` without a comment. Zod at every boundary.
2. Routes are thin; logic lives in `server/<area>/` and repositories.
3. Every repository method takes `userId` first.
4. No `process.env` outside `server/config/`.
5. Errors are `Result`/`AppFailure`, never strings; messages are i18n keys.
6. Never log mail content, addresses, tokens or keys; use the logger's allow-listed fields.
7. Prompts and schemas live only in `server/ai/prompts/` and carry a version.
8. Commits: `feat(area): summary (T###)`; one task per commit where possible.
9. Tests live beside the layer they test under `tests/`; fixtures under `tests/fixtures/`.
10. **Definition of Done:** acceptance boxes ticked; tests added; `npm run check` green (lint, typecheck, tests, `tools/send-gate-check.mjs`); no new dependency without a line in the task log; task log updated; INDEX regenerated.
