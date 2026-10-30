import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS modules shipped inside the extension
import { analyze, draftReply, userContext } from '../../thunderbird/src/ai.js'
// @ts-expect-error plain JS modules shipped inside the extension
import {
  checkBaseUrl,
  parseAddress,
  readParts,
  toMailMessage,
  withDraft,
} from '../../thunderbird/src/mail.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { generateBrief, nextRun, selectForBrief } from '../../thunderbird/src/brief.js'
import '../../server/ai/prompts/text' // jsdom stands in for the browser's DOMParser

const header = {
  id: 7,
  author: 'Alex Chen <alex@acme.example>',
  recipients: ['Priya <priya@corp.example>', 'Sam <sam@corp.example>'],
  ccList: [],
  subject: 'Q3 numbers',
  date: new Date('2026-10-27T07:14:00Z'),
  read: false,
}
const full = {
  contentType: 'multipart/mixed',
  parts: [
    {
      contentType: 'multipart/alternative',
      parts: [
        {
          contentType: 'text/plain',
          body: 'Please send the Q3 numbers by Friday.\n\nOn Mon, X wrote:\n> old stuff\n-- \nAlex',
        },
        { contentType: 'text/html', body: '<p>HTML twin</p>' },
      ],
    },
    { contentType: 'application/pdf', name: 'Q3-draft.pdf', body: 'SECRET-ATTACHMENT-BYTES' },
  ],
}
const accounts = [{ identities: [{ name: 'Priya Sharma', email: 'priya@corp.example' }] }]

function fakeFetch(content: string) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const f = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(
      JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: {} }),
    )
  }
  return { f: f as typeof fetch, calls }
}
const settings = { baseUrl: 'https://api.example.com/v1', apiKey: 'k', model: 'm1' }

