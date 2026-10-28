# Releasing

## Cut a release

1. Merge to `main` with CI green.
2. Tag and push: `git tag v1.4.0 && git push origin v1.4.0` (release candidate: `v1.4.0-rc.1`).
3. The **Release** workflow then runs, in order:
   - **checks**: the whole CI workflow (lint, types, unit tests, send gate, build, bundle and secrets checks, end-to-end on real
     Postgres, image build and start-up test). Any failure stops the release.
   - **image**: refuses a tag that is not on `main`, builds and pushes `ghcr.io/<owner>/<repo>:<tag>` (never `latest`), and stores the
     **source maps** as a private workflow artifact for 90 days. They are not inside the image.
   - **staging**: `deploy/deploy.sh` (migrate → web → worker), then a readiness smoke test against `BASE_URL`.
   - **production**: only for non-`-rc` tags, and only after a reviewer approves the `production` environment. Same script, same smoke test.

One-time setup in the repository settings: environments `staging` and `production` (add required reviewers to `production`), each with
the secret `KUBECONFIG_B64` (a kubeconfig limited to that namespace, base64) and the variables `K8S_NAMESPACE` and `BASE_URL`.
Do not give the workflow more than a namespace-scoped role.

Reading a production stack trace: download the artifact `sourcemaps-<tag>` (repository members only), extract `sourcemaps.tar` and map
the frames with any source-map tool. Error reports carry the build id and `file:line`, never mail content (see observability).

## Roll back

Rollback re-deploys an earlier image; nothing is rebuilt.

- **From GitHub**: Actions → **Rollback** → choose the environment and the earlier tag (for example `v1.3.2`). It checks out that tag's
  manifests and script, runs `deploy.sh` with that image and smoke-tests. Production still needs the environment approval.
- **By hand**: `deploy/deploy.sh <namespace> ghcr.io/<owner>/<repo>:v1.3.2`.

It is safe because migrations are **backward compatible with the previous release**: the older code runs on the newer schema, and columns or
tables are removed only in a later release, after nothing reads them. If a release did ship a migration that breaks the previous version,
roll _forward_ with a fix, or restore the database from backup (see the runbook) and then deploy the older image. `deploy.sh` rolls web first,
then the worker, and stops before any rollout if the migration job fails.

A rollback does not undo data the new version already wrote. If the new version wrote something the old one cannot read, the fix is forward.

## Hotfix

Branch from the release tag, fix, merge to `main`, tag `v1.4.1`. The pipeline is the same.
