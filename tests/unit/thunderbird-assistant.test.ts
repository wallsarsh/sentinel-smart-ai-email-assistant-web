import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS modules shipped inside the extension
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  monitorBlockedReason,
  normalizeSettings,
  providerConfigured,
} from '../../thunderbird/src/config.js'
// @ts-expect-error plain JS modules shipped inside the extension
import {
  applyAnalysisPolicy,
  isBulkMessage,
  localAnalysis,
  matchRule,
  normalizePattern,
  normalizeRule,
  preFilter,
} from '../../thunderbird/src/rules.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { createStore, memoryArea, triageKey } from '../../thunderbird/src/store.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { normalizeAnalysis } from '../../thunderbird/src/analysis.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { assistantPrompt } from '../../thunderbird/src/prompts.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { analyzeBatch, userContext } from '../../thunderbird/src/ai.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { runMonitor } from '../../thunderbird/src/monitor.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { tagNamesFor, mergeTagKeys } from '../../thunderbird/src/tags.js'
// @ts-expect-error plain JS modules shipped inside the extension
import {
  buildReplyIndex,
  draftEligibility,
  draftRequest,
  maybeCreateDrafts,
  pickIdentity,
  referencedMessageIds,
} from '../../thunderbird/src/drafts.js'
// @ts-expect-error plain JS modules shipped inside the extension
import {
  downloadIcs,
  eventsFromAnalysis,
  icsFilename,
  normalizeEvent,
  toIcs,
  uidFor,
} from '../../thunderbird/src/calendar.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { briefWindow, refreshBrief, shouldRefreshBrief } from '../../thunderbird/src/brief.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { INTENT_LABEL, PRIORITY_LABEL, relativeTime } from '../../thunderbird/src/ui.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { TONE_IDS, toneLabel, toneRequest } from '../../thunderbird/src/tones.js'

const sender = (address: string, name = '') => (name ? { address, name } : { address })
const mail = (over: Record<string, unknown> = {}) => ({
  providerMessageId: '1',
  from: sender('alex@acme.example', 'Alex'),
  subject: 'Q3 numbers',
  bodyText: 'Please send the numbers by Friday.',
  listUnsubscribe: null,
  precedence: null,
  autoSubmitted: null,
  ...over,
})

describe('Thunderbird settings', () => {
  it('merges defaults, clamps values and migrates the old brief settings', () => {
    const s = normalizeSettings(
      { baseUrl: ' https://api.example/v1 ', monitor: { intervalMinutes: 3, maxDraftsPerRun: 99 } },
      { enabled: false, hour: 9 },
    )
    expect(s.baseUrl).toBe('https://api.example/v1')
    expect(s.monitor.intervalMinutes).toBe(15)
    expect(s.monitor.maxDraftsPerRun).toBe(20)
    expect(s.brief).toMatchObject({ enabled: false, hour: 9 })
    expect(s.monitor.autoDraft).toBe(DEFAULT_SETTINGS.monitor.autoDraft)
  })

  it('does not mutate the input and normalises profile/priority values', () => {
    const raw = { profile: { tone: 'shouty' }, monitor: { draftMinPriority: 'p9' } }
    const s = normalizeSettings(raw)
    expect(s.profile.tone).toBe('professional')
    expect(s.monitor.draftMinPriority).toBe('p2_today')
    expect(raw).toEqual({ profile: { tone: 'shouty' }, monitor: { draftMinPriority: 'p9' } })
  })

  it('explains what blocks a monitor run', () => {
    expect(providerConfigured(normalizeSettings({}))).toBe(false)
    expect(monitorBlockedReason(normalizeSettings({}))).toMatch(/API URL/)
    expect(
      monitorBlockedReason(
        normalizeSettings({ baseUrl: 'http://example.com', apiKey: 'k', model: 'm' }),
      ),
    ).toMatch(/https/)
    expect(
      monitorBlockedReason(
        normalizeSettings({ baseUrl: 'http://localhost:11434/v1', apiKey: 'k', model: 'm' }),
      ),
    ).toBeNull()
  })

  it('merges a settings patch without losing the provider key', () => {
    const current = normalizeSettings({ baseUrl: 'https://x/v1', apiKey: 'secret', model: 'm' })
    const next = mergeSettings(current, { monitor: { enabled: false } })
    expect(next.apiKey).toBe('secret')
    expect(next.monitor.enabled).toBe(false)
    expect(next.model).toBe('m')
  })
})

