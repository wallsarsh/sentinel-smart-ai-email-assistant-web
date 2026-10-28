import { z } from 'zod'
import { useDb } from '../../container'
import { zoneOffset } from '../../ai/prompts/builder'
import { forUser } from '../../repos'
import { authRepo } from '../../repos/auth'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

const body = z
  .object({
    name: z.string().trim().max(80).optional(),
    timezone: z
      .string()
      .max(60)
      .refine((z) => {
        try {
          zoneOffset(z, new Date())
          return true
        } catch {
          return false
        }
      })
      .optional(),
    role: z.string().trim().max(80).optional(),
    signOff: z.string().trim().max(80).optional(),
    signature: z.string().max(1000).optional(),
    styleNotes: z.string().trim().max(300).optional(),
    language: z.string().trim().max(20).optional(),
  })
  .strict()

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const b = body.safeParse(await readBody(event))
  if (!b.success)
    return failWith(event, {
      kind: 'validation',
      field: String(b.error.issues[0]?.path[0] ?? ''),
      code: 'invalid',
    })
  const { name, timezone, ...rest } = b.data
  const db = useDb()
  if (name !== undefined || timezone !== undefined)
    await authRepo(db).updateProfile(user.id, {
      ...(name === undefined ? {} : { displayName: name }),
      ...(timezone === undefined ? {} : { timezone }),
    })
  const map = {
    role: 'profile.role',
    signOff: 'profile.signOff',
    signature: 'profile.signature',
    styleNotes: 'profile.styleNotes',
    language: 'profile.language',
  } as const
  const patch = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [map[k as keyof typeof map], v]),
  )
  if (Object.keys(patch).length) await forUser(db, user.id).settings.setMany(patch as never)
  return { ok: true }
})
