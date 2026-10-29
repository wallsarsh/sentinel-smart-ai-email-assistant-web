import { useConfig } from '../config'

/**
 * Only when ALLOW_INSECURE_HTTP=true (local testing): stop telling browsers to upgrade to https or to remember
 * https-only, which would turn every relative link and form into an https URL that nothing is serving.
 */
export default defineNitroPlugin((nitro) => {
  if (!useConfig().allowInsecureHttp) return
  nitro.hooks.hook('beforeResponse', (event) => {
    removeResponseHeader(event, 'strict-transport-security')
    const csp = getResponseHeader(event, 'content-security-policy')
    if (typeof csp === 'string')
      setResponseHeader(
        event,
        'content-security-policy',
        csp
          .split(';')
          .filter((d) => d.trim() !== 'upgrade-insecure-requests')
          .join(';'),
      )
  })
})
