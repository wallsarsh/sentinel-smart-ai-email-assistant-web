/**
 * Performance budgets, enforced by `npm run e2e` (tests/perf) and `node tools/bundle-budget.mjs`.
 * Server numbers are for a CI-class machine with 50 000 messages in one mailbox on Postgres 16.
 * Raise a number only with a note in the task log saying why.
 */
export const BUDGETS = {
  /** p95 latency in ms for one authenticated request to the built server, over 60 requests. */
  api: {
    inboxFirstPage: 150,
    inboxNextPage: 150,
    inboxCounts: 100,
    search: 300,
    actions: 150,
    brief: 100,
  },
  /** Rule-based triage of fresh mail, messages per second (no AI). */
  triageRulesPerSecond: 20,
  /** Browser, real pages on the built server, no throttling. Milliseconds. */
  browser: { firstContentfulPaint: 1800, domContentLoaded: 2000 },
  messages: 50_000,
} as const
