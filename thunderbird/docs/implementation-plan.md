# Thunderbird extension — implementation plan

This plan turns `requirements.md` into the tracked tasks `T162–T174` (phase P10 in `tasks/INDEX.md`). Each task is one commit-sized change with its own acceptance checks.

## 1. Architecture

```
Thunderbird UI (popup / dashboard / brief / options)
        │ runtime messages + storage.onChanged
        ▼
Background event page
  ├─ scheduler (alarms: monitor every N min, brief at hour)
  ├─ monitor.run() ── rules.preFilter ── analysis (prompt + core adapter)
  │        ├─ cache.set + tags
  │        ├─ drafts.maybeCreate() ── reply index ── compose.saveMessage
  │        └─ brief.refresh() ── core runBrief
  ├─ message handlers (refresh, draft, rule, calendar, open dashboard)
  └─ notifications (content-free)
        │
        ▼
browser.storage.local (settings, rules, analyses, brief, draft log)
        │
        ▼
@sentinel/core: PromptBuilder, OpenAI adapter, structured repair, redaction, priority, brief
```

Thunderbird APIs are behind small seams in `mail.js`/`background.js`, so pure modules (`rules`, `config`, `drafts`, `calendar`, `monitor`, `brief`) run under Vitest with fakes.

## 2. Modules

| Module | Responsibility | Tests |
|---|---|---|
| `thunderbird/src/config.js` | Defaults, validation, legacy migration, normalising settings and rules. | `thunderbird.config` |
| `thunderbird/src/rules.js` | Sender-rule matching/precedence, local pre-filter, local analysis, draft eligibility policy. | `thunderbird.rules` |
| `thunderbird/src/prompts.js` | Thunderbird `assistant.v1` system prompt + schema (intent, reply intent, calendar candidates). | `thunderbird.analysis` |
| `thunderbird/src/ai.js` | Provider construction, `analyzeBatch` with extended schema, draft and brief ask seams. | `thunderbird.analysis` |
| `thunderbird/src/store.js` | Storage keys, typed getters/setters, cache pruning, draft log cap. | `thunderbird.store` |
| `thunderbird/src/monitor.js` | Incremental collection, batching, cost caps, status, brief trigger, draft trigger. | `thunderbird.monitor` |
| `thunderbird/src/drafts.js` | Eligibility, reply/draft index matching, draft request, save adapter. | `thunderbird.drafts` |
| `thunderbird/src/calendar.js` | Candidate normalisation, ICS serialisation, download adapter. | `thunderbird.calendar` |
| `thunderbird/src/brief.js` | Daily window, hourly refresh policy, cached analysis reuse, brief assembly. | extends existing brief tests |
| `thunderbird/src/tags.js` | Best-effort Thunderbird tag mapping. | `thunderbird.tags` |
| `thunderbird/src/tones.js` | Compose tone presets (Standard…Persuasive) mapped to core tones/instructions. | `thunderbird.ui` |
| `thunderbird/src/compose.*` | Reply-compose action: tone picker, instruction, generate above the quote. | `thunderbird.ui` + manual |
| `thunderbird/src/ui.js` | Safe DOM primitives, labels, relative time, chips. | `thunderbird.ui` |
| `thunderbird/src/theme.css` | Design tokens, layout, cards, chips, tabs, forms, dark mode, reduced motion. | visual/manual |
| `thunderbird/src/dashboard.*` | Brief/Inbox/Drafts/Senders/Settings views. | `thunderbird.ui` + manual |
| `thunderbird/src/popup.*` | Current-message analysis, draft, calendar, sender shortcuts. | `thunderbird.ui` + manual |
| `thunderbird/src/brief.*` | Quick brief popup. | existing tests |
| `thunderbird/src/options.*` | Provider configuration and link to dashboard. | `thunderbird.config` |

## 3. Task graph

| Task | Title | Depends on | Paths |
|---|---|---|---|
| T162 | Requirements and UX specification | — | `thunderbird/docs/` |
| T163 | Reusable assistant domain modules | T162 | `thunderbird/src/{config,rules,store,ui}.js`, tests |
| T164 | Extended message analysis (intent, actions, calendar) | T163 | `thunderbird/src/{prompts,ai}.js`, tests |
| T165 | Background inbox monitor and run status | T164 | `thunderbird/src/{monitor,background,mail,tags}.js` |
| T166 | Reply detection and reviewable auto-drafts | T164 | `thunderbird/src/{drafts,background}.js` |
| T167 | Calendar candidates and ICS export | T164 | `thunderbird/src/{calendar,background}.js` |
| T168 | Hourly daily-brief refresh | T165 | `thunderbird/src/{brief,brief-view,background}.js` |
| T169 | Dashboard shell and five views | T165–T168 | `thunderbird/src/{dashboard.*,theme.css}`, build |
| T170 | Message popup redesign and sender shortcuts | T166–T167 | `thunderbird/src/{popup.*,ui.js}` |
| T171 | Options page and provider flow | T163 | `thunderbird/src/options.*` |
| T172 | Design-system and accessibility polish | T169–T171 | `thunderbird/src/{theme.css,*.html}` |
| T173 | Manifest, build, docs and automated smoke | T169–T172 | `manifest.json`, `README.md`, `tools/build-extension.mjs`, tests |
| T174 | Real-Thunderbird validation matrix | T173 | manual only |
| T175 | Dashboard URL, IMAP draft identity and compose tones | T173 | `compose.*`, `tones.js`, `drafts.js`, `ui.js`, manifest, build, tests |

