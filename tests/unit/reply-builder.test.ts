import { describe, expect, it } from 'vitest'
import { simpleParser } from 'mailparser'
import {
  buildReply,
  draftMessageId,
  encodeWord,
  newMessageId,
  replyRecipients,
  replyReferences,
  replySubject,
} from '../../server/mail/mime/reply-builder'
import { sampleMessage } from '../contract/mail-provider-contract'

const original = (over = {}) =>
  sampleMessage('pm1', 'pt1', {
    internetMessageId: '<orig@acme.example>',
    from: { address: 'alex@acme.example', name: 'Alex Chen' },
    to: [{ address: 'priya@corp.example', name: 'Priya' }, { address: 'sam@corp.example' }],
    cc: [{ address: 'boss@acme.example' }],
    references: ['<a@x>', '<b@x>'],
    ...over,
  })
const SELF = ['priya@corp.example', 'priya.alias@corp.example']

describe('replySubject', () => {
  it('adds Re: once and unstacks prefixes in several languages', () => {
    expect(replySubject('Q3 numbers')).toBe('Re: Q3 numbers')
    expect(replySubject('Re: Q3 numbers')).toBe('Re: Q3 numbers')
    expect(replySubject('RE: re: AW: Q3 numbers')).toBe('Re: Q3 numbers')
    expect(replySubject('Re[2]: Q3')).toBe('Re: Q3')
    expect(replySubject('  SV: Hej ')).toBe('Re: Hej')
    expect(replySubject('Research update')).toBe('Re: Research update')
    expect(replySubject('Reply needed')).toBe('Re: Reply needed')
    expect(replySubject('')).toBe('Re:')
  })
})

describe('replyRecipients', () => {
  it('reply goes to the sender only', () => {
    const r = replyRecipients({ original: original(), selfAddresses: SELF, mode: 'reply' })
    expect(r.to.map((a) => a.address)).toEqual(['alex@acme.example'])
    expect(r.cc).toEqual([])
  })
  it('reply-all excludes the user, de-duplicates case-insensitively', () => {
    const r = replyRecipients({
      original: original({
        cc: [
          { address: 'Boss@acme.example' },
          { address: 'sam@corp.example' },
          { address: 'PRIYA.ALIAS@corp.example' },
        ],
      }),
      selfAddresses: SELF,
      mode: 'reply_all',
    })
    expect(r.to.map((a) => a.address)).toEqual(['alex@acme.example'])
    expect(r.cc.map((a) => a.address)).toEqual(['sam@corp.example', 'Boss@acme.example'])
  })
  it('never adds people who were not on the thread', () => {
    const o = original()
    const thread = new Set([
      o.from.address,
      ...o.to.map((a) => a.address),
      ...o.cc.map((a) => a.address),
    ])
    const r = replyRecipients({ original: o, selfAddresses: SELF, mode: 'reply_all' })
    for (const a of [...r.to, ...r.cc]) expect(thread.has(a.address)).toBe(true)
  })
  it('replying to your own message goes to its recipients', () => {
    const r = replyRecipients({
      original: original({
        from: { address: 'priya@corp.example' },
        to: [{ address: 'alex@acme.example' }],
        cc: [],
      }),
      selfAddresses: SELF,
      mode: 'reply',
    })
    expect(r.to.map((a) => a.address)).toEqual(['alex@acme.example'])
  })
})

describe('references and ids', () => {
  it('chain plus original id without duplicates; long chains keep first and last ten', () => {
    expect(replyReferences(original())).toEqual(['<a@x>', '<b@x>', '<orig@acme.example>'])
    expect(replyReferences(original({ references: ['<a@x>', '<orig@acme.example>'] }))).toEqual([
      '<a@x>',
      '<orig@acme.example>',
    ])
    const refs = Array.from({ length: 30 }, (_, i) => `<m${i}@x>`)
    const r = replyReferences(original({ references: refs }))
    expect(r).toHaveLength(11)
    expect(r[0]).toBe('<m0@x>')
    expect(r.at(-1)).toBe('<orig@acme.example>')
  })
  it('message ids are unique, use the sender domain; draft ids are deterministic', () => {
    const a = newMessageId('priya@corp.example')
    expect(a).toMatch(/^<[0-9a-z]+\.[0-9a-f]{20}@corp\.example>$/)
    expect(a).not.toBe(newMessageId('priya@corp.example'))
    expect(newMessageId('nodomain')).toMatch(/@sentinel\.invalid>$/)
    expect(draftMessageId('key 1!', 'p@corp.example')).toBe('<sentinel-key1@corp.example>')
    expect(draftMessageId('k', 'p@corp.example')).toBe(draftMessageId('k', 'p@corp.example'))
  })
})

