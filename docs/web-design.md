# Sentinel Web: design

Sentinel Web is the browser version of the Sentinel mobile app, with **the same functionality** (see `reference/mobile-brd.md`): connect Gmail, Microsoft 365 (with MFA) and IMAP/SMTP accounts and AI providers (Claude, ChatGPT, OpenAI-compatible, bring your own key); triage, action items, daily brief, draft replies, human-approved sending, background checking with notifications.

The one structural difference is **where it runs**: on a server we operate. Section 1 lists what changes because of that; everything else is carried over from the mobile design (`reference/mobile-design.md`, referred to as MOBILE-ADD) and its algorithms are ported, not redesigned.

## 1. What changes on the web

| Mobile | Web | Consequence |
|---|---|---|
| One user per device, secrets in Keychain/Keystore | Many users, secrets on our server | Envelope encryption per user, tenant scoping everywhere, MFA, audit, GDPR export/delete (P1) |
| SQLCipher on device | PostgreSQL | Every table has `user_id`; repositories take a user id (T021) |
| OAuth with app-claimed redirects | Web OAuth with confidential clients, server callbacks | State/PKCE bound to session (T042, T043) |
| App lock, biometrics | Session + TOTP, step-up re-auth for sensitive actions | T023, T024, T105 |
| WorkManager/BGTask, no server | Worker process with a job queue | Reliable schedule; no OS limits (P7) |
| Local notifications | Web Push (VAPID) + service worker | T122 |
| Undo timer in the app | Server-side delayed submit | A closed tab cannot send early or lose the decision (T111) |
| Device wipe | Account deletion and export | T032 |
| Direct provider calls from the phone | Server calls providers | SSRF guard for user-supplied hosts (T029) |
| Mail content stays on the phone | Mail content is stored server-side (encrypted at rest at the disk/DB level, bodies as stored columns) | Retention, minimisation, privacy policy (T127, T159) |

## 2. Non-negotiables

1. **Only a human sends.** Email is sent only through `MailSender` with a single-use `SendAuthorization` from the confirmation click. AI, background jobs, triage, brief and push code cannot reach send code. `tools/send-gate-check.mjs` enforces this in CI (T012); worker containers cannot resolve it (T120).
2. **Tenant isolation.** No query without a user id; repositories only (T021). A two-user test exists for every API area.
3. **Secrets** (OAuth tokens, IMAP/SMTP passwords, AI keys) only in the secret store (envelope encryption), never in logs, never returned to the client in full.
4. **No mail content in logs, metrics, error reports or push payloads.** Push carries local ids only.
5. **Untrusted content is data.** Emails are sanitized, rendered in a sandboxed iframe under CSP, and go to the AI only through `PromptBuilder` (defanged, bounded, redacted).
6. **No model/provider literals** in code paths; routes are user configuration.
7. **Consent before AI.** No AI call without per-provider consent.

## 3. Stack and layout

- **Nuxt 3** (Vue 3 + Nitro), TypeScript strict, Pinia, Tailwind, vue-i18n, Vitest, Playwright.
- **PostgreSQL** with Drizzle ORM (SQLite for fast unit tests). Search via `tsvector`.
- **Jobs:** pg-boss queue; a separate **worker** entrypoint (`worker/`) shares `server/` code.
- **Mail libraries:** imapflow + mailparser (IMAP), nodemailer (SMTP, send module only), plain `fetch` for Gmail/Graph REST.
- **Realtime:** Server-Sent Events (inbox updates, streaming drafts).

```
server/
  api/          route handlers (thin)
  auth/ security/ audit/ middleware/
  db/ repos/    schema, migrations, tenant-scoped repositories
  mail/         provider.ts, gmail/ graph/ imap/ mime/ oauth/ sanitize/
  mail/send/    THE ONLY place that can send (gate, senders, records)
  ai/           ports, adapters, gateway, router, prompts, structured
  triage/ brief/ drafts/ sync/ push/ jobs/ http/ observability/
worker/         entrypoint, container (no send capability), jobs/
shared/         zod schemas, types, errors, link-guard, redactor, scrub
app/            pages, components, composables, i18n, sw
tests/ tools/ deploy/ docs/
```

## 4. Domain and API

Entities and failure kinds mirror MOBILE-ADD §4 and §6 (zod in `shared/`). The API is JSON over `/api`, cookie-authenticated, CSRF-protected for mutations; list endpoints use cursor pagination; errors are `{kind, code, messageKey}` (no content). Streaming uses SSE.

## 5. Data model

Tables (all with `user_id`): `users`, `sessions`, `mfa_secrets`, `recovery_codes`, `audit_log`, `accounts`, `imap_settings`, `folders`, `threads`, `messages` (sanitized HTML + text, search vector), `triage_results`, `action_items`, `sender_rules`, `draft_refs`, `send_records`, `daily_briefs`, `brief_items`, `ai_providers`, `ai_task_routes`, `usage_records`, `settings`, `push_subscriptions`, `secrets` (ciphertext), `bg_runs`. Details follow MOBILE-ADD §6.

## 6. Frontend

Mobile-first responsive layout with the same four areas (Brief, Inbox, Actions, Settings) plus search, composer and confirmation. Desktop gets a two-pane inbox. Accessibility (keyboard, axe), light/dark, 200% zoom and a PWA shell are requirements, not polish.

## 7. Key flows

- **Connect account:** OAuth code + PKCE with signed state (Google/Microsoft) or IMAP wizard with autodiscovery, tokens/passwords to the secret store, credentials tested (SMTP test never sends).
- **Sync/triage:** worker syncs by cursor, stores pages atomically, queues triage; excluded accounts and muted senders never reach the AI.
- **Draft:** SSE-streamed text into the editor; saving creates/updates a provider draft (idempotent).
- **Send:** confirmation dialog (full body viewed, flags) → authorization bound to a content hash → delayed submit with Undo → `MailSender` redeems exactly once → send record (`pending → submitting → sent | failed | unknown`), never auto-retried.
- **Background:** worker runs mail-check, brief and retention jobs per user schedule/time zone; web push with ids only.

## 8. Security

Argon2id passwords, TOTP + recovery codes, httpOnly SameSite cookies, session rotation and revocation, CSRF, rate limits, strict CSP, HSTS, SSRF guard, audit log without content, envelope encryption with KMS-held KEK and rotation, dependency audit, secrets scanning. Threat model: MOBILE-ADD §7.5 plus multi-tenant threats (IDOR, session theft, SSRF, token exfiltration, malicious HTML).

## 9. Deployment

Docker image with `app` and `worker` commands, Postgres managed service, secrets/KMS, migrations at deploy, health/readiness, backups with tested restore, staging then manual promotion.

## 10. Registrations (manual)

Google web OAuth client and restricted-scope verification (CASA); Microsoft Entra multi-tenant app, publisher verification, admin consent; domain/TLS.

## 11. Testing

Unit (Vitest), contract tests per provider, fixture-driven provider tests, recording-network send-gate tests, Playwright E2E with fake providers, axe, visual regression, AI evaluation harness (opt-in, spend-limited). Coverage gate for server domain code.

## 12. Release exit criteria

All automated suites green; send-gate traffic audit signed off; staging matrix with real Gmail, M365 (MFA) and IMAP passed; no open P1/P2 bugs; security review high findings fixed; privacy policy and provider verifications done; AI evaluation meets targets for the default models.
