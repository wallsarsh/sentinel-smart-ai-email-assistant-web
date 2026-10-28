# Deployment

One image, three commands:

| Command                                   | Runs                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `node .output/server/index.mjs` (default) | the web app and API on port 3000                                      |
| `node dist/worker.mjs`                    | background jobs: mail checks, triage, brief, notifications, retention |
| `node dist/migrate.mjs`                   | applies database migrations, then exits                               |

The image runs as the unprivileged `node` user (uid 1000), needs no writable filesystem except `/tmp`, drops all
capabilities, and has a health check on `/api/ready`.

## Build

```
docker build -t sentinel .
```

CI builds it on every push (`image` job), runs the migrations from it against a Postgres service, starts web and worker
and checks readiness, user id and the worker start line.

## Single host (Docker Compose)

```
cp deploy/.env.example deploy/.env      # fill every value
docker compose -f deploy/compose.yml --env-file deploy/.env up -d
```

`migrate` runs once and `web`/`worker` start only after it completed. `web` listens on `127.0.0.1:3000`; put a
TLS-terminating reverse proxy in front and set `BASE_URL` to its https address. Resource limits are in the compose file.

## Kubernetes

`deploy/k8s/sentinel.yaml` has the migrate Job, web and worker Deployments, the Service and a PodDisruptionBudget. Create
a Secret `sentinel-env` with the variables from `deploy/.env.example`, replace `IMAGE`, bring your own ingress and TLS.
Pods are non-root with a read-only root filesystem, dropped capabilities, resource requests/limits and startup, readiness
(`/api/ready`) and liveness (`/api/health`) probes. (Plain manifests rather than a Helm chart: they apply with `kubectl`
or kustomize and are checked by `tests/unit/deploy.test.ts`.)

## Rolling update

Order matters because old and new code run side by side for a while:

1. **Build and push** the new image.
2. **Migrate**: run the migrate Job (or `docker compose run --rm migrate`) with the _new_ image and wait for it to finish.
   Migrations must be **backward compatible with the previous release** (add columns and tables first; remove or rename in a
   later release, after nothing reads the old shape).
3. **Roll web**: `kubectl set image deployment/sentinel-web web=IMAGE` (or `docker compose up -d web`). With
   `maxUnavailable: 0` a new pod must pass `/api/ready` before an old one is stopped; the PodDisruptionBudget keeps one up.
4. **Roll worker**: same for `sentinel-worker`. Jobs claimed by an old worker finish or are retried by lease expiry, and
   job keys make a repeated enqueue a no-op.
5. **Check**: `/api/ready` is 200, `sentinel_job_queue_jobs{status="failed"}` is flat, the oldest queued job age is normal.

Rollback is the same steps with the previous image, as long as the migration was backward compatible (it was, by rule 2).
A migration that cannot be undone is a restore from backup (see the runbook, T158).

## Secrets

Nothing in the image or the manifests is a secret. Values come from the environment: `SESSION_SECRET`, `KEK_BASE64` (keep
it in a secret manager; losing it makes stored provider tokens unreadable), provider OAuth secrets, VAPID keys, SMTP
credentials. Domain, TLS and the managed database are the operator's to provide (task T011).
