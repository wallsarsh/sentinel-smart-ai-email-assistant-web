import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS modules shipped inside the extension
import {
  awaitingReply,
  buildSentReplyIndex,
  normalizeMessageId,
  withReplyMarker,
} from '../../thunderbird/src/replies.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { refreshBrief, selectForBrief } from '../../thunderbird/src/brief.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { draftEligibility } from '../../thunderbird/src/drafts.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { createStore, memoryArea } from '../../thunderbird/src/store.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { normalizeSettings } from '../../thunderbird/src/config.js'

const now = new Date(2026, 10, 18, 10, 0, 0)
const header = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  headerMessageId: `m${id}@x`,
  author: `Sender ${id} <s${id}@acme.example>`,
  recipients: ['Priya <me@corp.example>'],
  ccList: [],
  subject: `Message ${id}`,
  date: new Date(now.getTime() - id * 60_000),
  read: false,
  ...over,
})
const row = (id: number, t: Record<string, unknown>) => ({
  id,
  at: new Date(now.getTime() - id * 60_000),
  t: {
    sender: `Sender ${id}`,
    summary: `Summary ${id}`,
    category: 'workRequest',
    importance: 'high',
    urgency: 'urgent',
    needsReply: true,
    actionItems: [],
    ...t,
  },
})

describe('sent reply correlation', () => {
  it('maps In-Reply-To and References to the sent message', () => {
    const index = buildSentReplyIndex([
      {
        header: { id: 9, headerMessageId: 'reply@x', date: '2026-11-18T09:00:00.000Z', subject: 'Re: Message 1' },
        full: { headers: { 'in-reply-to': ['<m1@x>'], references: ['<m0@x> <m1@x>'] } },
      },
      {
        header: { id: 10, headerMessageId: 'other@x', date: '2026-11-18T09:30:00.000Z', subject: 'Re: Message 2' },
        full: { headers: { 'In-Reply-To': '<m2@x>' } },
      },
    ])
    expect(index.get('m1@x')).toMatchObject({ sentMessageId: 9, sentAt: '2026-11-18T09:00:00.000Z' })
    expect(index.get('m0@x')).toMatchObject({ sentMessageId: 9 })
    expect(index.get('m2@x')).toMatchObject({ sentMessageId: 10 })
    expect(index.has('m3@x')).toBe(false)
  })

  it('normalises Message-IDs and keeps a marker durable and idempotent', () => {
    expect(normalizeMessageId(' <m1@x> ')).toBe('m1@x')
    const marker = { sentMessageId: 9, sentAt: '2026-11-18T09:00:00.000Z', subject: 'Re: Message 1' }
    const once = withReplyMarker({ needsReply: true }, marker)
    expect(once).toMatchObject({
      replied: true,
      repliedAt: marker.sentAt,
      repliedMessageId: 9,
    })
    expect(withReplyMarker(once, marker)).toBe(once)
    // A missing marker never clears an existing answer.
    expect(withReplyMarker(once, null)).toBe(once)
    expect(awaitingReply({ needsReply: true, replied: true })).toBe(false)
    expect(awaitingReply({ needsReply: true })).toBe(true)
  })

  it('blocks a draft when the stored analysis is already answered', () => {
    const settings = normalizeSettings({ monitor: { autoDraft: true, draftMinPriority: 'p2_today' } })
    const analysis = {
      category: 'workRequest',
      priority: 'p1_do_now',
      needsReply: true,
      replied: true,
      skipped: false,
    }
    expect(draftEligibility({ analysis, header: header(1), settings, now })).toMatchObject({
      ok: false,
      reason: /already exists/,
    })
  })
})

describe('reply-aware brief', () => {
  it('counts replies and does not queue answered mail that needs nothing else', () => {
    const { stats, emails } = selectForBrief([
      row(1, { replied: true, repliedAt: '2026-11-18T09:00:00.000Z' }),
      row(2, {}),
      row(3, { replied: true, actionItems: [{ text: 'Send the signed copy', dueDate: '2026-11-20' }] }),
    ])
    expect(stats).toMatchObject({ total: 3, replied: 2, needsReply: 1 })
    expect(emails.map((e: { messageId: string }) => e.messageId)).toEqual(['2', '3'])
    expect(emails[0]).toMatchObject({ needsReply: true, replied: false })
    expect(emails[1]).toMatchObject({ needsReply: false, replied: true })
    expect(emails[1]?.actions).toEqual(['Send the signed copy (due 2026-11-20)'])
  })

  it('persists the marker from Sent Items while rebuilding the brief', async () => {
    const store = createStore(memoryArea())
    const h = header(1)
    await store.saveAnalysis(h, {
      category: 'workRequest',
      importance: 'high',
      urgency: 'urgent',
      priority: 'p1_do_now',
      needsReply: true,
      summary: 'Needs an answer.',
      reason: 'ask',
      actionItems: [],
      confidence: 0.8,
      intent: 'request',
      replyIntent: 'acknowledge',
      replyInstruction: '',
      calendarEvents: [],
      sender: h.author,
      by: 'ai',
      at: now.getTime(),
    })
    const api = {
      recent: async () => [h],
      full: async () => ({ contentType: 'text/plain', body: 'Please reply.' }),
      repliedMarkers: async () =>
        new Map([
          [
            'm1@x',
            { sentMessageId: 9, sentHeaderMessageId: 'reply@x', sentAt: '2026-11-18T09:00:00.000Z', subject: 'Re: Message 1' },
          ],
        ]),
    }
    const settings = normalizeSettings({
      baseUrl: 'https://api.example/v1',
      apiKey: 'k',
      model: 'm',
      brief: { enabled: true, hour: 8 },
    })
    const ctx = { selfAddresses: new Set(['me@corp.example']), name: 'Priya', timezoneName: 'UTC', offsetAt: () => 0, now }
    const result = await refreshBrief({
      store,
      api,
      settings,
      ctx,
      now,
      summarize: async () => ({ ok: true, value: { headline: 'Today', sections: [] } }),
    })
    expect(result.brief.stats).toMatchObject({ total: 1, replied: 1, needsReply: 0 })
    expect(await store.analysis(h)).toMatchObject({
      replied: true,
      repliedAt: '2026-11-18T09:00:00.000Z',
      repliedMessageId: 9,
    })
  })
})
