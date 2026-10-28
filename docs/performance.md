# Performance

Budgets live in `tests/perf/budgets.ts` (server and browser) and `tools/bundle-budget.mjs` (bundle). They are enforced
in CI: the `e2e` job runs `tests/perf`, the `checks` job runs the bundle budget after the build.

## Last measured (CI-class sandbox, Postgres 16, 50 000 messages in one mailbox, built server)

| Measure | Result | Budget |
| --- | --- | --- |
| Inbox first page, p95 | 8 ms | 150 ms |
| Inbox page 30 deep (cursor), p95 | 9 ms | 150 ms |
| Inbox "needs reply" segment, p95 | 9 ms | 150 ms |
| Inbox counts (all segments), p95 | ~70 ms (was 123 ms; also returns the unread total) | 100 ms |
| Full-text search ("quarterly report"), p95 | 13 ms | 300 ms |
| Actions list, p95 | 11 ms | 150 ms |
| Brief, p95 | 10 ms | 100 ms |
| Rule-based triage of new mail | ~230 messages/s | > 20/s |
| First contentful paint, `/inbox` and `/` | 110-120 ms | 1800 ms |
| Client JS, gzip | 175 kB over 46 files; largest chunk 57 kB | 200 kB / 70 kB |
| Client CSS, gzip | 5 kB | 10 kB |
| Seeding 50 000 messages + triage rows | 7 s | n/a |

Found and fixed: the counts endpoint ran one query per segment, and its "has an open action" test was a correlated
sub-select per message (123 ms). It is now one pass with a pre-aggregated join.

## Not measured

- **Lighthouse CI** was not run: it needs the Lighthouse package and a served build in CI, which this environment
  could not install. The browser budgets above (FCP, DOMContentLoaded) and the bundle budget stand in for its
  performance category until it is added. PWA installability is covered by `tests/unit/pwa.test.ts`.
- Throttled mobile network/CPU, a cold database cache, and concurrent users. The numbers are single-user, warm.
- AI-path triage throughput depends on the provider and is not part of the budget.