describe('sender rules', () => {
  it('normalises addresses, domains and subdomains', () => {
    expect(normalizePattern('Alex <Alex@Acme.Example>')).toBe('alex@acme.example')
    expect(normalizePattern('acme.example')).toBe('@acme.example')
    expect(normalizePattern('@acme.example')).toBe('@acme.example')
    expect(normalizePattern('@*.acme.example')).toBe('@*.acme.example')
    expect(() => normalizePattern('not a pattern')).toThrow()
  })

  it('prefers an exact address over a domain rule', () => {
    const rules = [
      normalizeRule({ pattern: '@acme.example', kind: 'marketing' }),
      normalizeRule({ pattern: 'alex@acme.example', kind: 'important' }),
    ]
    expect(matchRule('Alex <alex@acme.example>', rules)?.kind).toBe('important')
  })

  it('breaks ties ignore > important > marketing > normal', () => {
    const base = normalizeRule({ pattern: '@acme.example', kind: 'normal' })
    const important = { ...base, id: 'b', kind: 'important' }
    const ignore = { ...base, id: 'c', kind: 'ignore' }
    expect(matchRule('x@acme.example', [important, ignore])?.kind).toBe('ignore')
    const marketing = { ...base, id: 'd', kind: 'marketing' }
    expect(matchRule('x@acme.example', [marketing, important])?.kind).toBe('important')
  })

  it('matches subdomains only when asked and never the bare domain', () => {
    const rules = [normalizeRule({ pattern: '@*.acme.example', kind: 'important' })]
    expect(matchRule('a@eu.acme.example', rules)?.kind).toBe('important')
    expect(matchRule('a@acme.example', rules)).toBeNull()
  })

  it('pre-filters ignored, marketing, security, bulk and automated senders locally', () => {
    const now = new Date('2026-11-02T10:00:00Z')
    const ignore = [normalizeRule({ pattern: 'alex@acme.example', kind: 'ignore' })]
    expect(preFilter(mail(), ignore, {}, now)).toMatchObject({
      action: 'local',
      analysis: { summary: 'Ignored by a sender rule.', skipped: true },
    })

    const marketing = [normalizeRule({ pattern: '@shop.example', kind: 'marketing' })]
    expect(
      preFilter(mail({ from: sender('deals@shop.example') }), marketing, {}, now).action,
    ).toBe('local')
    expect(
      preFilter(
        mail({ from: sender('deals@shop.example') }),
        marketing,
        { monitor: { analyzeMarketing: true } },
        now,
      ).action,
    ).toBe('analyze')

    expect(preFilter(mail({ listUnsubscribe: '<mailto:x@y>' }), [], {}, now)).toMatchObject({
      action: 'local',
      analysis: { category: 'newsletterMarketing', intent: 'marketing' },
    })
    expect(
      preFilter(mail({ subject: 'Your password reset code' }), [], {}, now),
    ).toMatchObject({ action: 'local', analysis: { category: 'securityAccount' } })
    expect(
      preFilter(mail({ from: sender('no-reply@acme.example') }), [], {}, now),
    ).toMatchObject({ action: 'local', analysis: { intent: 'notification' } })
  })

  it('prioritises an important sender and computes priority in code', () => {
    const rules = [normalizeRule({ pattern: '@acme.example', kind: 'important' })]
    const p = preFilter(mail(), rules, {}, new Date())
    expect(p).toMatchObject({ action: 'analyze', boostImportance: true })
    const a = applyAnalysisPolicy(
      { importance: 'low', urgency: 'urgent', category: 'workRequest' },
      p,
    )
    expect(a).toMatchObject({ importance: 'high', urgency: 'urgent', priority: 'p1_do_now' })
  })

  it('detects bulk headers without content', () => {
    expect(isBulkMessage({ precedence: 'Bulk' })).toBe(true)
    expect(isBulkMessage({ autoSubmitted: 'auto-generated' })).toBe(true)
    expect(isBulkMessage({ autoSubmitted: 'no' })).toBe(false)
    expect(isBulkMessage({})).toBe(false)
  })

  it('produces a complete local analysis for ignored mail', () => {
    const a = localAnalysis(mail(), 'ignore', new Date('2026-11-02T10:00:00Z'))
    expect(a).toMatchObject({
      category: 'other',
      importance: 'low',
      needsReply: false,
      intent: 'other',
      by: 'rule',
      skipped: true,
      actionItems: [],
      calendarEvents: [],
    })
  })
})

