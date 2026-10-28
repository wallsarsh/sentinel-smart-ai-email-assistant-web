import { describe, expect, it } from 'vitest'
import { cleanDraft, placeholders, scanForeignDetails } from '../../server/drafts/clean'
import { draftGenerator, type DraftEvent } from '../../server/drafts/generator'
import { createTestDb } from '../../server/db/client'
import { messages } from '../../server/db/schema'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { AiStreamError, type StreamEvent } from '../../server/ai/types'

describe('cleanDraft', () => {
  it.each([
    ['plain', 'Hi Alex,\n\nThursday works.', 'Hi Alex,\n\nThursday works.'],
    ['fenced', '```\nHi Alex,\nYes.\n```', 'Hi Alex,\nYes.'],
    ['fenced with language', '```text\nHi\n```', 'Hi'],
    ['subject line', 'Subject: Re: Q3\n\nHi Alex,\nYes.', 'Hi Alex,\nYes.'],
    [
      'signature delimiter',
      'Hi,\nYes.\n\nBest regards,\n-- \nPriya Sharma\nCFO',
      'Hi,\nYes.\n\nBest regards,',
    ],
    ['blank-line runs and CRLF', 'A\r\n\r\n\r\n\r\nB  ', 'A\n\nB'],
  ])('%s', (_n, input, want) => expect(cleanDraft(input)).toBe(want))
})

describe('foreign-detail scan', () => {
  const thread = [
    'Hi, call me on +44 20 7946 0958 or write to alex@acme.example. Details at https://acme.example/q3.',
  ]
  it('flags links, emails and phone numbers that are not in the thread', () => {
    const found = scanForeignDetails(
      'See https://evil.test/pay, mail eve@evil.test or call +49 30 1234 5678.',
      thread,
    )
    expect(found.map((f) => [f.kind, f.value])).toEqual(
      [
        ['link', 'https://evil.test/pay,'.replace(/,$/, '')],
        ['email', 'eve@evil.test'],
        ['phone', '+49 30 1234 5678'],
      ].map(([k, v]) => [k, v]),
    )
    expect(
      found.every(
        (f) =>
          'See https://evil.test/pay, mail eve@evil.test or call +49 30 1234 5678.'.slice(
            f.start,
            f.end,
          ) === f.value,
      ),
    ).toBe(true)
  })
  it('does not flag details that come from the thread or the user (case-insensitive, spaced numbers)', () => {
    expect(
      scanForeignDetails(
        'Call +44 20 7946 0958, write ALEX@acme.example, see https://acme.example/q3.',
        thread,
      ),
    ).toEqual([])
    expect(scanForeignDetails('My number is 020 7946 0958', ['0207946 0958'])).toEqual([])
  })
  it('ignores dates and short numbers', () => {
    expect(scanForeignDetails('On 2026-10-30 at 15:00, 3 items, ref 12345.', [])).toEqual([])
  })
  it('reports an address inside a link once', () => {
    expect(
      scanForeignDetails('Go to https://evil.test/?to=a@evil.test now', []).map((f) => f.kind),
    ).toEqual(['link'])
  })
  it('finds placeholders', () =>
    expect(placeholders('Hi [name], is [confirm date] ok? [x]')).toEqual([
      '[name]',
      '[confirm date]',
    ]))
})

async function setup(
  streams: ((
    signal?: AbortSignal,
  ) => AsyncGenerator<StreamEvent | { type: 'metered' }, void, void>)[],
) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({
    email: 'u@x.io',
    passwordHash: 'h',
    displayName: 'Priya',
  })
  const r = forUser(db, user.id)
  const acc = await r.accounts.create({
    type: 'imap',
    email: 'me@x.test',
    displayName: '',
    color: 1,
  })
  await r.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
  ])
  const f = (await r.mail.listFolders(acc.id))[0]!
  const t = await r.mail.upsertThread(acc.id, 't1', 'Q3', new Date())
  const mk = async (n: number, from: string, body: string) =>
    (
      await db
        .insert(messages)
        .values({
          userId: user.id,
          accountId: acc.id,
          folderId: f.id,
          threadId: t.id,
          providerMessageId: `m${n}`,
          fromAddress: from,
          subject: 'Q3',
          bodyText: body,
          sentAt: new Date(1_700_000_000_000 + n * 1000),
          receivedAt: new Date(1_700_000_000_000 + n * 1000),
        })
        .returning()
    )[0]!
  const first = await mk(1, 'me@x.test', 'I will send the numbers.')
  const last = await mk(2, 'alex@acme.example', 'Can you do Thursday? Call +44 20 7946 0958.')
  const prompts: string[] = []
  const used: string[] = []
  const p = await r.ai.create({
    kind: 'openai',
    displayName: 'P',
    baseUrl: 'https://x.test',
    presetId: 'chatgpt',
    optionsJson: {},
  })
  const p2 = await r.ai.create({
    kind: 'openai',
    displayName: 'P2',
    baseUrl: 'https://y.test',
    presetId: 'chatgpt',
    optionsJson: {},
  })
  await r.ai.setRoutes('draft', [
    { providerId: p.id, model: 'm-a', paramsJson: {} },
    { providerId: p2.id, model: 'm-b', paramsJson: {} },
  ])
  const queue = [...streams]
  const gateway = {
    stream: (c: { providerId: string; request: { user: string; signal?: AbortSignal } }) => (
      prompts.push(c.request.user),
      used.push(c.providerId === p.id ? 'a' : 'b'),
      queue.shift()!(c.request.signal)
    ),
  }
  const { aiRouter } = await import('../../server/ai/router')
  const gen = draftGenerator({
    db,
    gateway: gateway as never,
    router: aiRouter({
      db,
      gateway: {
        complete: async () => {
          throw new Error('unused')
        },
      } as never,
    }),
    now: () => new Date('2026-10-27T07:30:00Z'),
  })
  return { db, user, r, acc, first, last, gen, prompts, used }
}
const req = (s: Awaited<ReturnType<typeof setup>>, o: object = {}) => ({
  userId: s.user.id,
  messageId: s.last.id,
  tone: 'friendly' as const,
  intent: 'accept' as const,
  ...o,
})
const collect = async (it: AsyncIterable<DraftEvent>) => {
  const o: DraftEvent[] = []
  for await (const e of it) o.push(e)
  return o
}
const resp = {
  text: '',
  usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
  stop: 'end' as const,
  model: 'm',
}
async function* ok(...parts: string[]) {
  for (const p of parts) yield { type: 'delta' as const, text: p }
  yield { type: 'done' as const, response: { ...resp, text: parts.join('') } }
}

