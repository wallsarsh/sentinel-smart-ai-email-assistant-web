import { hash, verify } from '@node-rs/argon2'

// OWASP argon2id guidance: 19 MiB, 2 iterations, 1 lane (algorithm 2 = argon2id).
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

export const hashPassword = (pw: string) => hash(pw, OPTS)

export async function verifyPassword(stored: string, pw: string): Promise<boolean> {
  try {
    return await verify(stored, pw)
  } catch {
    return false
  }
}

export type PasswordProblem = 'too_short' | 'too_long' | 'same_as_email' | 'too_common'

const COMMON = new Set([
  'password1234',
  'passwordpassword',
  '123456789012',
  'qwertyuiop12',
  'letmein12345',
])

export function checkPasswordPolicy(pw: string, email: string): PasswordProblem | null {
  if (pw.length < 12) return 'too_short'
  if (pw.length > 256) return 'too_long'
  if (
    pw.toLowerCase() === email.toLowerCase() ||
    (pw.toLowerCase().includes(email.split('@')[0]!.toLowerCase()) &&
      email.split('@')[0]!.length >= 4)
  )
    return 'same_as_email'
  if (COMMON.has(pw.toLowerCase())) return 'too_common'
  return null
}