describe('Thunderbird extended analysis', () => {
  const accounts = [{ identities: [{ name: 'Priya', email: 'priya@corp.example' }] }]
  const settings = { baseUrl: 'https://api.example/v1', apiKey: 'k', model: 'm' }
  const message = {
    providerMessageId: '7',
    providerThreadId: null,
    internetMessageId: 'm7@x',
    from: sender('alex@acme.example', 'Alex'),
    to: [{ address: 'priya@corp.example' }],
    cc: [],
    subject: 'Q3 numbers',
    sentAt: new Date('2026-11-02T09:00:00Z'),
    receivedAt: new Date('2026-11-02T09:00:00Z'),
    isRead: false,
    bodyText: 'Can you send the numbers by Friday?',
    bodyHtml: null,
    attachmentNames: [],
    references: [],
    listUnsubscribe: null,
    precedence: null,
    autoSubmitted: null,
  }
  const valid = {
    id: 'e1',
    category: 'workRequest',
    importance: 'medium',
    urgency: 'urgent',
    needsReply: true,
    summary: 'Alex needs the Q3 numbers.',
    reason: 'direct ask',
    actionItems: [{ text: 'Send Q3 numbers', dueDate: '2026-11-06', dueText: null }],
    confidence: 0.8,
    intent: 'request',
    replyIntent: 'accept',
    replyInstruction: '',
    calendarEvents: [],
  }

  it('normalises a result and derives priority, intent and reply intent', () => {
    const a = normalizeAnalysis({
      category: 'meetingCalendar',
      importance: 'high',
      urgency: 'notUrgent',
      needsReply: false,
      summary: '  A meeting next week.  ',
      reason: 'calendar',
      actionItems: [],
      confidence: 2,
    })
    expect(a).toMatchObject({
      intent: 'meeting',
      replyIntent: 'acknowledge',
      priority: 'p2_today',
      confidence: 1,
      calendarEvents: [],
    })
    expect(a.summary).toBe('A meeting next week.')
  })

  it('publishes a versioned prompt with the extra fields', () => {
    expect(assistantPrompt.version).toBe('assistant.v1')
    expect(assistantPrompt.system).toMatch(/untrusted/i)
    const item = assistantPrompt.schema.schema.properties.results.items
    expect(item.required).toEqual(
      expect.arrayContaining([
        'intent',
        'replyIntent',
        'replyInstruction',
        'calendarEvents',
        'actionItems',
      ]),
    )
  })

  it('maps ids, drops invented ids and returns the normalised result', async () => {
    const calls: unknown[] = []
    const f = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)))
      const content = JSON.stringify({ results: [valid, { ...valid, id: 'e99' }] })
      return new Response(
        JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: {} }),
      )
    }) as typeof fetch
    const out = await analyzeBatch(settings, [message as never], userContext(accounts), f)
    expect([...out.keys()]).toEqual(['7'])
    expect(out.get('7')).toMatchObject({
      intent: 'request',
      priority: 'p2_today',
      needsReply: true,
      replyIntent: 'accept',
    })
    expect(calls).toHaveLength(1)
    const user = (calls[0] as { messages: { content: string }[] }).messages[1].content
    expect(user).toContain('Can you send the numbers')
    expect(user).toContain('subject: Q3 numbers')
  })
})

