import { afterEach, describe, expect, it } from 'vitest'
import { classifySmtpError, smtpSender } from '../../server/mail/send/smtp'
import { FakeImapSession } from '../helpers/fake-imap-session'
import { buildReply } from '../../server/mail/mime/reply-builder'
import { fakeSmtp, type SmtpScript } from './fake-smtp'
import { sendFixture } from './helpers'

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(closers.splice(0).map((c) => c()))
})

async function setup(
  script: SmtpScript = {},
  o: { serverSavesSent?: boolean; timeoutMs?: number } = {},
) {
  const smtp = await fakeSmtp(script)
  closers.push(smtp.close)
  const f = await sendFixture('imap', {
    draftRef: { providerDraftId: 'Drafts:1:1', providerMessageId: '<sentinel-k@x.test>' },
  })
  const imap = new FakeImapSession()
  const draftRaw = buildReply({
    original: {
      providerMessageId: '',
      providerThreadId: null,
      internetMessageId: '<orig@acme.example>',
      from: { address: 'alex@acme.example' },
      to: [],
      cc: [],
      subject: 'Q3 numbers',
      sentAt: new Date(),
      receivedAt: new Date(),
      isRead: true,
      bodyText: '',
      bodyHtml: null,
      attachmentNames: [],
      references: ['<root@acme.example>'],
      listUnsubscribe: null,
      precedence: null,
      autoSubmitted: null,
    },
    from: { address: 'me@x.test' },
    to: [{ address: 'alex@acme.example' }],
    cc: [],
    bodyText: 'draft text',
    messageId: '<sentinel-k@x.test>',
  }).raw
  imap.add('Drafts', draftRaw, ['\\Draft'])
  const sender = smtpSender({
    db: f.db,
    targetFor: async () => ({
      host: '127.0.0.1',
      port: smtp.port,
      security: 'start_tls',
      username: 'u',
      password: 'p',
      serverSavesSent: o.serverSavesSent ?? false,
      ignoreTLS: true,
      timeoutMs: o.timeoutMs ?? 3000,
    }),
    imapFor: async () => imap,
  })
  return {
    ...f,
    smtp,
    imap,
    sender,
    status: async () => (await f.repos.send.recentRecords())[0]!.status,
  }
}

