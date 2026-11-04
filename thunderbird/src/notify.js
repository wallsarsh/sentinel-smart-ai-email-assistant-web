// Brief update visibility: the brief toolbar icon badge plus a content-free native notification.
// Thunderbird has no separate system-tray API; this is the tray-adjacent indicator the platform offers.
const BADGE_COLOR = '#3F51B5'
const DEFAULT_TITLE = 'Sentinel daily brief'

export function briefBadgeCount(brief) {
  const n = Number(brief?.stats?.total ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(99, Math.round(n))
}

async function safely(fn) {
  try {
    await fn()
  } catch {
    // A missing/old action or notification API must never fail a monitor run.
  }
}

export async function updateBriefBadge(brief, action = globalThis.browser?.action) {
  if (!action?.setBadgeText) return
  const count = briefBadgeCount(brief)
  await safely(() => action.setBadgeText({ text: count ? String(count) : '' }))
  if (count) await safely(() => action.setBadgeBackgroundColor({ color: BADGE_COLOR }))
  const when = brief?.createdAt ? new Date(brief.createdAt) : null
  const title =
    when && Number.isFinite(when.getTime())
      ? `Sentinel brief — updated ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : DEFAULT_TITLE
  if (action.setTitle) await safely(() => action.setTitle({ title }))
}

export async function clearBriefBadge(action = globalThis.browser?.action) {
  if (!action?.setBadgeText) return
  await safely(() => action.setBadgeText({ text: '' }))
  if (action.setTitle) await safely(() => action.setTitle({ title: DEFAULT_TITLE }))
}

/** Native OS notification with counts only, never a sender, subject or body. */
export async function notifyBriefUpdated(
  brief,
  { notifications = globalThis.browser?.notifications } = {},
) {
  const count = briefBadgeCount(brief)
  if (!count || !notifications?.create) return false
  await safely(() =>
    notifications.create('sentinel-brief', {
      type: 'basic',
      title: 'Sentinel AI',
      message: `Brief updated · ${count} new message${count === 1 ? '' : 's'}.`,
    }),
  )
  return true
}
