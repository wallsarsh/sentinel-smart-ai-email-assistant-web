import type { JobHandler } from '../server/jobs/runner'

/** Job handlers by name. Later tasks register theirs here (mail check, brief, retention). */
export const handlers: Record<string, JobHandler> = {}
