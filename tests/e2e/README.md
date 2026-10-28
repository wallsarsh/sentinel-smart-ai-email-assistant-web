# End-to-end suite

Runs the **built** server (`.output`) against a **real Postgres** with a **real Chromium**.

```
npm run build
E2E_DATABASE_URL=postgres://postgres:pw@127.0.0.1:5432/sentinel_e2e npm run e2e
```

The database is dropped and re-migrated at the start of every run, so point it at a scratch database.
CI runs this as the `e2e` job (Postgres service container).

## Flows

| File                              | Flow                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pg-realism.e2e.ts`               | migrations apply and re-apply; concurrent workers never claim the same job (`FOR UPDATE SKIP LOCKED`); duplicate job keys race to one; `LISTEN/NOTIFY` carries events between connections    |
| `flows.e2e.ts` first run          | signed-out visit to `/inbox` goes to `/login?next=`; sign-up lands on onboarding; onboarding resumes after reload and finishes; skipping is remembered                                       |
| `flows.e2e.ts` signing in and out | wrong password refused; session cookie is HttpOnly; sign-out ends the session; API refuses unauthenticated and CSRF-less calls; a session revoked from another browser stops working at once |
| `flows.e2e.ts` settings           | background and privacy settings are saved on the server and seen from a second browser                                                                                                       |
| `flows.e2e.ts` mail and brief     | seeded mail, triage and brief show in the UI; the brief links to the message; another user cannot read it                                                                                    |
| `flows.e2e.ts` wipe               | deleting the account removes the user and its data; signing in fails afterwards                                                                                                              |

## What is not here, and where it is covered

Connecting a mailbox, syncing, AI triage, drafting, confirming, undo and sending need a mail provider and
an AI endpoint. The server refuses private addresses for AI endpoints (SSRF guard), and a fake
Gmail/Graph/IMAP server cannot be injected into a production build without adding a test-only hook to
production code, which this project does not do. Those flows run end to end **in process with fakes**:

- `tests/send-gate/pipeline.test.ts` – hostile emails, obedient model, confirm / undo / send, exactly-once send
- `tests/unit/mail-check.test.ts`, `tests/unit/triage-service.test.ts`, `tests/unit/brief-*.test.ts`
- `tests/contract/` – the same contract suite for Gmail, Graph and IMAP providers against fake backends

Against the live providers they are checked by hand in T160.

## Pacing

The server limits sign-in/sign-up to 10 per minute per address and all tests share one address, so
`harness.ts` paces its own sign-ins under that limit instead of weakening the limit.
