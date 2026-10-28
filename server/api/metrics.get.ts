import { timingSafeEqual } from 'node:crypto'
import { useConfig } from '../config'
import { useDb } from '../container'
import { jobQueue } from '../jobs/queue'
import { collectGauges } from '../observability/collect'
import { metrics } from '../observability/metrics'

const same = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Prometheus scrape endpoint. Off (404) unless METRICS_TOKEN is set; then it needs `Authorization: Bearer <token>`.
 * Series carry route patterns, status classes and job names only: no users, addresses or content.
 */
export default defineEventHandler(async (event) => {
  const token = useConfig().metricsToken
  if (!token) throw createError({ statusCode: 404 })
  const given = /^Bearer (.+)$/.exec(getRequestHeader(event, 'authorization') ?? '')?.[1] ?? ''
  if (!same(given, token)) throw createError({ statusCode: 401 })
  await collectGauges(jobQueue(useDb()))
  setResponseHeader(event, 'content-type', 'text/plain; version=0.0.4; charset=utf-8')
  setResponseHeader(event, 'cache-control', 'no-store')
  return metrics.render()
})
