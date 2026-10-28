import { and, eq, isNull } from 'drizzle-orm'
import { mfaSecrets, recoveryCodes, sessions } from '../db/schema'
import type { Scope } from './scope'

export const mfaRepo = (s: Scope) => ({
  async get() {
    const [r] = await s.db.select().from(mfaSecrets).where(eq(mfaSecrets.userId, s.userId))
    return r ?? null
  },
  async upsert(secretRef: string) {
    await s.db
      .insert(mfaSecrets)
      .values({ userId: s.userId, secretRef, confirmed: false })
      .onConflictDoUpdate({ target: mfaSecrets.userId, set: { secretRef, confirmed: false } })
  },
  async confirm() {
    await s.db.update(mfaSecrets).set({ confirmed: true }).where(eq(mfaSecrets.userId, s.userId))
  },
  async remove() {
    await s.db.delete(mfaSecrets).where(eq(mfaSecrets.userId, s.userId))
    await s.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, s.userId))
  },
  async replaceRecoveryCodes(hashes: string[]) {
    await s.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, s.userId))
    if (hashes.length)
      await s.db
        .insert(recoveryCodes)
        .values(hashes.map((codeHash) => ({ userId: s.userId, codeHash })))
  },
  /** Marks one unused code as used; false if no such code. Single use. */
  async consumeRecoveryCode(codeHash: string, at: Date) {
    const rows = await s.db
      .update(recoveryCodes)
      .set({ usedAt: at })
      .where(
        and(
          eq(recoveryCodes.userId, s.userId),
          eq(recoveryCodes.codeHash, codeHash),
          isNull(recoveryCodes.usedAt),
        ),
      )
      .returning({ id: recoveryCodes.id })
    return rows.length > 0
  },
  async unusedRecoveryCount() {
    const rows = await s.db
      .select({ id: recoveryCodes.id })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, s.userId), isNull(recoveryCodes.usedAt)))
    return rows.length
  },
  async markStepUp(sessionId: string, at: Date) {
    await s.db
      .update(sessions)
      .set({ stepUpAt: at })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, s.userId)))
  },
})