describe('mail conversion', () => {
  it('parses addresses', () => {
    expect(parseAddress('"Alex Chen" <a@b.c>')).toEqual({ address: 'a@b.c', name: 'Alex Chen' })
    expect(parseAddress('a@b.c')).toEqual({ address: 'a@b.c' })
  })
  it('keeps text, lists attachment names, and never reads attachment content', () => {
    const p = readParts(full)
    expect(p.attachmentNames).toEqual(['Q3-draft.pdf'])
    expect(JSON.stringify(p)).not.toContain('SECRET-ATTACHMENT-BYTES')
    const m = toMailMessage(header, full)
    expect(m.bodyHtml).toBeNull() // html twin is ignored when plain text exists
    expect(m.cc).toEqual([])
    expect(m.from.address).toBe('alex@acme.example')
  })
  it('puts the draft above the quote in plain-text and html replies', () => {
    expect(
      withDraft(
        { isPlainText: true, plainTextBody: '\nOn Fri, X wrote:\n> hi\n-- \nSig' },
        'Thanks.',
      ),
    ).toEqual({
      plainTextBody: 'Thanks.\n\nOn Fri, X wrote:\n> hi\n-- \nSig',
    })
    const html = withDraft(
      {
        isPlainText: false,
        body: '<html><body class="x"><div class="moz-cite-prefix">wrote</div></body></html>',
      },
      'A <b> & B\nline',
    )
    expect(html.body).toBe(
      '<html><body class="x"><div>A &lt;b&gt; &amp; B<br>line</div><br><div class="moz-cite-prefix">wrote</div></body></html>',
    )
  })
  it('normalises the api url and refuses plain http for remote hosts', () => {
    expect(checkBaseUrl('https://api.x.io/v1/')).toBe('https://api.x.io/v1')
    expect(checkBaseUrl('https://api.x.io/v1/chat/completions')).toBe('https://api.x.io/v1')
    expect(checkBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1')
    expect(() => checkBaseUrl('http://evil.example/v1')).toThrow(/https/)
  })
})

describe('extension AI calls use the shared core', () => {
  const triage = {
    results: [
      {
        id: 'e1',
        category: 'workRequest',
        importance: 'high',
        urgency: 'notUrgent',
        needsReply: true,
        summary: 'Alex wants Q3 numbers by Friday.',
        reason: 'direct ask',
        actionItems: [{ text: 'Send Q3 numbers', dueDate: null, dueText: 'Friday' }],
        confidence: 0.9,
      },
    ],
  }
  it('analyzes with a compact prompt: no attachment names, no quoted history, no signature', async () => {
    const { f, calls } = fakeFetch(JSON.stringify(triage))
    const r = await analyze(settings, toMailMessage(header, full), userContext(accounts), f)
    expect(r.summary).toContain('Q3')
    expect(calls).toHaveLength(1)
    const user = (calls[0]!.body.messages as { content: string }[])[1]!.content
    expect(user).toContain('Please send the Q3 numbers by Friday.')
    expect(user).not.toContain('old stuff')
    expect(user).not.toContain('Q3-draft.pdf')
    expect(user).not.toContain('SECRET-ATTACHMENT-BYTES')
    expect(user).toContain('attachments: 1')
    expect(user).toContain('to: me + others')
    expect(calls[0]!.body.max_tokens).toBe(1200)
    expect(calls[0]!.url).toBe('https://api.example.com/v1/chat/completions')
  })
  it('repairs once when the first answer is not valid, then gives up with a readable error', async () => {
    const { f, calls } = fakeFetch('not json at all')
    await expect(
      analyze(settings, toMailMessage(header, full), userContext(accounts), f),
    ).rejects.toThrow(/could not be used/)
    expect(calls).toHaveLength(2)
  })
  it('drafts a plain-text reply from the same compact thread', async () => {
    const { f, calls } = fakeFetch('  Thanks Alex, I will send them Friday.  ')
    const text = await draftReply(
      settings,
      [toMailMessage(header, full)],
      userContext(accounts),
      { tone: 'professional', intent: 'accept' },
      f,
    )
    expect(text).toBe('Thanks Alex, I will send them Friday.')
    const user = (calls[0]!.body.messages as { content: string }[])[1]!.content
    expect(user).toContain('<thread boundary=')
    expect(user).toContain('intent: accept')
    expect(user).not.toContain('Q3-draft.pdf')
    expect(calls[0]!.body.max_tokens).toBe(1500)
  })
  it('reports provider errors in plain words', async () => {
    const f = (async () => new Response('', { status: 401 })) as typeof fetch
    await expect(
      analyze(settings, toMailMessage(header, full), userContext(accounts), f),
    ).rejects.toThrow(/rejected the API key/)
  })
})

describe('extension package', () => {
  it('manifest asks only for what it uses and has no send permission', () => {
    const m = JSON.parse(readFileSync('thunderbird/manifest.json', 'utf8'))
    expect([...m.permissions].sort()).toEqual([
      'accountsRead',
      'alarms',
      'compose',
      'messagesRead',
      'notifications',
      'storage',
    ])
    expect(m.manifest_version).toBe(3)
    for (const path of [
      m.background.scripts[0],
      m.message_display_action.default_popup,
      m.options_ui.page,
      m.action.default_popup,
    ])
      expect(existsSync(`thunderbird/${path}`), path).toBe(true)
  })
  it('the built bundle needs no eval (extension CSP) and no Node modules', () => {
    for (const f of ['popup', 'options', 'background', 'brief-popup']) {
      const js = readFileSync(`thunderbird/dist/${f}.js`, 'utf8')
      expect(js).not.toMatch(/new Function\(|\beval\(|from "node:|require\("node:/)
    }
  })
})

describe('daily brief in the extension', () => {
  const now = new Date('2026-10-27T07:30:00Z')
  const hdr = (id: number, author: string, subject: string, over = {}) => ({
    id,
    headerMessageId: `m${id}@x`,
    author,
    recipients: ['Priya <priya@corp.example>'],
    ccList: [],
    subject,
    date: new Date('2026-10-27T05:00:00Z'),
    read: false,
    ...over,
  })
  const plain = (text: string, headers: Record<string, string[]> = {}) => ({
    contentType: 'text/plain',
    body: text,
    headers,
  })
  function setup() {
    const store = new Map<string, unknown>()
    const bodies: Record<number, unknown> = {
      1: plain('Please send the final Q3 numbers before 3pm today.'),
      2: plain('Weekly deals!', { 'list-unsubscribe': ['<mailto:u@x>'] }),
      3: plain('I sent this myself.'),
      4: plain('Lunch on Thursday?'),
    }
    const headers = [
      hdr(1, 'Alex Chen <alex@acme.example>', 'Q3 numbers'),
      hdr(2, 'Shop <deals@shop.example>', 'Deals'),
      hdr(3, 'Priya <priya@corp.example>', 'Note to self'),
      hdr(4, 'Sam <sam@corp.example>', 'Lunch'),
    ]
    const api = {
      recent: async () => headers,
      full: async (id: number) => bodies[id],
      accounts: async () => accounts,
      cache: {
        get: async (k: string) => store.get(k) ?? null,
        set: async (k: string, v: unknown) => void store.set(k, v),
        prune: async () => undefined,
      },
    }
    const prompts: string[] = []
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: { content: string }[] }
      const [sys, user] = [body.messages[0]!.content, body.messages[1]!.content]
      prompts.push(user)
      const content = sys.includes('morning email brief')
        ? JSON.stringify({
            headline: 'Alex needs Q3 numbers by 3pm.',
            sections: [
              {
                type: 'topPriorities',
                items: [{ text: 'Send Q3 numbers to Alex', emailIds: ['e1', 'e99'] }],
              },
              { type: 'fyi', items: [{ text: 'Invented item', emailIds: ['e77'] }] },
            ],
          })
        : JSON.stringify({
            results: [
              {
                id: 'e1',
                category: 'workRequest',
                importance: 'high',
                urgency: 'urgent',
                needsReply: true,
                summary: 'Alex wants Q3 numbers before 3pm.',
                reason: 'r',
                actionItems: [{ text: 'Send Q3 numbers', dueDate: null, dueText: 'today 3pm' }],
                confidence: 0.9,
              },
              {
                id: 'e2',
                category: 'social',
                importance: 'low',
                urgency: 'notUrgent',
                needsReply: false,
                summary: 'Lunch invite.',
                reason: 'r',
                actionItems: [],
                confidence: 0.8,
              },
            ],
          })
      return new Response(
        JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: {} }),
      )
    }) as typeof fetch
    return { api, fetchImpl, prompts, store }
  }

  it('skips own and list mail, asks the AI only about the rest, and links only to real mail', async () => {
    const { api, fetchImpl, prompts } = setup()
    const b = await generateBrief({
      api,
      settings,
      ctx: userContext(accounts, now),
      now,
      fetchImpl,
    })
    // one triage call for messages 1 and 4, one brief call
    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain('Please send the final Q3 numbers')
    expect(prompts[0]).not.toContain('Weekly deals')
    expect(prompts[0]).not.toContain('I sent this myself')
    // the brief sees summaries, never bodies
    expect(prompts[1]).toContain('Alex wants Q3 numbers before 3pm.')
    expect(prompts[1]).not.toContain('Please send the final Q3 numbers')
    expect(b.headline).toBe('Alex needs Q3 numbers by 3pm.')
    expect(b.sections).toEqual([
      { type: 'topPriorities', items: [{ text: 'Send Q3 numbers to Alex', messageIds: ['1'] }] },
    ])
    expect(b.stats).toMatchObject({ total: 3, needsReply: 1, p1: 1, newsletters: 1 })
    expect(b.heads['1'].subject).toBe('Q3 numbers')
  })

  it('reuses stored results: a second run only calls the AI for the brief', async () => {
    const { api, fetchImpl, prompts } = setup()
    await generateBrief({ api, settings, ctx: userContext(accounts, now), now, fetchImpl })
    prompts.length = 0
    await generateBrief({ api, settings, ctx: userContext(accounts, now), now, fetchImpl })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('id=e1')
  })

  it('makes no AI call and says nothing new when only list mail arrived', async () => {
    const { api, fetchImpl, prompts } = setup()
    api.recent = async () => [hdr(2, 'Shop <deals@shop.example>', 'Deals')]
    const b = await generateBrief({
      api,
      settings,
      ctx: userContext(accounts, now),
      now,
      fetchImpl,
    })
    expect(prompts).toHaveLength(0)
    expect(b).toMatchObject({ headline: '', sections: [], stats: { total: 1, newsletters: 1 } })
  })

  it('ranks urgent mail first, counts bulk mail without listing it, and caps the list', () => {
    const t = (o: object) => ({
      category: 'workRequest',
      importance: 'low',
      urgency: 'notUrgent',
      needsReply: false,
      summary: 's',
      actionItems: [],
      ...o,
    })
    const rows = [
      { id: 1, at: new Date(1), t: t({ importance: 'low' }) },
      { id: 2, at: new Date(2), t: t({ importance: 'high', urgency: 'urgent' }) },
      { id: 3, at: new Date(3), t: t({ category: 'newsletterMarketing' }) },
      { id: 4, at: new Date(4), t: t({ needsReply: true }) },
    ]
    const { stats, emails } = selectForBrief(rows, { max: 2 })
    expect(emails.map((e: { messageId: string }) => e.messageId)).toEqual(['2', '4'])
    expect(stats).toMatchObject({ total: 4, p1: 1, newsletters: 1, needsReply: 1 })
  })

  it('schedules the next run today or tomorrow', () => {
    expect(nextRun(new Date(2026, 9, 27, 7, 0), 8)).toEqual(new Date(2026, 9, 27, 8, 0))
    expect(nextRun(new Date(2026, 9, 27, 9, 0), 8)).toEqual(new Date(2026, 9, 28, 8, 0))
  })
})
