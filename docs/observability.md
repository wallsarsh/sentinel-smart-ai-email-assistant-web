# Observability

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | liveness: the process answers |
| `GET /api/ready` | readiness: database answers and the schema is migrated (503 otherwise) |
| `GET /api/metrics` | Prometheus text format. Off (404) unless `METRICS_TOKEN` is set; then `Authorization: Bearer <token>` |

Metrics: `sentinel_http_requests_total{method,route,status}`, `sentinel_http_request_duration_seconds{route}`,
`sentinel_job_queue_jobs{name,status}`, `sentinel_job_oldest_queued_seconds{name}`, `sentinel_error_reports_total{result}`,
process uptime and memory. Suggested alerts: oldest queued `mail.check` job above 15 minutes, `status="failed"` jobs
growing, 5xx share above 2%, `/api/ready` failing.

**What labels can contain.** Route patterns from a fixed word list (`/api/messages/:id/triage`), status classes
(`2xx`), methods from a fixed set and job names from a fixed set. Ids, addresses, tokens and mail text cannot become
labels, and each metric is capped at 300 series (extra label sets fold into `overflow="true"`). A test compares the word
list with `server/api`, so a new route must be added to `ROUTE_WORDS`.

**Error reporting** is off unless `ERROR_REPORT_URL` is set. Only server errors (status 500 and up) are sent, as
`{name, message, frames, route, at, build}` after scrubbing (addresses, keys, tokens, long encoded strings, home paths and
query strings removed; no user id). Errors caused while serving a signed-in user are sent only if that user turned on
"crash reports" in settings. The same error is sent at most once a minute.

Job counters live in the worker process, which has no HTTP port; the web process reports queue depth and age from the
database instead. Logs are structured (pino) with a fixed list of fields.
