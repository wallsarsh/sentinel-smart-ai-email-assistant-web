import { randomBytes } from 'node:crypto'
import { createTestDb } from '../../server/db/client'
import { sessions } from '../../server/db/schema'
import type { ApprovedContent } from '../../server/mail/send/approved-content'
import { sendGate, type Redeemed } from '../../server/mail/send/send-gate'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'

/** A user, an account, a session and a gate; [redeem] runs the real gate so senders only ever get gate-made proof. */
export async function sendFixture(
  type: 'gmail' | 'microsoft_graph' | 'imap' = 'gmail',
  over: Partial<ApprovedContent> = {},
) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const repos = forUser(db, user.id)
  const acc = await repos.accounts.create({ type, email: 'me@x.test', displayName: '', color: 1 })
  const ring = { current: { version: 1, key: randomBytes(32) } }
  await db
    .insert(sessions)
    .values({ id: 'sess-1', userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) })
  const gate = sendGate({ db, ring })
  const content: ApprovedContent = {
    accountId: acc.id,
    from: { address: 'me@x.test', name: 'Me' },
    to: [{ address: 'alex@acme.example' }],
    cc: [],
    subject: 'Re: Q3 numbers',
    bodyText: 'Thanks, I will send them by 3pm.',
    inReplyToInternetMessageId: '<orig@acme.example>',
    draftRef: { providerDraftId: 'd1', providerMessageId: null },
    ...over,
  }
  async function redeem(c: ApprovedContent = content): Promise<Redeemed> {
    const a = await gate.authorize(
      user.id,
      c,
      { confirmedAt: new Date(), sessionId: 'sess-1', stepUpSatisfied: true },
      { undoSeconds: 0 },
    )
    if (!a.ok) throw new Error(`authorize: ${a.error}`)
    const r = await gate.redeem(user.id, gate.hashNonce(a.value.nonce))
    if (!r.ok) throw new Error(`redeem: ${r.error}`)
    return r.value
  }
  return { db, user, repos, acc, ring, gate, content, redeem }
}
