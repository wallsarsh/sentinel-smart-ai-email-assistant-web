import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 1

/** AES-256-GCM. Output: base64(version | iv(12) | tag(16) | ciphertext). */
export function seal(key: Buffer, plaintext: Buffer, aad: string): string {
  if (key.length !== 32) throw new Error('key must be 32 bytes')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(plaintext), c.final()])
  return Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), ct]).toString('base64')
}

export function open(key: Buffer, sealed: string, aad: string): Buffer {
  const buf = Buffer.from(sealed, 'base64')
  if (buf[0] !== VERSION || buf.length < 1 + 12 + 16) throw new Error('bad ciphertext')
  const d = createDecipheriv('aes-256-gcm', key, buf.subarray(1, 13))
  d.setAAD(Buffer.from(aad))
  d.setAuthTag(buf.subarray(13, 29))
  return Buffer.concat([d.update(buf.subarray(29)), d.final()])
}
