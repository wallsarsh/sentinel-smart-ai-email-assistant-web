import { randomBytes } from 'node:crypto'
import type { Db } from '../db/client'
import { forUser } from '../repos'
import { keyAdmin } from '../repos/secrets'
import { open, seal } from './crypto'

export type SecretStore = {
  put(name: string, value: string): Promise<void>
  get(name: string): Promise<string | null>
  delete(name: string): Promise<void>
  deleteAll(): Promise<void>
}

export type KekRing = {
  current: { version: number; key: Buffer }
  previous?: { version: number; key: Buffer }[]
}

const keyFor = (ring: KekRing, version: number) =>
  version === ring.current.version
    ? ring.current.key
    : ring.previous?.find((k) => k.version === version)?.key

/**
 * Envelope encryption: each user has a random 256-bit data key wrapped by the
 * KEK; each secret is sealed with the data key and bound to (user, name), so a
 * ciphertext cannot be moved to another row. Secrets are never returned to
 * clients; services read them server-side only.
 */
export function secretStoreFor(db: Db, userId: string, ring: KekRing): SecretStore {
  const repo = forUser(db, userId).secrets

  async function dataKey(create: boolean): Promise<Buffer | null> {
    const row = await repo.getWrappedKey()
    if (row) {
      const kek = keyFor(ring, row.kekVersion)
      if (!kek) throw new Error('unknown KEK version')
      return open(kek, row.wrappedKey, `dek:${userId}`)
    }
    if (!create) return null
    const dek = randomBytes(32)
    await repo.putWrappedKey(seal(ring.current.key, dek, `dek:${userId}`), ring.current.version)
    // Another request may have won the race; always use what is stored.
    return dataKey(false)
  }

  return {
    async put(name, value) {
      const dek = (await dataKey(true))!
      await repo.putCiphertext(name, seal(dek, Buffer.from(value, 'utf8'), `${userId}:${name}`))
    },
    async get(name) {
      const ct = await repo.getCiphertext(name)
      if (ct === null) return null
      const dek = (await dataKey(false))!
      return open(dek, ct, `${userId}:${name}`).toString('utf8')
    },
    delete: (name) => repo.delete(name),
    deleteAll: () => repo.deleteAll(),
  }
}

/** Re-wraps every user's data key under the current KEK. Data stays untouched. */
export async function rotateKek(db: Db, ring: KekRing): Promise<number> {
  const admin = keyAdmin(db)
  let n = 0
  for (const row of await admin.all()) {
    if (row.kekVersion === ring.current.version) continue
    const old = keyFor(ring, row.kekVersion)
    if (!old) throw new Error(`no key for KEK version ${row.kekVersion}`)
    const dek = open(old, row.wrappedKey, `dek:${row.userId}`)
    await admin.rewrap(
      row.userId,
      seal(ring.current.key, dek, `dek:${row.userId}`),
      ring.current.version,
    )
    n++
  }
  return n
}
