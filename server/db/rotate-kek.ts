import { useConfig } from '../config'
import { createDb } from './client'
import { kekRing } from '../security/kek-ring'
import { rotateKek } from '../security/secret-store'
import { keyAdmin } from '../repos/secrets'

// `node dist/rotate-kek.mjs`: re-wraps every user's data key under the current KEK (KEK_BASE64 / KEK_VERSION).
// Provider tokens and other secrets are not re-encrypted; only their per-user data keys are. Safe to run twice.
const c = useConfig()
const { db, close } = createDb(c.databaseUrl)
try {
  const n = await rotateKek(db, kekRing(c))
  const left = (await keyAdmin(db).all()).filter((r) => r.kekVersion !== c.kekVersion).length
  console.log(
    `Re-wrapped ${n} data key(s) under KEK version ${c.kekVersion}. Keys still on another version: ${left}.`,
  )
  if (left > 0) process.exitCode = 1
} finally {
  await close()
}
