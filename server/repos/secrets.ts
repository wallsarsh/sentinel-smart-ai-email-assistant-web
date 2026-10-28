import { and, eq } from 'drizzle-orm'
import { dataKeys, secrets } from '../db/schema'
import type { Db } from '../db/client'
import type { Scope } from './scope'

/** Ciphertext rows. The security layer encrypts; this layer only stores. */
export const secretsRepo = (s: Scope) => ({
  async getWrappedKey() {
    const [r] = await s.db.select().from(dataKeys).where(eq(dataKeys.userId, s.userId))
    return r ?? null
  },
  async putWrappedKey(wrappedKey: string, kekVersion: number) {
    await s.db
      .insert(dataKeys)
      .values({ userId: s.userId, wrappedKey, kekVersion })
      .onConflictDoNothing()
  },
  async getCiphertext(name: string) {
    const [r] = await s.db
      .select()
      .from(secrets)
      .where(and(eq(secrets.userId, s.userId), eq(secrets.name, name)))
    return r?.ciphertext ?? null
  },
  async putCiphertext(name: string, ciphertext: string) {
    await s.db
      .insert(secrets)
      .values({ userId: s.userId, name, ciphertext })
      .onConflictDoUpdate({ target: [secrets.userId, secrets.name], set: { ciphertext } })
  },
  async delete(name: string) {
    await s.db.delete(secrets).where(and(eq(secrets.userId, s.userId), eq(secrets.name, name)))
  },
  async deleteAll() {
    await s.db.delete(secrets).where(eq(secrets.userId, s.userId))
  },
  async names(prefix = '') {
    const rows = await s.db
      .select({ name: secrets.name })
      .from(secrets)
      .where(eq(secrets.userId, s.userId))
    return rows.map((r) => r.name).filter((n) => n.startsWith(prefix))
  },
})

/** Operator task (KEK rotation): touches every user's key row on purpose. */
export const keyAdmin = (db: Db) => ({
  all: () => db.select().from(dataKeys),
  async rewrap(userId: string, wrappedKey: string, kekVersion: number) {
    await db.update(dataKeys).set({ wrappedKey, kekVersion }).where(eq(dataKeys.userId, userId))
  },
})
