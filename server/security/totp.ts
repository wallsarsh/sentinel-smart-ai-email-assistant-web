import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of buf) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const c of clean) {
    const i = ALPHABET.indexOf(c)
    if (i < 0) throw new Error('bad base32')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const newTotpSecret = () => base32Encode(randomBytes(20))

/** RFC 6238 (SHA-1, 6 digits, 30 s). */
export function totpAt(secretBase32: string, timeMs: number, digits = 6, stepSec = 30): string {
  const counter = Math.floor(timeMs / 1000 / stepSec)
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest()
  const off = h[h.length - 1]! & 15
  const code = ((h[off]! & 127) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!
  return String(code % 10 ** digits).padStart(digits, '0')
}

/** Accepts the current step and one either side; returns the matched step or null. */
export function verifyTotp(secretBase32: string, code: string, timeMs: number): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const step = Math.floor(timeMs / 1000 / 30)
  for (const d of [0, -1, 1]) {
    const expect = totpAt(secretBase32, (step + d) * 30_000)
    if (timingSafeEqual(Buffer.from(expect), Buffer.from(code))) return step + d
  }
  return null
}

export const otpauthUri = (secret: string, account: string, issuer = 'Sentinel') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`
