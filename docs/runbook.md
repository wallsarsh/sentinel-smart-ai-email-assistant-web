# Runbook

For whoever is on call. Deploying and rolling back are in `release.md` and `deployment.md`; signals are in `observability.md`.

## What runs

| Part                     | What it does                                                    | If it is down                                                                     |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **web** (2+ pods)        | pages, API, live events (SSE), the undo timer for delayed sends | users cannot sign in or use the app; queued sends wait and go out when it is back |
| **worker**               | mail checks, AI triage, daily brief, notifications, retention   | no new-mail notifications or briefs; nothing is lost, jobs catch up               |
| **Postgres**             | everything, including encrypted secrets                         | web is not ready (503 on `/api/ready`), worker idles                              |
| **KEK** (secret manager) | wraps every user's data key                                     | provider tokens and AI keys are unreadable until it is restored                   |

Nothing sends mail without a person's confirmation, and nothing is retried after a send attempt starts: an **unknown** send outcome is
settled by looking in the Sent folder, never by sending again.

## First five minutes of an incident

1. `GET /api/ready` and `GET /api/health`. Not ready = database problem; check Postgres first.
2. Metrics (`/api/metrics` with the token): `sentinel_http_requests_total` 5xx share, `sentinel_job_queue_jobs{status="failed"}`,
   `sentinel_job_oldest_queued_seconds` (healthy: under a few minutes for `mail.check`).
3. Logs (structured, no mail content): filter by `jobName`, `route`, `code`, `requestId`.
4. Decide: **roll back** if it started with a release (`release.md`); **restore** only for data loss or corruption (below).
5. Write down times as you go. After the incident: what happened, what users saw, what changed.

## Symptoms

