import { describe, expect, it } from 'vitest'
import { PromptBuilder } from '../../server/ai/prompts/builder'
import { buildUserContext } from '../../server/ai/user-context'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { settingsSchema } from '../../shared/settings'

describe('writing profile', () => {
  async function setup() {
    const { db } = await createTestDb()
    const user = await authRepo(db).createUser({
      email: 'u@x.io',
      passwordHash: 'h',
      displayName: 'Priya',
      timezone: 'Europe/Berlin',
    })
    return { db, user, r: forUser(db, user.id) }
  }
  const msg = {
    providerMessageId: 'p',
    providerThreadId: null,
    internetMessageId: '<x@y>',
    from: { address: 'alex@acme.example', name: 'Alex' },
    to: [{ address: 'u@x.test' }],
    cc: [],
    subject: 'Hi',
    sentAt: new Date('2026-10-27T07:14:00Z'),
    receivedAt: new Date('2026-10-27T07:14:00Z'),
    isRead: false,
    bodyText: 'Can you do Thursday?',
    bodyHtml: null,
    attachmentNames: [],
    references: [],
    listUnsubscribe: null,
    precedence: null,
    autoSubmitted: null,
  }

  it('profile settings have safe defaults and limits', () => {
    expect(settingsSchema['profile.role'].parse(undefined)).toBe('')
    expect(settingsSchema['profile.signature'].safeParse('x'.repeat(1001)).success).toBe(false)
    expect(settingsSchema['profile.styleNotes'].safeParse('x'.repeat(301)).success).toBe(false)
  })

  it('feeds the user-context builder, and so the draft prompt', async () => {
    const s = await setup()
    await authRepo(s.db).updateProfile(s.user.id, { displayName: 'Priya Sharma' })
    await s.r.settings.setMany({
      'profile.role': 'Director of Finance',
      'profile.signOff': 'Best regards,',
      'profile.styleNotes': 'Direct, warm',
      'profile.language': 'German',
    })
    await s.r.accounts.create({ type: 'imap', email: 'u@x.test', displayName: '', color: 1 })
    await s.r.rules.add('vip', 'alex@acme.example')
    const ctx = await buildUserContext(s.db, s.user.id, new Date('2026-10-27T07:30:00Z'))
    expect(ctx).toMatchObject({
      name: 'Priya Sharma',
      role: 'Director of Finance',
      signOff: 'Best regards,',
      styleNotes: 'Direct, warm',
      language: 'German',
      timezoneName: 'Europe/Berlin',
      vipSenders: ['alex@acme.example'],
    })
    expect(ctx.offsetAt(new Date('2026-07-01T00:00:00Z'))).toBe(120)
    const draft = new PromptBuilder().buildDraft([{ messageId: 'm', message: msg }], ctx, {
      tone: 'friendly',
      intent: 'accept',
    }).text
    for (const line of [
      '  name: Priya Sharma',
      '  role: Director of Finance',
      '  sign_off: Best regards,',
      '  style_notes: Direct, warm',
      '  language: German',
    ])
      expect(draft).toContain(line)
    expect(draft).toContain('to: me')
  })

  it('an unset profile yields an empty context without breaking the prompt; a bad time zone falls back to UTC', async () => {
    const s = await setup()
    await authRepo(s.db).updateProfile(s.user.id, { timezone: 'Mars/Olympus' })
    const ctx = await buildUserContext(s.db, s.user.id, new Date())
    expect(ctx.timezoneName).toBe('UTC')
    expect(ctx.role).toBeUndefined()
    expect(new PromptBuilder().buildTriage([{ messageId: 'm', message: msg }], ctx).text).toContain(
      'timezone: UTC',
    )
  })

  it('contexts are per user', async () => {
    const s = await setup()
    const other = await authRepo(s.db).createUser({
      email: 'o@x.io',
      passwordHash: 'h',
      displayName: 'Other',
    })
    await s.r.settings.setMany({ 'profile.role': 'Secret role' })
    expect((await buildUserContext(s.db, other.id, new Date())).role).toBeUndefined()
  })
})
