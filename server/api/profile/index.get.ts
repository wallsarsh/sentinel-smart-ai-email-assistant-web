import { useDb } from '../../container'
import { forUser } from '../../repos'
import { authRepo } from '../../repos/auth'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const db = useDb()
  const s = await forUser(db, user.id).settings.all()
  const u = await authRepo(db).userById(user.id)
  return {
    name: u?.displayName ?? '',
    timezone: u?.timezone ?? 'UTC',
    role: s['profile.role'],
    signOff: s['profile.signOff'],
    signature: s['profile.signature'],
    styleNotes: s['profile.styleNotes'],
    language: s['profile.language'],
  }
})