describe('Thunderbird monitor', () => {
  const now = new Date('2026-11-02T10:00:00Z')
  const settings = normalizeSettings({
    baseUrl: 'https://api.example/v1',
    apiKey: 'k',
    model: 'm',
    monitor: { maxMessagesPerRun: 20, maxAiMessagesPerRun: 10, lookbackDays: 3 },
  })
  const ctx = { selfAddresses: new Set(['me@corp.example']) }
  const header = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    headerMessageId: `m${id}@x`,
    author: `Sender ${id} <s${id}@acme.example>`,
    recipients: ['Priya <me@corp.example>'],
    ccList: [],
    subject: `Message ${id}`,
    date: new Date(now.getTime() - 60_000),
    read: false,
    folder: { accountId: 'acct1' },
    ...over,
  })
  const full = (text = 'Please reply.') => ({ contentType: 'text/plain', body: text })
  const generated = (over: Record<string, unknown> = {}) => ({
    category: 'workRequest',
    importance: 'medium',
    urgency: 'urgent',
    needsReply: true,
    summary: 'Needs a reply.',
    reason: 'direct ask',
    actionItems: [],
    confidence: 0.8,
    intent: 'request',
    replyIntent: 'acknowledge',
    replyInstruction: '',
    calendarEvents: [],
    ...over,
  })
  const setup = (headers: ReturnType<typeof header>[], bodies: Record<number, unknown> = {}) => {
    const store = createStore(memoryArea())
    const calls: string[][] = []
    const analyze = async (_s: unknown, messages: { providerMessageId: string }[]) => {
      calls.push(messages.map((m) => String(m.providerMessageId)))
      return new Map(messages.map((m) => [String(m.providerMessageId), generated()]))
    }
    const api = {
      recent: async () => headers,
      full: async (id: number) => bodies[id] ?? full(),
    }
    return { store, calls, analyze, api }
  }

  it('reuses cache, drops self/old mail and classifies ignored/bulk locally', async () => {
    const headers = [
      header(1),
      header(2, { author: 'Me <me@corp.example>' }),
      header(3, { date: new Date(now.getTime() - 10 * 24 * 3600_000) }),
      header(4, { author: 'Ignore <ignore@shop.example>' }),
      header(5, { author: 'Deals <deals@shop.example>' }),
      header(6),
    ]
    const { store, calls, analyze, api } = setup(headers, {
      5: { contentType: 'text/plain', body: 'Weekly deals', headers: { 'list-unsubscribe': ['<mailto:u@x>'] } },
    })
    await store.saveAnalysis(headers[0]!, { summary: 'cached', at: now.getTime() })
    const rules = [
      normalizeRule({ pattern: 'ignore@shop.example', kind: 'ignore' }),
      normalizeRule({ pattern: '@shop.example', kind: 'marketing' }),
    ]
    const r = await runMonitor({ store, api, settings, rules, ctx, now, analyze })
    expect(calls).toEqual([['6']])
    expect(r.status).toMatchObject({ state: 'done', processed: 4, cached: 1, local: 2, analysed: 3 })
    expect((await store.analysis(headers[3]!))?.skipped).toBe(true)
    expect((await store.analysis(headers[4]!))?.category).toBe('newsletterMarketing')
    expect((await store.analysis(headers[5]!))?.priority).toBe('p2_today')
  })

  it('caps AI work, prioritises important senders and leaves lastScanAt pending', async () => {
    const headers = Array.from({ length: 10 }, (_, i) => header(i + 1))
    const small = normalizeSettings({
      ...settings,
      monitor: { ...settings.monitor, maxAiMessagesPerRun: 3, maxMessagesPerRun: 10 },
    })
    const { store, calls, analyze, api } = setup(headers)
    const rules = [normalizeRule({ pattern: 's10@acme.example', kind: 'important' })]
    const r = await runMonitor({ store, api, settings: small, rules, ctx, now, analyze })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toHaveLength(3)
    expect(calls[0]![0]).toBe('10')
    expect(r.status).toMatchObject({ state: 'done', analysed: 3, pending: 7, lastScanAt: null })
    const a = await store.analysis(headers[9]!)
    expect(a).toMatchObject({ importance: 'high', priority: 'p1_do_now', ruleKind: 'important' })
  })

  it('keeps earlier batches and reports a partial run', async () => {
    const headers = Array.from({ length: 9 }, (_, i) => header(i + 1))
    const { store, api } = setup(headers)
    let calls = 0
    const analyze = async (_s: unknown, messages: { providerMessageId: string }[]) => {
      calls++
      if (calls === 2) throw new Error('The provider rejected the API key.')
      return new Map(messages.map((m) => [String(m.providerMessageId), generated()]))
    }
    const r = await runMonitor({ store, api, settings, ctx, now, analyze })
    expect(calls).toBe(2)
    expect(r.status).toMatchObject({
      state: 'partial',
      analysed: 8,
      error: 'The provider rejected the API key.',
      lastScanAt: null,
    })
    expect(await store.analysis(headers[0]!)).toBeTruthy()
  })

  it('tags best effort and never loses an analysis when tagging fails', async () => {
    const headers = [header(1)]
    const { store, analyze, api } = setup(headers)
    const tag = async () => {
      throw new Error('no tag permission')
    }
    const r = await runMonitor({ store, api, settings, ctx, now, analyze, tag })
    expect(r.status.tagWarning).toMatch(/tag/)
    expect(await store.analysis(headers[0]!)).toMatchObject({ summary: 'Needs a reply.' })
  })

  it('keeps a cursor that does not skip older mail when the header cap was hit', async () => {
    const headers = [header(1), header(2), header(3)]
    const small = normalizeSettings({
      ...settings,
      monitor: { ...settings.monitor, maxMessagesPerRun: 2 },
    })
    const { store, analyze, api } = setup(headers)
    const r = await runMonitor({ store, api, settings: small, ctx, now, analyze })
    expect(r.status.truncated).toBe(true)
    expect(new Date(r.status.lastScanAt).getTime()).toBeLessThan(headers[2]!.date.getTime())
  })

  it('maps tags deterministically and preserves the user tags', () => {
    expect(tagNamesFor({ priority: 'p1_do_now', needsReply: true })).toEqual([
      'Sentinel P1',
      'Sentinel Reply',
    ])
    expect(tagNamesFor({ priority: 'p4_fyi', needsReply: false, skipped: true, intent: 'other' })).toEqual([
      'Sentinel P4',
      'Sentinel Ignored',
    ])
    expect(mergeTagKeys(['$label1', 'mine'], ['sentinel1'], ['sentinel0'])).toEqual([
      '$label1',
      'mine',
      'sentinel1',
    ])
  })
})

