import { useConfig } from '../config'
import { useDb } from '../container'
import { errorReporter } from '../observability/errors'
import { errorReports, routeLabel } from '../observability/metrics'
import { forUser } from '../repos'

/**
 * Sends scrubbed error reports to ERROR_REPORT_URL when the operator set one. Errors caused while serving
 * a signed-in user are only sent if that user turned on crash reports. Status codes below 500 are expected
 * outcomes (bad input, signed out) and are not reported.
 */
export default defineNitroPlugin((nitro) => {
  const c = useConfig()
  if (!c.errorReportUrl) return
  const reporter = errorReporter({
    url: c.errorReportUrl,
    build: c.buildId,
    post: async (url, body) => {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      })
    },
    userOptedIn: async (userId) =>
      (await forUser(useDb(), userId).settings.get('telemetry.crashReports')) === true,
  })
  nitro.hooks.hook('error', async (error, { event }) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500
    if (status < 500) return
    const sent = await reporter.report(error, {
      route: routeLabel(event ? new URL(event.path, 'http://x').pathname : ''),
      ...(event?.context.userId ? { userId: String(event.context.userId) } : {}),
    })
    errorReports.inc({ result: sent ? 'sent' : 'skipped' })
  })
})