describe('draft generator', () => {
  it('streams deltas, then a cleaned result with placeholders and foreign details, using the thread and profile', async () => {
    const s = await setup([
      () => ok('Hi Alex,\n', 'Thursday works. Call eve@evil.test [confirm time].\n\n```'),
    ])
    await s.r.settings.setMany({ 'profile.signOff': 'Best regards,' })
    const ev = await collect(s.gen.generate(req(s, { instruction: 'Keep it short' })))
    expect(ev.filter((e) => e.type === 'delta')).toHaveLength(2)
    const done = ev.at(-1)!
    expect(done).toMatchObject({
      type: 'done',
      promptVersion: 'draft.v1',
      model: 'm-a',
      placeholders: ['[confirm time]'],
    })
    expect((done as { foreign: { value: string }[] }).foreign.map((f) => f.value)).toEqual([
      'eve@evil.test',
    ])
    expect(s.prompts[0]).toContain('<thread boundary=')
    expect(s.prompts[0]).toContain('Can you do Thursday?')
    expect(s.prompts[0]).toContain('I will send the numbers.')
    expect(s.prompts[0]).toContain('sign_off: Best regards,')
    expect(s.prompts[0]).toContain('instruction: Keep it short')
  })

  it('stopping early closes the upstream stream immediately', async () => {
    let closed = false
    async function* slow() {
      try {
        yield { type: 'delta' as const, text: 'Hi' }
        await new Promise((r) => setTimeout(r, 5000))
        yield { type: 'delta' as const, text: 'never' }
      } finally {
        closed = true
      }
    }
    const s = await setup([() => slow()])
    const it = s.gen.generate(req(s))
    expect((await it.next()).value).toEqual({ type: 'delta', text: 'Hi' })
    await it.return(undefined)
    expect(closed).toBe(true)
  })

  it('an aborted signal ends the stream without a result', async () => {
    const ctl = new AbortController()
    const s = await setup([() => ok('a', 'b', 'c')])
    const out: DraftEvent[] = []
    for await (const e of s.gen.generate(req(s, { signal: ctl.signal }))) {
      out.push(e)
      ctl.abort()
    }
    expect(out.map((e) => e.type)).toEqual(['delta'])
  })

  it('falls back to the next route only before anything was shown', async () => {
    async function* fail(): AsyncGenerator<StreamEvent, void, void> {
      yield* []
      throw new AiStreamError({ kind: 'network' })
    }
    const s = await setup([() => fail(), () => ok('Hello')])
    const ev = await collect(s.gen.generate(req(s)))
    expect(ev.at(-1)).toMatchObject({ type: 'done', model: 'm-b' })
    expect(s.used).toEqual(['a', 'b'])
    async function* midFail(): AsyncGenerator<StreamEvent, void, void> {
      yield { type: 'delta', text: 'Hi' }
      throw new AiStreamError({ kind: 'network' })
    }
    const s2 = await setup([() => midFail(), () => ok('x')])
    await expect(collect(s2.gen.generate(req(s2)))).rejects.toMatchObject({
      failure: { kind: 'network' },
    })
    expect(s2.used).toEqual(['a'])
    async function* capped(): AsyncGenerator<StreamEvent, void, void> {
      yield* []
      throw new AiStreamError({ kind: 'cap_reached', scope: 'cost' })
    }
    const s3 = await setup([() => capped(), () => ok('x')])
    await expect(collect(s3.gen.generate(req(s3)))).rejects.toMatchObject({
      failure: { kind: 'cap_reached' },
    })
    expect(s3.used).toEqual(['a'])
  })

  it('AI-excluded accounts and unknown messages never reach a model', async () => {
    const s = await setup([() => ok('x')])
    await s.r.accounts.update(s.acc.id, { aiExcluded: true })
    await expect(collect(s.gen.generate(req(s)))).rejects.toMatchObject({
      failure: { kind: 'forbidden', code: 'ai_excluded' },
    })
    await expect(
      collect(s.gen.generate(req(s, { messageId: '00000000-0000-0000-0000-000000000000' }))),
    ).rejects.toMatchObject({ failure: { kind: 'not_found' } })
    expect(s.prompts).toHaveLength(0)
  })

  it("another user's message is not found", async () => {
    const s = await setup([() => ok('x')])
    const other = await authRepo(s.db).createUser({ email: 'o@x.io', passwordHash: 'h' })
    await expect(collect(s.gen.generate(req(s, { userId: other.id })))).rejects.toMatchObject({
      failure: { kind: 'not_found' },
    })
  })
})
