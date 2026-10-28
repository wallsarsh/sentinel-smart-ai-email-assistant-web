import { parseSettingsPatch } from '../../../shared/settings'
import { useDb } from '../../container'
import { forUser } from '../../repos'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return failWith(event, { kind: 'validation', code: 'bad_request' })
  const r = parseSettingsPatch(body as Record<string, unknown>)
  if (!r.ok) {
    setResponseStatus(event, 422)
    return { error: { kind: 'validation', detail: { fields: r.errors } } }
  }
  const repo = forUser(useDb(), user.id).settings
  await repo.setMany(r.value)
  return repo.all()
})
