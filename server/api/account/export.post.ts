import { useLifecycle } from '../../container'
import { requireStepUp } from '../../utils/step-up'

export default defineEventHandler(async (event) => {
  const { user } = await requireStepUp(event)
  const { filename, bytes } = await useLifecycle().exportData(user.id)
  setResponseHeaders(event, {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store',
  })
  return Buffer.from(bytes)
})
