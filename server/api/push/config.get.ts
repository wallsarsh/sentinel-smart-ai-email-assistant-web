import { useConfig } from '../../config'
import { requireUser } from '../../utils/require-user'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const k = useConfig().vapid.publicKey
  return { configured: k !== '', publicKey: k }
})
