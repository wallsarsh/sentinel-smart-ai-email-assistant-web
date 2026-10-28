# Sentinel Web Implementation Tracker

Sentinel Web's implementation is split into **111 small, atomic tasks** in 10 phases. Each task is one file in `tasks/items/`, with its dependencies, the exact doc sections to read, the paths it touches, and checkable acceptance criteria. Agents can work on a task with very little context: **read one task file plus its `refs`, not the whole doc set.**

- **Live view:** [`INDEX.md`](INDEX.md) (generated: progress, dependency graph, per-phase tables)
- **CLI:** `python3 tasks/tools/taskctl.py <command>` (Python 3.9+, stdlib only)

## Phases

| Phase | Theme | Milestone |
|---|---|---|
| P0 | Bootstrap: Nuxt project, CI, config, shell, provider registrations | M0 |
| P1 | Core platform: DB, auth + MFA, envelope-encrypted secrets, security middleware, sanitizer, jobs, SSE | M0 |
| P2 | Mail accounts: Google/Microsoft OAuth, Gmail, Graph, IMAP/SMTP providers, account UI | M1 |
| P3 | Sync, inbox, search, message detail | M1 |
| P4 | AI providers, gateway, router, prompts, configuration UI | M1 |
| P5 | Triage and action items | M1/M2 |
| P6 | Drafts and human-approved sending (send gate) | M2 |
| P7 | Background worker, web push, daily brief | M2 |
| P8 | Onboarding, settings, PWA | M2 |
| P9 | Hardening, deployment, release | M3 |

Phases group related work; **dependencies, not phases, decide what can start.**

## Task file format

```markdown
---
id: T045
title: "GraphMailProvider: read and sync"
phase: P2
status: todo            # todo | in_progress | review | done | blocked
owner: ""               # agent/session or person currently holding it
type: code              # code | test | config | docs | manual
size: L                 # S ≈ ≤ half day, M ≈ 1 day, L ≈ 2–3 days (human-equivalent)
deps: [T044, T023]      # must all be done before claiming
paths: [server/mail/graph/graph-mail-provider.ts]   # expected write scope
refs: [MOBILE-ADD §4.1, MOBILE-ADD §4.4, WEB §7] # read ONLY these
reqs: [FR-ACC-02, FR-READ-03]                             # requirement traceability
updated: 2026-10-27
---
# T045 — …
## Goal
## Acceptance        ← "- [ ]" items; all must be "- [x]" before done
## Log               ← append-only progress notes (taskctl log)
```

### Reference abbreviations (`refs`)

| Abbrev | File |
|---|---|
| WEB | `docs/web-design.md` (the web app's design; start here) |
| CONV | `docs/conventions.md` |
| MOBILE-BRD | `docs/reference/mobile-brd.md` (requirements shared with the mobile app) |
| MOBILE-ADD | `docs/reference/mobile-design.md` (mobile design: algorithms, state machines, UI specs) |
| PROMPTS | `docs/reference/ai-prompts.md` |
| MOBILE-TEST | `docs/reference/mobile-test-strategy.md` |

Read the named **section** only (e.g. `grep -n "^### 4.3" docs/02-application-design.md` then read from that line to the next heading).

## Agent protocol

### 1. Pick
```bash
git pull --rebase
python3 tasks/tools/taskctl.py ready            # or: ready --phase P2 / next
python3 tasks/tools/taskctl.py show T045
python3 tasks/tools/taskctl.py deps T045        # optional: see the upstream chain
```
Prefer tasks on the critical path (T001 → T005 → T020 → T022/T023 → providers → T091 → T101/T105 → T110/T111 → T150) and avoid tasks whose `paths` overlap something another agent has `in_progress`.

### 2. Claim (one task at a time per agent)
```bash
python3 tasks/tools/taskctl.py claim T045 --owner "<agent-or-session-id>"
python3 tasks/tools/taskctl.py index
git add tasks/ && git commit -m "tasks: claim T045" && git push
```
If the push is rejected, `git pull --rebase`. If someone else claimed the same task first (conflict in that task file, or `status` no longer `todo`), drop your claim (`git checkout --theirs` that file) and pick another task. **The task file on the remote is the lock.**

### 3. Execute
- Toolchain: Node per `.nvmrc`; `npm ci`. Drizzle migrations are generated with `npm run db:generate` and committed.
- Read only the task's `refs` plus the files under its `paths`.
- Stay inside `paths`. If the task really needs more, log it (`taskctl log T045 "also touched X because …"`).
- Follow the non-negotiables in `docs/web-design.md` §2 (send gate, secrets, no content in logs, tenant scoping, no model literals).
- Run the repo's checks before finishing: `npm run check` (lint, typecheck, tests, send-gate).
- Log meaningful progress: `taskctl log T045 "delta sync done; drafts next"`.

### 4. Finish
- Tick each acceptance item (`- [ ]` → `- [x]`) in the task file, only when it's actually true.
- `taskctl status T045 review` if a human/agent review is needed (manual tasks, anything under `server/mail/send/` or `server/security/`), otherwise `taskctl status T045 done`.
- `taskctl index`, then commit code + task file + INDEX.md together: `git commit -m "feat(graph): read & sync provider (T045)"`, push.
- `done` is refused while acceptance boxes are unticked (use `--force --note "why"` only for a recorded, agreed exception).

### 5. Blocked
```bash
python3 tasks/tools/taskctl.py status T045 blocked --note "Graph delta 410 handling needs decision: …"
```
Then pick another task. Unblock with `status T045 todo` (owner is cleared) or back to `in_progress`.

### 6. Changing the plan
- New work found? Add a new file `tasks/items/T###-slug.md` with the next free id (search `ls tasks/items`) and the correct `deps`. Don't renumber existing tasks.
- Splitting a task: create the new tasks, make the original depend on them (or mark it done with a note pointing to them).
- Always run `taskctl validate` (checks unknown deps, cycles, statuses, and that nothing is in progress/done before its deps) and `taskctl index` before committing.

## Orchestrating sub-agents

A coordinator agent can fan out work safely:

1. `taskctl ready` → pick up to N tasks whose `paths` don't overlap.
2. Claim them all (one commit), push.
3. Give each sub-agent **only**: the task id, the instruction "follow tasks/README.md §3–§4", and the branch to work on. The task file says what to read.
4. Each sub-agent works on its own branch/worktree (`feat/T045-graph-read`), ticks acceptance, sets status, regenerates the index, and opens a PR (or reports back).
5. After merging, the coordinator runs `taskctl validate && taskctl index` on main and repeats.

Manual tasks (`type: manual`, e.g. app registrations, verification, pen test) need a person; agents should not claim them, but may prepare checklists in the log.

## Status meanings

| Status | Meaning |
|---|---|
| ⬜ `todo` | Not started; claimable when all deps are `done` |
| 🔄 `in_progress` | Claimed by `owner`; only the owner updates it |
| 👀 `review` | Work complete, awaiting review; deps of others are **not** unblocked until `done` |
| ✅ `done` | Merged to the main branch with all acceptance criteria ticked |
| ⛔ `blocked` | Waiting on a decision or external input; see the latest log note |
