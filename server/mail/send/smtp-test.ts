import nodemailer from 'nodemailer'
import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import type { ImapSettings } from '../../../shared/domain'
import { isPublicAddress, systemResolver, type Resolver } from '../../http/ssrf'

/**
 * Checks SMTP host, TLS and credentials during setup using `verify()`, which
 * connects, negotiates TLS and authenticates and then quits. No MAIL FROM is
 * issued, so no message can leave. Lives in the send module because it uses
 * the SMTP client.
 */
export async function testSmtp(
  s: Pick<ImapSettings, 'smtpHost' | 'smtpPort' | 'smtpSecurity'>,
  cred: { username: string; password: string },
  o: {
    resolver?: Resolver
    allowPrivate?: boolean
    tlsRejectUnauthorized?: boolean
    requireTLS?: boolean
  } = {},
): Promise<Result<undefined, AppFailure>> {
  const addrs = await (o.resolver ?? systemResolver)(s.smtpHost).catch(() => [] as string[])
  if (!addrs.length) return err({ kind: 'network', code: 'dns' })
  if (!o.allowPrivate && !addrs.every(isPublicAddress))
    return err({ kind: 'validation', field: 'smtpHost', code: 'private_address' })

  const t = nodemailer.createTransport({
    host: addrs[0],
    port: s.smtpPort,
    secure: s.smtpSecurity === 'implicit_tls',
    requireTLS: o.requireTLS ?? s.smtpSecurity === 'start_tls',
    auth: { user: cred.username, pass: cred.password },
    // Connect to the vetted IP but validate the certificate for the real name.
    tls: {
      servername: s.smtpHost,
      rejectUnauthorized: o.tlsRejectUnauthorized ?? true,
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  try {
    await t.verify()
    return ok(undefined)
  } catch (e) {
    return err(mapSmtpError(e))
  } finally {
    t.close()
  }
}

export function mapSmtpError(e: unknown): AppFailure {
  const x = e as { code?: string; responseCode?: number; message?: string }
  if (x.code === 'EAUTH' || x.responseCode === 535 || x.responseCode === 534)
    return { kind: 'auth', problem: 'invalid_credentials', code: 'smtp' }
  if (x.code === 'ETLS' || /certificate|self.signed|tls|ssl/i.test(x.message ?? ''))
    return { kind: 'validation', field: 'smtpSecurity', code: 'tls_failed' }
  if (
    x.code === 'ETIMEDOUT' ||
    x.code === 'ESOCKET' ||
    x.code === 'ECONNECTION' ||
    x.code === 'ECONNREFUSED' ||
    x.code === 'EDNS'
  )
    return { kind: 'network', code: x.code }
  return { kind: 'network', code: x.code }
}
