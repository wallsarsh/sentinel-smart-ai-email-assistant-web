import { useDb } from '../container'
import { readiness } from '../observability/collect'

/** Readiness for load balancers: 200 only when the database answers and the schema is migrated. */
export default defineEventHandler(async (event) => {
  const r = await readiness(useDb())
  if (!r.ready) setResponseStatus(event, 503)
  return r
})
