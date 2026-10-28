#!/usr/bin/env bash
# Rolls a release out to a Kubernetes namespace: migrate, then web, then worker. See docs/release.md.
#   deploy/deploy.sh <namespace> <image>          e.g. deploy/deploy.sh sentinel-staging ghcr.io/acme/sentinel:v1.4.0
# Needs kubectl with access to the namespace. Re-run with an older image to roll back (migrations are
# backward compatible by rule, so the previous release runs on the newer schema).
set -euo pipefail

ns="${1:?usage: deploy.sh <namespace> <image>}"
image="${2:?usage: deploy.sh <namespace> <image>}"
manifest="${MANIFEST:-$(dirname "$0")/k8s/sentinel.yaml}"
timeout="${ROLLOUT_TIMEOUT:-300s}"

# An image must be a registry path with a tag or digest; never "latest", which would make a rollback ambiguous.
if [[ "$image" != *@sha256:* ]]; then
  tag="${image##*/}"
  if [[ "$tag" != *:* || "${tag##*:}" == "latest" || -z "${tag##*:}" ]]; then
    echo "image must carry an explicit tag or digest, not :latest ($image)" >&2
    exit 2
  fi
fi

echo "== migrate ($image)"
kubectl -n "$ns" delete job sentinel-migrate --ignore-not-found --wait=true
sed "s#image: IMAGE#image: $image#" "$manifest" | kubectl -n "$ns" apply -f - --selector 'app.kubernetes.io/component=migrate'
if ! kubectl -n "$ns" wait --for=condition=complete job/sentinel-migrate --timeout="$timeout"; then
  echo "migration failed; nothing was rolled out. Logs:" >&2
  kubectl -n "$ns" logs job/sentinel-migrate --tail=50 >&2 || true
  exit 1
fi

echo "== web"
kubectl -n "$ns" set image deployment/sentinel-web web="$image"
kubectl -n "$ns" rollout status deployment/sentinel-web --timeout="$timeout"

echo "== worker"
kubectl -n "$ns" set image deployment/sentinel-worker worker="$image"
kubectl -n "$ns" rollout status deployment/sentinel-worker --timeout="$timeout"

echo "deployed $image to $ns"
