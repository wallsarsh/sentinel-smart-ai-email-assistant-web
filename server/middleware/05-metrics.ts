import { recordRequest } from '../observability/metrics'

/** Counts every request and its duration once the response has been written. */
export default defineEventHandler((event) => {
  const start = process.hrtime.bigint()
  const path = getRequestURL(event).pathname
  event.node.res.once('finish', () => {
    recordRequest(
      event.method,
      path,
      event.node.res.statusCode,
      Number(process.hrtime.bigint() - start) / 1e9,
    )
  })
})
