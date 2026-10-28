import { useDb } from '../../container'
import { forUser } from '../../repos'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const rules = await forUser(useDb(), user.id).rules.list()
  return {
    rules: rules
      .filter((r) => r.rule !== 'correction')
      .map((r) => ({ id: r.id, pattern: r.pattern, kind: r.rule, accountId: r.accountId })),
  }
})