describe('Thunderbird drafts', () => {
  const now = new Date('2026-11-02T10:00:00Z')
  const settings = normalizeSettings({
    baseUrl: 'https://api.example/v1',
    apiKey: 'k',
    model: 'm',
    monitor: { autoDraft: true, maxDraftsPerRun: 2, draftMinPriority: 'p2_today' },
    profile: { tone: 'friendly' },
  })
  const header = (id = 1, over: Record<string, unknown> = {}) => ({
    id,
    headerMessageId: `m${id}@x`,
    author: `Sender ${id} <s${id}@acme.example>`,
    subject: `Message ${id}`,
    date: new Date(now.getTime() - 3600_000),
    folder: { accountId: 'acct1' },
    ...over,
  })
  const analysis = (over: Record<string, unknown> = {}) => ({
    category: 'workRequest',
    importance: 'high',
    urgency: 'urgent',
    priority: 'p1_do_now',
    needsReply: true,
    summary: 'Needs a reply.',
    actionItems: [],
    skipped: false,
    replyIntent: 'accept',
    replyInstruction: '',
    ...over,
  })

  it('picks the identity that belongs to the message account', () => {
    const account = {
      identities: [
        { id: 'other', email: 'other@elsewhere.test' },
        { id: 'work', email: 'priya@corp.example' },
      ],
    }
    expect(pickIdentity(account, header(1, { recipients: ['Priya <priya@corp.example>'] }))).toMatchObject({
      id: 'work',
    })
    expect(pickIdentity({ identities: [] }, header(1))).toBeNull()
  })

  it('reads In-Reply-To and References into a reply index', () => {
    const full = {
      headers: {
        'in-reply-to': ['<m1@x>'],
        references: ['<m0@x> <m1@x>'],
      },
    }
    expect([...referencedMessageIds(full)].sort()).toEqual(['m0@x', 'm1@x'])
    expect(buildReplyIndex([{ full }]).has('m1@x')).toBe(true)
    expect(
      [...referencedMessageIds({ headers: { 'In-Reply-To': '<m2@x>', References: 'x <m3@x>' } })].sort(),
    ).toEqual(['m2@x', 'm3@x'])
  })

  it('refuses drafts for filtered, low-priority, old, replied or already-drafted mail', () => {
    const h = header()
    const base = { analysis: analysis(), header: h, settings, now }
    expect(draftEligibility(base)).toMatchObject({ ok: true })
    expect(
      draftEligibility({ ...base, settings: normalizeSettings({ monitor: { autoDraft: false } }) }),
    ).toMatchObject({ ok: false, reason: /off/ })
    expect(draftEligibility({ ...base, analysis: analysis({ skipped: true }) })).toMatchObject({
      ok: false,
    })
    expect(draftEligibility({ ...base, analysis: analysis({ needsReply: false }) })).toMatchObject({
      ok: false,
    })
    expect(
      draftEligibility({ ...base, analysis: analysis({ category: 'newsletterMarketing' }) }),
    ).toMatchObject({ ok: false })
    expect(
      draftEligibility({ ...base, analysis: analysis({ priority: 'p3_this_week' }) }),
    ).toMatchObject({ ok: false })
    expect(draftEligibility({ ...base, replied: true })).toMatchObject({ ok: false })
    expect(draftEligibility({ ...base, draftRecord: { status: 'saved', at: now.getTime() } })).toMatchObject({
      ok: false,
    })
    expect(
      draftEligibility({ ...base, header: header(1, { date: new Date(now - 20 * 86400_000) }) }),
    ).toMatchObject({ ok: false })
  })

  it('uses the profile tone and custom instruction', () => {
    expect(draftRequest(analysis(), settings)).toEqual({
      tone: 'friendly',
      intent: 'accept',
    })
    expect(
      draftRequest(analysis({ replyIntent: 'custom', replyInstruction: 'Say I will call.' }), settings),
    ).toEqual({ tone: 'friendly', intent: 'custom', instruction: 'Say I will call.' })
  })

  it('creates at most the cap, logs the draft and never repeats it', async () => {
    const store = createStore(memoryArea())
    const analyses = Array.from({ length: 4 }, (_, i) => ({
      header: header(i + 1),
      message: { providerMessageId: String(i + 1) },
      analysis: analysis(),
    }))
    const generated: number[] = []
    const generatedDrafts: number[] = []
    const generate = async (_s: unknown, _m: unknown, _c: unknown, req: { tone: string }) => {
      generated.push(req.tone === 'friendly' ? 1 : 0)
      return 'Thanks.'
    }
    const save = async (h: { id: number }) => {
      generatedDrafts.push(h.id)
      return { id: 100 + h.id, headerMessageId: `draft-${h.id}@x` }
    }
    const first = await maybeCreateDrafts({
      analyses,
      settings,
      ctx: {},
      store,
      generate,
      save,
      now,
    })
    expect(first.created).toHaveLength(2)
    expect(generated).toEqual([1, 1])
    expect(generatedDrafts).toEqual([1, 2])
    expect(await store.drafts()).toHaveLength(2)
    expect((await store.drafts())[0]).toMatchObject({ status: 'saved', accountId: 'acct1' })

    const second = await maybeCreateDrafts({
      analyses,
      settings,
      ctx: {},
      store,
      generate,
      save,
      now,
    })
    expect(second.created.map((d: { messageId: number }) => d.messageId)).toEqual([3, 4])
    const third = await maybeCreateDrafts({
      analyses,
      settings,
      ctx: {},
      store,
      generate,
      save,
      now,
    })
    expect(third.created).toHaveLength(0)
  })

  it('does not draft a message already replied to and records a failed save', async () => {
    const store = createStore(memoryArea())
    const analyses = [
      { header: header(1), message: { providerMessageId: '1' }, analysis: analysis() },
      { header: header(2), message: { providerMessageId: '2' }, analysis: analysis() },
    ]
    const r = await maybeCreateDrafts({
      analyses,
      settings,
      ctx: {},
      store,
      isReplied: async (h: { id: number }) => h.id === 1,
      generate: async () => 'Thanks.',
      save: async (h: { id: number }) => {
        if (h.id === 2) throw new Error('The Drafts folder is read-only.')
        return { id: 9 }
      },
      now,
    })
    expect(r.created).toHaveLength(0)
    expect(r.failed).toHaveLength(1)
    expect((await store.drafts())[0]).toMatchObject({
      status: 'failed',
      error: 'The Drafts folder is read-only.',
    })
  })
})

