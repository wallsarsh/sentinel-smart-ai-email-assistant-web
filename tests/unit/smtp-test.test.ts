import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { mapSmtpError, testSmtp } from '../../server/mail/send/smtp-test'

let srv: Server | undefined
afterEach(() => new Promise<void>((r) => (srv ? srv.close(() => r()) : r())))

/** Minimal SMTP server that records every command it receives. */
async function fakeSmtp(accept: boolean) {
  const cmds: string[] = []
  srv = createServer((sock) => {
    sock.write('220 fake ESMTP\r\n')
    let buf = ''
    let authStage = 0
    sock.on('data', (d) => {
      buf += d.toString()
      for (let i = buf.indexOf('\r\n'); i >= 0; i = buf.indexOf('\r\n')) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 2)
        if (authStage === 1) {
          authStage = 0
          cmds.push('AUTH-DATA')
          sock.write(accept ? '235 ok\r\n' : '535 5.7.8 bad\r\n')
          continue
        }
        cmds.push(line.split(' ')[0]!.toUpperCase())
        if (/^EHLO/i.test(line)) sock.write('250-fake\r\n250 AUTH PLAIN\r\n')
        else if (/^AUTH PLAIN\s+\S+/i.test(line))
          sock.write(accept ? '235 ok\r\n' : '535 5.7.8 bad\r\n')
        else if (/^AUTH PLAIN/i.test(line)) {
          authStage = 1
          sock.write('334 \r\n')
        } else if (/^QUIT/i.test(line)) {
          sock.write('221 bye\r\n')
          sock.end()
        } else sock.write('250 ok\r\n')
      }
    })
  })
  await new Promise<void>((r) => srv!.listen(0, '127.0.0.1', r))
  return { port: (srv.address() as { port: number }).port, cmds }
}

const local = { resolver: async () => ['127.0.0.1'], allowPrivate: true, requireTLS: false }

describe('smtp test', () => {
  it('authenticates and never issues MAIL FROM or DATA', async () => {
    const s = await fakeSmtp(true)
    const r = await testSmtp(
      { smtpHost: 'smtp.test', smtpPort: s.port, smtpSecurity: 'start_tls' },
      { username: 'u', password: 'p' },
      local,
    )
    expect(r).toEqual({ ok: true, value: undefined })
    expect(s.cmds).toContain('EHLO')
    expect(s.cmds).not.toContain('MAIL')
    expect(s.cmds).not.toContain('DATA')
    expect(s.cmds).not.toContain('RCPT')
  })

  it('reports bad credentials without leaking server text', async () => {
    const s = await fakeSmtp(false)
    const r = await testSmtp(
      { smtpHost: 'smtp.test', smtpPort: s.port, smtpSecurity: 'start_tls' },
      { username: 'u', password: 'p' },
      local,
    )
    expect(r).toEqual({
      ok: false,
      error: { kind: 'auth', problem: 'invalid_credentials', code: 'smtp' },
    })
    expect(s.cmds).not.toContain('MAIL')
  })

  it('refuses private hosts and unresolvable names', async () => {
    expect(
      await testSmtp(
        { smtpHost: 'x', smtpPort: 25, smtpSecurity: 'start_tls' },
        { username: 'u', password: 'p' },
        { resolver: async () => ['10.0.0.5'] },
      ),
    ).toMatchObject({ ok: false, error: { kind: 'validation', code: 'private_address' } })
    expect(
      await testSmtp(
        { smtpHost: 'x', smtpPort: 25, smtpSecurity: 'start_tls' },
        { username: 'u', password: 'p' },
        { resolver: async () => [] },
      ),
    ).toMatchObject({ ok: false, error: { kind: 'network' } })
  })

  it('maps connection errors', async () => {
    expect(mapSmtpError({ code: 'ECONNREFUSED' })).toEqual({
      kind: 'network',
      code: 'ECONNREFUSED',
    })
    expect(mapSmtpError({ message: 'self signed certificate' })).toMatchObject({
      kind: 'validation',
      code: 'tls_failed',
    })
    expect(
      await testSmtp(
        { smtpHost: 'x', smtpPort: 1, smtpSecurity: 'implicit_tls' },
        { username: 'u', password: 'p' },
        local,
      ),
    ).toMatchObject({ ok: false })
  })
})