| Symptom                                      | Likely cause                                                     | Do                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/ready` 503                             | database unreachable or not migrated                             | check Postgres and credentials; run the migrate job; `checks` in the body says which                                                    |
| oldest queued `mail.check` age keeps growing | worker down or stuck                                             | restart the worker; check `status="running"` is not stuck (leases expire after the job budget plus 30 s and the job is retried)         |
| many failed `mail.check`                     | provider outage or revoked access                                | users see "reconnect" notices; check one account in the provider's status page; no action needed for one-off failures (backoff retries) |
| AI features fail for everyone                | provider key invalid or provider outage                          | users see the cap/consent/network message; nothing is lost                                                                              |
| users report "signed out" repeatedly         | `SESSION_SECRET` changed, or database restored to an older state | expected after a restore; users sign in again                                                                                           |
| 429 on sign-in for one office                | shared address hit the 10/min limit                              | wait a minute; do not raise the limit without a reason                                                                                  |
| push notifications stopped                   | VAPID keys changed or push service errors                        | subscriptions with 404/410 are deleted automatically; check `VAPID_*`                                                                   |

## Backups

- **What**: `deploy/backup.sh` writes a custom-format `pg_dump`, verifies it can be listed, writes a SHA-256 and prunes dumps older than
  `BACKUP_KEEP_DAYS` (14), always keeping the newest. A managed Postgres with point-in-time recovery is better; use this as well.
- **When**: daily at least, from cron or a Kubernetes CronJob: `DATABASE_URL=... BACKUP_DIR=/backups deploy/backup.sh`. Alert if the newest
  dump is older than 26 hours.
- **Where**: off the database host, encrypted at rest. A dump holds only ciphertext and wrapped data keys, so it is useless without the KEK.
- **The KEK is not in the backup.** Keep `KEK_BASE64` (and any `KEK_PREVIOUS` still needed) in a secret manager with its own backup. A
  database backup without its KEK restores everything except the ability to read provider tokens and AI keys, and users would reconnect.

## Restore

Stop **web and worker** first (scale to 0), so nothing writes during the restore.

```
# 1. pick the dump; the checksum is verified for you
ls -1 /backups/sentinel-*.dump | tail
# 2. into an empty database (create it first); the confirmation must equal its name
CONFIRM_RESTORE=sentinel deploy/restore.sh /backups/sentinel-20261028T020000Z.dump "postgres://.../sentinel"
# 3. bring the schema up to the current release, then start the app
node dist/migrate.mjs
```

`restore.sh` refuses without `CONFIRM_RESTORE=<database name>`, refuses a dump whose checksum does not match, and replaces every table in the
target. Prefer restoring into a **new** database, checking it, then pointing `DATABASE_URL` at it.

After a restore: users with sessions created after the backup must sign in again; mail is re-fetched by the next checks; anything a user sent
after the backup is still in their mailbox, and the send log in Sentinel will not show it (the mailbox is the source of truth).

### Restore drill (run quarterly; automated as `tests/ops/restore-drill.e2e.ts`)

The drill populates a database (user, account, 20 000 messages, settings, an encrypted secret), backs it up, restores into a new database,
compares row counts of every table, reads the secret back with the same KEK and fails with a different one, then rotates the KEK.
Last run in the CI-class sandbox (Postgres 16): backup 0.3 s, restore 1.2 s, KEK rotation 1.5 s (mostly process start-up); all tables
identical. Real data volumes take longer: time your own run and record it here.

## KEK rotation

Rotate on a schedule (yearly), when someone with access leaves, or if the key may have leaked. The KEK wraps each user's data key, so rotation
re-wraps those (a few hundred bytes per user); secrets themselves are not re-encrypted.

1. Generate a new key: `openssl rand -base64 32`. Store it in the secret manager **before** using it.
2. Set `KEK_BASE64=<new>`, `KEK_VERSION=<old version + 1>` and `KEK_PREVIOUS=<old version>:<old key>` (comma-separated for several) on web, worker and the
   rotation command. Deploy: both keys are now available, so nothing breaks while pods roll.
3. Re-wrap: `node dist/rotate-kek.mjs` (or `npm run kek:rotate`). It prints how many data keys moved and how many are still on another version
   (non-zero exit if any). Safe to repeat. If the old key is missing from `KEK_PREVIOUS` it stops without changing anything.
4. Verify: a user can still send a test (AI test call, reconnect check). Then remove `KEK_PREVIOUS` and deploy again. Keep the old key in the secret
   manager's history until the next backup cycle has passed, because **older backups need the key that was current when they were taken**.

If the KEK is lost with no copy: data keys cannot be unwrapped; users must reconnect accounts and re-enter AI keys. Nothing else is lost.
If the KEK **leaked**: rotate as above, then also ask users to reconnect accounts (or revoke provider grants) because tokens were readable with the old key
plus a database copy.

## Other secrets

- `SESSION_SECRET`: signs CSRF tokens and OAuth state. Changing it invalidates in-flight sign-ins and CSRF cookies (they are re-issued); sessions live in the
  database and survive. Rotate on suspicion of leak.
- Provider OAuth client secrets, VAPID keys, SMTP credentials: replace in the secret manager and redeploy. New VAPID keys require users to re-enable push.
- A user's password reset or compromised account: have them use "Forgot password" (it ends all sessions), or revoke sessions from Security settings.

## Incident checklist

- [ ] Declared, someone owns it, time started.
- [ ] User impact known (who, since when). Status message if users are affected.
- [ ] Mitigation chosen: roll back / restart / scale / restore. Not "wait and see" for data loss.
- [ ] If data may have been exposed: what exactly (mail content is stored in plaintext in Postgres; secrets are encrypted), whose, and whether the KEK or
      `SESSION_SECRET` could be involved. Rotate what applies. Tell affected users and, where required, the regulator, within your legal deadline.
- [ ] If an unexpected send happened: the send log (Settings → Sending) shows each authorization, content hash and outcome; sends always carry a person's
      confirmation, so check the audit log for that session first.
- [ ] After: timeline, cause, what detected it, what will prevent it, owner and date for each action.

## On-call basics

- Access you need: the deployment environment (namespace-scoped kubectl), the secret manager, the database (read-only role for looking), the metrics
  dashboard, and the repository to run the Rollback workflow.
- Database peeks: `select name, status, count(*) from jobs group by 1,2;` and `select * from bg_runs order by started_at desc limit 20;`. Do not read the
  `messages` table without a reason you could explain to the user.
- Never run `delete` or `update` on production data by hand without a second person and a backup taken first.
- Handover: current alerts, anything that was silenced and until when, anything half-rolled-out.