describe('Thunderbird calendar', () => {
  const now = new Date('2026-11-02T10:00:00Z')

  it('normalises timed and all-day events and drops invalid dates', () => {
    expect(
      normalizeEvent({
        title: 'Board call',
        start: '2026-11-03T10:00:00+01:00',
        end: '2026-11-03T11:00:00+01:00',
        allDay: false,
        location: 'Room 3',
      }),
    ).toMatchObject({
      title: 'Board call',
      start: '2026-11-03T09:00:00.000Z',
      end: '2026-11-03T10:00:00.000Z',
      allDay: false,
      location: 'Room 3',
    })
    expect(
      normalizeEvent({ title: 'Send numbers', start: '2026-11-06', allDay: true }),
    ).toMatchObject({ start: '2026-11-06', allDay: true })
    expect(normalizeEvent({ title: 'Broken', start: 'not a date' })).toBeNull()
    expect(normalizeEvent({ title: '', start: '2026-11-06' })).toBeNull()
  })

  it('uses explicit events and dated action items as candidates', () => {
    const header = { headerMessageId: 'm1@x' }
    const explicit = eventsFromAnalysis(
      {
        calendarEvents: [
          {
            title: 'Board call',
            start: '2026-11-03T10:00:00Z',
            end: null,
            allDay: false,
            location: null,
            description: null,
          },
        ],
        actionItems: [{ text: 'Send numbers', dueDate: '2026-11-06' }],
      },
      { header, now },
    )
    expect(explicit).toHaveLength(2)
    expect(explicit[0]).toMatchObject({ title: 'Board call', sourceMessageId: 'm1@x' })
    expect(explicit[1]).toMatchObject({ title: 'Send numbers', allDay: true })

    const fallback = eventsFromAnalysis(
      {
        calendarEvents: [],
        actionItems: [
          { text: 'Send numbers', dueDate: '2026-11-06', dueText: 'Friday' },
          { text: 'Call later', dueDate: null, dueText: 'soon' },
        ],
        summary: 'Alex needs the numbers.',
      },
      { header, now },
    )
    expect(fallback).toHaveLength(1)
    expect(fallback[0]).toMatchObject({
      title: 'Send numbers',
      start: '2026-11-06',
      allDay: true,
      sourceMessageId: 'm1@x',
    })
  })

  it('writes escaped, folded RFC 5545 with stable UIDs', () => {
    const events = [
      {
        title: 'Send Q3, numbers; today',
        start: '2026-11-06',
        end: null,
        allDay: true,
        location: 'Room 3',
        description: 'Line one\nline two',
        sourceMessageId: 'm1@x',
      },
      {
        title: 'Board call',
        start: '2026-11-03T10:00:00Z',
        end: null,
        allDay: false,
        location: null,
        description: null,
        sourceMessageId: 'm2@x',
      },
    ]
    const ics = toIcs(events, { now })
    expect(ics).toContain('BEGIN:VCALENDAR\r\n')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261106')
    expect(ics).toContain('DTEND;VALUE=DATE:20261107')
    expect(ics).toContain('SUMMARY:Send Q3\\, numbers\\; today')
    expect(ics).toContain('DESCRIPTION:Line one\\nline two')
    expect(ics).toContain('DTSTART:20261103T100000Z')
    expect(ics).toContain('DTEND:20261103T110000Z')
    expect(ics).toContain(`UID:${uidFor(events[0])}`)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true)
  })

  it('names the file and refuses an empty download', async () => {
    expect(icsFilename(now)).toBe('sentinel-2026-11-02.ics')
    await expect(downloadIcs([], { now })).rejects.toThrow(/no calendar/i)
  })
})