Critical path: T162 → T163 → T164 → T165 → T168 → T169 → T172 → T173 → T174.

## 4. Test strategy

1. **Pure unit tests (Vitest, Node):** rules precedence, local pre-filter, settings migration, monitor batching/caps/cache reuse, draft eligibility and reply matching, ICS output, brief window, DOM-free UI labels/helpers.
2. **Fake-provider tests:** extended analysis prompt, schema repair, intent fallback, brief reuse. Prompt text assertions prove bodies/attachments stay out.
3. **Static extension tests:** manifest permissions (no send), built bundle has no `eval`/Node imports, every HTML/JS entry exists, all pages use the shared stylesheet.
4. **DOM tests (happy-dom):** render brief/inbox/draft/sender lists with hostile strings, assert they are text (no script execution) and that status/error regions are announced.
5. **Manual (T174):** load in Thunderbird 140+, real IMAP/Gmail/Microsoft account, two devices, real provider key, check draft sync, already-replied detection, calendar `.ics`, alarms after sleep/wake, 200% zoom and dark mode.

The existing `tests/unit/thunderbird-spike.test.ts` remains the regression suite; new tests are added beside it.

## 5. Cost and safety guardrails

- Pre-filter before AI; sender ignore/marketing runs locally.
- 8 messages per call, sequential batches, `maxAiMessagesPerRun` default 40, `maxMessagesPerRun` default 80.
- Analysis cache is the source of truth; popup/brief/monitor never re-buy the same analysis.
- Brief reuses summaries; bodies never go to the brief.
- Drafts capped at 3 per run, only P1/P2, only unreplied, never sent.
- Calendar writes only after a click; `.ics` export is local.
- No mail content in notifications or logs.

## 6. Rollout and compatibility

- Feature-detect: `messages.saveMessage` (TB 153+), `compose.saveMessage` (TB 102+), `messages.tags` (TB 121+), `messages.onNewMailReceived` (TB 75+), `downloads`.
- If tags or native draft save are unavailable, the run still succeeds and the UI reports the degraded capability.
- Storage migration keeps existing `settings`/`briefSettings` and triage cache; no data loss on upgrade.
- Build with `npm run ext:build`; dist is committed for reviewers.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Thunderbird event page unloads during long AI runs | Save after each batch; alarm re-runs remaining work; bounded batches. |
| Calendar WebExtension API is experimental | Ship `.ics` export; isolate behind `calendar.js` adapter. |
| Background auto-drafts surprise users | Off-by-default? No: on for P1/P2 only, capped, listed, and clearly explained; user can disable. |
| Duplicate drafts across devices | Reply index checks Sent + Drafts before creating; local idempotency key. |
| Token cost | Rules, caps, cache, summary-only brief. |
| Provider compatibility | Existing structured-output ladder + repair turn from `@sentinel/core`. |

## 8. Definition of done

- Every acceptance item in T162–T173 ticked and evidenced in the task log.
- `npm run ext:build` succeeds; built bundle committed.
- Targeted Vitest suites green (`tests/unit/thunderbird-*`).
- `npm run send-gate` green; manifest has no send permission.
- README updated with setup, behaviour and limitations.
- T174 remains open until a real Thunderbird run records the matrix.

## 9. Status at handoff (2026-11-02)

T162–T173 are implemented and their acceptance boxes are ticked. T175 fixes the three issues found in the first real-client test (dashboard path, draft identity/folder, compose tone action). The automated evidence is:

```sh
npx vitest run tests/unit/thunderbird-spike.test.ts tests/unit/thunderbird-assistant.test.ts tests/unit/thunderbird-ui.test.ts
npm run ext:build
npm run send-gate
npm run lint
```

T174 is the only open Thunderbird task. It is `type: manual` and needs a real Thunderbird profile, one IMAP account, one OAuth account, a real provider key and two devices. The remaining work for the next session is that matrix — not new feature code. If a matrix row fails, add a new atomic task under P10 rather than reopening T174's scope.