describe('buildReply', () => {
  const build = (over: Partial<Parameters<typeof buildReply>[0]> = {}) =>
    buildReply({
      original: original(),
      from: { address: 'priya@corp.example', name: 'Priya Sharma' },
      to: [{ address: 'alex@acme.example', name: 'Alex Chen' }],
      cc: [{ address: 'boss@acme.example' }],
      bodyText: 'Thanks, will do.',
      now: new Date('2026-10-27T09:00:00Z'),
      messageId: '<fixed@corp.example>',
      ...over,
    })

  it('renders threading headers and recipients that parse back', async () => {
    const p = await simpleParser(build().raw)
    expect(p.subject).toBe('Re: Q3 numbers')
    expect(p.inReplyTo).toBe('<orig@acme.example>')
    expect(p.references).toEqual(['<a@x>', '<b@x>', '<orig@acme.example>'])
    expect(p.messageId).toBe('<fixed@corp.example>')
    expect(p.from?.value[0]).toMatchObject({ address: 'priya@corp.example', name: 'Priya Sharma' })
    expect(p.cc && 'value' in p.cc && p.cc.value[0]!.address).toBe('boss@acme.example')
    expect(p.text?.trim()).toBe('Thanks, will do.')
  })

  it('is deterministic for the same input', () => {
    expect(build().raw).toBe(build().raw)
  })

  it('encodes non-ASCII subjects, names and bodies', async () => {
    const raw = build({
      subject: 'Re: Überweisung für Müller 🎉',
      from: { address: 'p@corp.example', name: 'Priya Ünal' },
      bodyText: 'Grüße aus München 🎉\nZweite Zeile  \n',
    }).raw
    expect([...raw.split('\r\n\r\n')[0]].every((c) => c.charCodeAt(0) < 128)).toBe(true) // headers stay ASCII
    const p = await simpleParser(raw)
    expect(p.subject).toBe('Re: Überweisung für Müller 🎉')
    expect(p.from?.value[0]!.name).toBe('Priya Ünal')
    expect(p.text).toContain('Grüße aus München 🎉')
    expect(p.text).toContain('Zweite Zeile')
  })

  it('long subjects fold into encoded words of at most 75 characters', () => {
    const w = encodeWord('ü'.repeat(120))
    for (const word of w.split('\r\n ')) expect(word.length).toBeLessThanOrEqual(75)
  })

  it('header injection through names or subjects is impossible', async () => {
    const raw = build({
      subject: 'Hi\r\nBcc: evil@x.test',
      from: { address: 'p@corp.example', name: 'Evil\r\nBcc: e@x.test' },
    }).raw
    const head = raw.split('\r\n\r\n')[0]!
    expect(head.split('\r\n').some((l) => /^bcc:/i.test(l))).toBe(false)
    const p = await simpleParser(raw)
    expect(p.bcc).toBeUndefined()
  })

  it('an explicit subject wins; the default is Re: original', () => {
    expect(build({ subject: 'Custom' }).subject).toBe('Custom')
    expect(build().subject).toBe('Re: Q3 numbers')
  })

  it('keeps long lines under the limit and = signs intact', async () => {
    const body = 'a=b '.repeat(100) + '\n' + 'x'.repeat(300)
    const raw = build({ bodyText: body }).raw
    for (const l of raw.split('\r\n')) expect(l.length).toBeLessThanOrEqual(78)
    const p = await simpleParser(raw)
    expect(p.text).toContain('a=b a=b')
    expect(p.text?.replace(/\s/g, '')).toContain('x'.repeat(300))
  })
})