describe('Thunderbird brief refresh', () => {
  const now = new Date(2026, 10, 2, 10, 0, 0)
  const settings = normalizeSettings({
    baseUrl: 'https://api.example/v1',
    apiKey: 'k',
    model: 'm',
    brief: { enabled: true, hour: 8 },
  })
  const ctx = { selfAddresses: new Set(['me@corp.example']), name: 'Priya', timezoneName: 'UTC', offsetAt: () => 0, now }

  it('starts the daily window at local midnight', () => {
    expect(briefWindow(now)).toEqual(new Date(2026, 10, 2, 0, 0, 0))
  })

  it('refreshes for new mail, a new day or an explicit request only', () => {
    const today = { windowStart: new Date(2026, 10, 2, 0, 0, 0).toISOString() }
    expect(shouldRefreshBrief({ brief: today, analyses: [], now })).toBe(false)
    expect(shouldRefreshBrief({ brief: today, analyses: [{}], now })).toBe(true)
    expect(shouldRefreshBrief({ brief: today, analyses: [], now, force: true })).toBe(true)
    expect(shouldRefreshBrief({ brief: today, analyses: [], now, enabled: false })).toBe(false)
    expect(shouldRefreshBrief({ brief: null, analyses: [], now })).toBe(true)
    const yesterday = { windowStart: new Date(2026, 10, 1, 0, 0, 0).toISOString() }
    expect(shouldRefreshBrief({ brief: yesterday, analyses: [], now })).toBe(true)
  })

  it('stores a current, empty brief without an AI call when there is no mail', async () => {
    const store = createStore(memoryArea())
    let calls = 0
    const api = {
      recent: async () => [],
      full: async () => ({}),
      cache: {
        get: async () => null,
        set: async () => undefined,
        prune: async () => undefined,
      },
    }
    const r = await refreshBrief({
      store,
      api,
      settings,
      ctx,
      now,
      fetchImpl: (async () => {
        calls++
        throw new Error('should not call')
      }) as typeof fetch,
    })
    expect(calls).toBe(0)
    expect(r.status).toMatchObject({ state: 'done' })
    expect(r.brief).toMatchObject({ headline: '', sections: [], model: null })
    expect(new Date(r.brief.windowStart).toDateString()).toBe(now.toDateString())
    expect(await store.briefStatus()).toMatchObject({ state: 'done' })
  })

  it('records a content-free error and keeps the previous brief', async () => {
    const store = createStore(memoryArea({ brief: { headline: 'old' } }))
    const api = {
      recent: async () => {
        throw new Error('No inbox folders found.')
      },
    }
    const r = await refreshBrief({ store, api, settings, ctx, now })
    expect(r.status).toMatchObject({ state: 'error', message: 'No inbox folders found.' })
    expect(r.brief).toEqual({ headline: 'old' })
  })
})