describe('ImapSmtpMailSender (fake SMTP server)', () => {
  it('submits once with the approved content, files a copy in Sent and deletes the draft', async () => {
    const s = await setup()
    const res = await s.sender.send(await s.redeem())
    if (!res.ok) throw new Error(JSON.stringify(res.error))
    expect(s.smtp.commands.filter((c) => c === 'DATA')).toHaveLength(1)
    expect(s.smtp.commands).toContain('MAIL FROM:<me@x.test>')
    expect(s.smtp.commands).toContain('RCPT TO:<alex@acme.example>')
    const msg = s.smtp.messages[0]!
    expect(msg).toContain('Subject: Re: Q3 numbers')
    expect(msg).toContain('Thanks, I will send them by 3pm.')
    expect(msg).toContain('In-Reply-To: <orig@acme.example>')
    expect(msg).toContain('References: <root@acme.example> <orig@acme.example>')
    expect(msg).toContain(`Message-ID: ${res.value.internetMessageId}`)
    expect(s.imap.box('Sent Items').msgs).toHaveLength(1)
    expect(s.imap.box('Drafts').msgs).toHaveLength(0)
    expect(await s.status()).toBe('sent')
  })

  it('does not append to Sent when the server saves sent mail itself', async () => {
    const s = await setup({}, { serverSavesSent: true })
    await s.sender.send(await s.redeem())
    expect(s.imap.box('Sent Items').msgs).toHaveLength(0)
    expect(s.imap.box('Drafts').msgs).toHaveLength(0)
  })

  it('housekeeping errors do not change a successful send', async () => {
    const s = await setup()
    const orig = s.imap.append.bind(s.imap)
    s.imap.append = async () => {
      throw new Error('quota')
    }
    expect((await s.sender.send(await s.redeem())).ok).toBe(true)
    void orig
    expect(await s.status()).toBe('sent')
  })

  it('an SMTP rejection (RCPT 550) is failed, with the code', async () => {
    const s = await setup({ rcpt: '550 no such user' })
    const res = await s.sender.send(await s.redeem())
    expect(res).toMatchObject({
      ok: false,
      error: { kind: 'provider', status: 550, code: 'smtp_rejected' },
    })
    expect(s.smtp.commands).not.toContain('DATA')
    expect(await s.status()).toBe('failed')
    expect(s.imap.box('Drafts').msgs).toHaveLength(1) // the draft stays for another try
  })

  it('a 4xx after the body (451) is failed: the server said it did not accept it', async () => {
    const s = await setup({ afterData: '451 try later' })
    expect(await s.sender.send(await s.redeem())).toMatchObject({
      ok: false,
      error: { kind: 'provider', status: 451 },
    })
    expect(await s.status()).toBe('failed')
  })

  it('bad credentials fail before any message is sent', async () => {
    const s = await setup({ auth: '535 5.7.8 bad' })
    const res = await s.sender.send(await s.redeem())
    expect(res.ok).toBe(false)
    expect(s.smtp.commands).not.toContain('DATA')
    expect(s.smtp.messages).toHaveLength(0)
    expect(await s.status()).toBe('failed')
  })

  it('a connection dropped after the body, or silence until timeout, is unknown and never retried', async () => {
    for (const afterData of ['drop', 'hang'] as const) {
      const s = await setup({ afterData }, { timeoutMs: 600 })
      const res = await s.sender.send(await s.redeem())
      expect(res).toEqual({
        ok: false,
        error: { kind: 'provider', status: null, code: 'send_unknown' },
      })
      expect(s.smtp.messages).toHaveLength(1)
      expect(s.smtp.commands.filter((c) => c === 'DATA')).toHaveLength(1)
      expect(await s.status()).toBe('unknown')
      expect(s.imap.box('Drafts').msgs).toHaveLength(1)
    }
  })

  it('an unreachable server is failed (nothing was written)', async () => {
    const s = await setup()
    await s.smtp.close()
    const res = await s.sender.send(await s.redeem())
    expect(res.ok).toBe(false)
    expect(await s.status()).toBe('failed')
  })

  it('single-use proof and a missing draft', async () => {
    const s = await setup()
    const proof = await s.redeem()
    await s.sender.send(proof)
    expect(await s.sender.send(proof)).toEqual({
      ok: false,
      error: { kind: 'send_refused', reason: 'already_used' },
    })
    expect(s.smtp.messages).toHaveLength(1)
    const n = await setup()
    n.imap.box('Drafts').msgs.length = 0
    expect(await n.sender.send(await n.redeem())).toMatchObject({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect(n.smtp.messages).toHaveLength(0)
  })

  it('reconcile checks Sent for the Message-ID and never submits', async () => {
    const s = await setup({ afterData: 'drop' }, { timeoutMs: 600 })
    await s.sender.send(await s.redeem())
    const rec = (await s.repos.send.recentRecords())[0]!
    expect(await s.sender.reconcile(s.user.id, rec.id)).toEqual({ ok: true, value: false })
    s.imap.add('Sent Items', `Message-ID: ${rec.internetMessageId}\r\nSubject: x\r\n\r\nbody`)
    expect(await s.sender.reconcile(s.user.id, rec.id)).toEqual({ ok: true, value: true })
    expect(await s.status()).toBe('sent')
    expect(s.smtp.messages).toHaveLength(1)
  })
})

describe('classifySmtpError', () => {
  it.each([
    [{ responseCode: 550 }, false, 'failed'],
    [{ responseCode: 451 }, true, 'failed'],
    [{ code: 'EAUTH' }, false, 'failed'],
    [{ code: 'ECONNECTION' }, false, 'failed'],
    [{ code: 'ETIMEDOUT' }, true, 'unknown'],
    [{ code: 'ECONNECTION' }, true, 'unknown'],
    [new Error('x'), true, 'unknown'],
    [new Error('x'), false, 'failed'],
  ])('%j (DATA started: %s) → %s', (e, dataStarted, want) =>
    expect(classifySmtpError(e, { dataStarted })).toBe(want),
  )
})
