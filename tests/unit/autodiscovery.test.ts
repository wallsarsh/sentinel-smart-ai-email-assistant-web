import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { discover, parseAutoconfig, probe } from '../../server/mail/imap/autodiscovery'

const xml = `<clientConfig><emailProvider id="x">
<incomingServer type="imap"><hostname>imap.corp.test</hostname><port>143</port><socketType>STARTTLS</socketType><username>%EMAILLOCALPART%</username></incomingServer>
<outgoingServer type="smtp"><hostname>smtp.corp.test</hostname><port>587</port><socketType>STARTTLS</socketType><username>%EMAILADDRESS%</username></outgoingServer>
</emailProvider></clientConfig>`

const none = { fetchText: async () => null, resolveMx: async () => [], resolveSrv: async () => [] }

describe('autodiscovery', () => {
  it('resolves known providers offline, including aliases', async () => {
    const r = await discover('me@icloud.com', {
      ...none,
      fetchText: async () => {
        throw new Error('no network')
      },
    })
    expect(r).toMatchObject({ source: 'table', appPassword: true })
    expect(r!.settings.username).toBe('me@icloud.com')
    expect((await discover('x@hotmail.com', none))!.settings.imapHost).toBe('outlook.office365.com')
  })

  it('parses Mozilla autoconfig with username placeholders', () => {
    expect(parseAutoconfig(xml, 'jo@corp.test')).toMatchObject({
      imapHost: 'imap.corp.test',
      imapPort: 143,
      imapSecurity: 'start_tls',
      username: 'jo',
      smtpHost: 'smtp.corp.test',
      smtpPort: 587,
    })
    expect(parseAutoconfig('<x/>', 'a@b.test')).toBeNull()
    expect(parseAutoconfig(xml.replace('143', '99999'), 'a@b.test')).toBeNull()
  })

  it('tries autoconfig, then MX, then SRV, then guesses', async () => {
    const urls: string[] = []
    const a = await discover('jo@corp.test', {
      ...none,
      fetchText: async (u) => (urls.push(u), urls.length === 2 ? xml : null),
    })
    expect(a!.source).toBe('autoconfig')
    const mx = await discover('jo@corp.test', {
      ...none,
      resolveMx: async () => ['in1.messagingengine.com'],
    })
    expect(mx!.settings.imapHost).toBe('imap.fastmail.com')
    const srv = await discover('jo@corp.test', {
      ...none,
      resolveSrv: async (n) =>
        n.startsWith('_imaps') ? [{ name: 'mail.corp.test', port: 993 }] : [],
    })
    expect(srv).toMatchObject({
      source: 'srv',
      settings: { imapHost: 'mail.corp.test', username: 'jo@corp.test' },
    })
    expect(await discover('jo@corp.test', none)).toMatchObject({
      source: 'guess',
      settings: { imapHost: 'imap.corp.test' },
    })
  })

  it('rejects malformed addresses', async () => {
    expect(await discover('nope', none)).toBeNull()
    expect(await discover('a@b c.test', none)).toBeNull()
  })
})

describe('probe', () => {
  it('refuses private addresses without connecting', async () => {
    const srv = createServer()
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    const port = (srv.address() as { port: number }).port
    let hit = false
    srv.on('connection', () => (hit = true))
    expect(
      await probe('localhost', port, 'start_tls', { resolver: async () => ['127.0.0.1'] }),
    ).toEqual({ ok: false, reason: 'private_address' })
    expect(hit).toBe(false)
    // The test-only escape hatch shows the connect path works.
    expect(
      await probe('localhost', port, 'start_tls', {
        resolver: async () => ['127.0.0.1'],
        allowPrivate: true,
      }),
    ).toEqual({ ok: true })
    srv.close()
  })
  it('reports unresolvable hosts', async () => {
    expect(await probe('nx.test', 993, 'implicit_tls', { resolver: async () => [] })).toEqual({
      ok: false,
      reason: 'unreachable',
    })
  })
})