describe('Thunderbird surfaces and safety', () => {
  const read = (p: string) => readFileSync(p, 'utf8')

  it('has no send permission or send call in the extension', () => {
    const manifest = JSON.parse(read('thunderbird/manifest.json'))
    expect(manifest.permissions).not.toContain('compose.send')
    expect(manifest.permissions).not.toContain('messages.send')
    const sources = readdirSync('thunderbird/src')
      .filter((f) => f.endsWith('.js'))
      .map((f) => read(`thunderbird/src/${f}`))
      .join('\n')
    expect(sources).not.toMatch(/compose\.sendMessage|messages\.sendMessage|compose\.send\b/)
    expect(sources).not.toMatch(/\.sendMail\b|drafts\/send|messages\/send/)
  })

  it('uses the shared stylesheet on every page and no inline style blocks', () => {
    for (const page of ['popup.html', 'dashboard.html', 'brief.html', 'options.html', 'compose.html']) {
      const html = read(`thunderbird/src/${page}`)
      expect(html).toContain('href="theme.css"')
      expect(html).not.toContain('<style')
      expect(html).not.toContain('onclick=')
    }
    expect(read('thunderbird/src/ui.js')).toContain("getURL('dist/dashboard.html')")
    const css = read('thunderbird/src/theme.css')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('prefers-reduced-motion')
    expect(css).toContain('prefers-color-scheme')
    expect(css).toContain('forced-colors')
  })

  it('never inserts untrusted text with HTML sinks', () => {
    for (const file of readdirSync('thunderbird/src').filter((f) => f.endsWith('.js'))) {
      const src = read(`thunderbird/src/${file}`)
      expect(src, file).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/)
      expect(src, file).not.toMatch(/new Function\(|\beval\(/)
    }
  })

  it('offers standard and expressive tones without changing the send path', () => {
    expect(TONE_IDS).toEqual(
      expect.arrayContaining(['standard', 'professional', 'creative', 'casual', 'apologetic']),
    )
    expect(toneLabel('creative')).toBe('Creative')
    expect(toneRequest('standard', { intent: 'accept' })).toEqual({
      tone: 'professional',
      intent: 'accept',
    })
    expect(toneRequest('casual', { intent: 'acknowledge', instruction: 'Mention Friday.' })).toMatchObject({
      tone: 'friendly',
      intent: 'acknowledge',
    })
    expect(toneRequest('casual').instruction).toMatch(/conversational/i)
  })

  it('exposes readable labels and relative times', () => {
    expect(PRIORITY_LABEL.p1_do_now).toMatch(/P1/)
    expect(INTENT_LABEL.meeting).toBe('Meeting')
    const now = new Date('2026-11-02T10:00:00Z')
    expect(relativeTime(new Date('2026-11-02T09:55:00Z'), now)).toBe('5 min ago')
    expect(relativeTime(new Date('2026-11-02T07:00:00Z'), now)).toBe('3 h ago')
  })
})

describe('Thunderbird storage', () => {  it('saves normalised settings and removes the legacy key', async () => {
    const area = memoryArea({ briefSettings: { enabled: false, hour: 9 } })
    const store = createStore(area)
    const s = await store.saveSettings({ baseUrl: 'https://x.example/v1', monitor: { enabled: false } })
    expect(s.monitor.enabled).toBe(false)
    expect(await area.get('briefSettings')).toEqual({})
    expect(await store.settings()).toMatchObject({ brief: { enabled: false, hour: 9 } })
  })

  it('skips corrupt rules instead of failing the whole list', async () => {
    const area = memoryArea({ senderRules: [{ pattern: 'ok@x.example', kind: 'ignore' }, { pattern: '' }] })
    const store = createStore(area)
    expect(await store.rules()).toHaveLength(1)
  })

  it('keeps one draft log row per message and caps the log', async () => {
    const store = createStore(memoryArea())
    for (let i = 0; i < 205; i++)
      await store.appendDraft({ messageId: `m${i}`, subject: `s${i}`, at: i })
    const list = await store.drafts()
    expect(list).toHaveLength(200)
    expect(list[0].messageId).toBe('m204')
    await store.appendDraft({ messageId: 'm204', subject: 'updated', at: 999 })
    expect((await store.drafts()).filter((d) => d.messageId === 'm204')).toHaveLength(1)
  })

  it('prunes old analyses, draft records and reply markers', async () => {
    const now = Date.parse('2026-11-02T00:00:00Z')
    const old = now - 15 * 24 * 3600_000
    const veryOld = now - 100 * 24 * 3600_000
    const area = memoryArea({
      [triageKey({ headerMessageId: 'old' })]: { at: old },
      [triageKey({ headerMessageId: 'new' })]: { at: now },
      'sentinel.draft:old': { at: veryOld },
      'sentinel.replied:a:old': { at: old },
    })
    const store = createStore(area)
    await store.prune(now)
    const left = Object.keys(await area.get(null)).sort()
    expect(left).toEqual([triageKey({ headerMessageId: 'new' })])
  })

  it('stores brief and monitor status', async () => {
    const store = createStore(memoryArea())
    await store.saveBrief({ headline: 'h' })
    await store.saveMonitor({ state: 'done' })
    expect(await store.brief()).toEqual({ headline: 'h' })
    expect(await store.monitor()).toEqual({ state: 'done' })
  })
})
