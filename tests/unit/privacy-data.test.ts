import { describe, expect, it } from 'vitest'
import { builderOptions } from '../../server/ai/prompts/from-settings'
import { clearMailCache } from '../../server/accounts/cache'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { settingsSchema } from '../../shared/settings'

describe('builderOptions', () => {
  it('maps every privacy setting to the prompt builder', () => {
    const base = Object.fromEntries(
      Object.entries(settingsSchema)
        .filter(([k]) => k.startsWith('privacy.'))
        .map(([k, v]) => [k, v.parse(undefined)]),
    ) as never
    expect(builderOptions(base)).toEqual({
      compact: true,
      triageBodyCap: 3000,
      draftBodyCap: 6000,
      triageSubjectOnly: false,
      redaction: { cards: true, ibans: true, phones: true, otherEmails: true },
    })
    expect(
      builderOptions({
        ...(base as object),
        'privacy.maxChars': 20000,
        'privacy.subjectOnly': true,
        'privacy.redactEmails': false,
      } as never),
    ).toMatchObject({
      triageBodyCap: 20000,
      draftBodyCap: 20000,
      triageSubjectOnly: true,
      redaction: { otherEmails: false, cards: true },
    })
  })
})

describe('clearMailCache', () => {
  it('removes cached mail except open-task mail and resets sync so it comes back', async () => {
    const { db } = await createTestDb()
    const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
    const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
    const repos = forUser(db, user.id)
    const acc = await repos.accounts.create({ type: 'imap', email: 'me@x.test', displayName: '' })
    await repos.accounts.update(acc.id, { syncCursor: { uid: 5 }, lastSyncAt: new Date() })
    await repos.mail.upsertFolders(acc.id, [{ providerId: 'INBOX', name: 'Inbox', role: 'inbox' }])
    const [folder] = await repos.mail.listFolders(acc.id)
    const at = new Date('2026-10-01T00:00:00Z')
    await repos.mail.upsertMessages(
      ['a', 'b'].map((p) => ({
        accountId: acc.id,
        folderId: folder!.id,
        providerMessageId: p,
        fromAddress: 'x@x.test',
        subject: p,
        sentAt: at,
        receivedAt: at,
      })),
    )
    const b = (await repos.mail.recent(10)).find((m) => m.providerMessageId === 'b')!
    await repos.triage.save(
      {
        messageId: b.id,
        category: 'direct_personal',
        importance: 'medium',
        urgency: 'not_urgent',
        priority: 'p3_this_week',
        needsReply: false,
        summary: 's',
        reason: 'r',
        source: 'rule',
      } as never,
      [{ itemText: 'keep me', dueAt: null, dueText: null }],
    )
    const r = await clearMailCache(db, user.id)
    expect(r).toEqual({ removed: 1, accounts: 1 })
    expect((await repos.mail.recent(10)).map((m) => m.providerMessageId)).toEqual(['b'])
    const after = await repos.accounts.get(acc.id)
    expect(after).toMatchObject({ syncCursor: null, lastSyncAt: null })
    expect(await clearMailCache(db, other.id)).toEqual({ removed: 0, accounts: 0 })
  })
})
