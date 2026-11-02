// Reply detection and reviewable draft creation. Pure logic + injected save/generate seams.
import { draftReply } from './ai.js'
import { withDraft } from './mail.js'

const DAY = 24 * 3600_000
export const DRAFT_PRIORITY_RANK = { p1_do_now: 0, p2_today: 1, p3_this_week: 2, p4_fyi: 3 }
const BLOCKED_CATEGORIES = new Set([
  'newsletterMarketing',
  'notificationAutomated',
  'social',
  'securityAccount',
])

/** Extracts Message-IDs from In-Reply-To/References headers of a full message. */
export function referencedMessageIds(full) {
  const header = full?.headers ?? {}
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
  const raw = [
    ...list(header['in-reply-to'] ?? header['In-Reply-To']),
    ...list(header['references'] ?? header['References']),
  ].join(' ')
  const out = new Set()
  for (const m of raw.matchAll(/<([^<>@\s]+@[^<>\s]+)>/g)) out.add(m[1])
  return out
}

/** Set of Message-IDs already answered or drafted, from [{full}] items. */
export function buildReplyIndex(items = []) {
  const index = new Set()
  for (const item of items) for (const id of referencedMessageIds(item?.full)) index.add(id)
  return index
}

/** Pure eligibility check. Returns {ok, reason}; reasons are shown in the dashboard. */
export function draftEligibility({ analysis, header, settings, replied = false, draftRecord = null, now = new Date(), manual = false }) {
  if (!manual && !settings?.monitor?.autoDraft) return { ok: false, reason: 'Auto-draft is off.' }
  if (!analysis || analysis.skipped) return { ok: false, reason: 'The message was filtered locally.' }
  if (!analysis.needsReply) return { ok: false, reason: 'No reply is needed.' }
  if (BLOCKED_CATEGORIES.has(analysis.category))
    return { ok: false, reason: 'This category is never auto-drafted.' }
  const min = DRAFT_PRIORITY_RANK[settings.monitor.draftMinPriority] ?? 1
  const rank = DRAFT_PRIORITY_RANK[analysis.priority] ?? 3
  if (!manual && rank > min) return { ok: false, reason: 'Below the draft priority threshold.' }
  if (replied) return { ok: false, reason: 'A reply or draft already exists.' }
  if (
    draftRecord?.status === 'saved' &&
    now.getTime() - Number(draftRecord.at ?? 0) < 14 * DAY
  )
    return { ok: false, reason: 'Sentinel already saved a draft.' }
  const date = new Date(header?.date ?? now)
  if (!manual && Number.isFinite(date.getTime()) && now.getTime() - date.getTime() > 14 * DAY)
    return { ok: false, reason: 'The message is older than 14 days.' }
  return { ok: true, reason: '' }
}

/** The request passed to the shared draft prompt. */
export function draftRequest(analysis, settings) {
  const intent = analysis?.replyIntent ?? 'acknowledge'
  const instruction =
    intent === 'custom'
      ? analysis?.replyInstruction || 'Write a short, helpful reply.'
      : analysis?.replyInstruction || ''
  return {
    tone: settings?.profile?.tone ?? 'professional',
    intent,
    ...(instruction ? { instruction } : {}),
  }
}

/**
 * Generates and saves drafts for eligible analyses. generate() and save() are injected:
 * the background passes the real provider/compose paths, tests use fakes.
 */
export async function maybeCreateDrafts({
  analyses = [],
  settings,
  ctx,
  store,
  isReplied = async () => false,
  generate = draftReply,
  save,
  now = new Date(),
  fetchImpl,
}) {
  const candidates = []
  for (const item of analyses) {
    if (candidates.length >= (settings.monitor.maxDraftsPerRun ?? 0)) break
    const record = await store.draftRecord(item.header)
    const replied = await isReplied(item.header)
    const eligible = draftEligibility({
      analysis: item.analysis,
      header: item.header,
      settings,
      replied,
      draftRecord: record,
      now,
    })
    if (eligible.ok) candidates.push(item)
  }

  const created = []
  const failed = []
  for (const item of candidates) {
    try {
      const body = await generate(
        settings,
        [item.message],
        ctx,
        draftRequest(item.analysis, settings),
        fetchImpl,
      )
      const saved = await save(item.header, body)
      const entry = {
        messageId: item.header.id,
        headerMessageId: item.header.headerMessageId ?? null,
        subject: item.header.subject ?? '',
        sender: item.header.author ?? '',
        accountId: item.header.folder?.accountId ?? null,
        draftId: saved?.id ?? null,
        draftHeaderMessageId: saved?.headerMessageId ?? null,
        draftFolder: saved?.folder?.name ?? null,
        status: 'saved',
        at: now.getTime(),
      }
      await store.saveDraftRecord(item.header, { status: 'saved', at: now.getTime(), ...entry })
      await store.appendDraft(entry)
      created.push(entry)
    } catch (e) {
      const entry = {
        messageId: item.header.id,
        headerMessageId: item.header.headerMessageId ?? null,
        subject: item.header.subject ?? '',
        sender: item.header.author ?? '',
        accountId: item.header.folder?.accountId ?? null,
        status: 'failed',
        error: String(e?.message ?? e).slice(0, 160),
        at: now.getTime(),
      }
      await store.saveDraftRecord(item.header, { status: 'failed', at: now.getTime(), ...entry })
      await store.appendDraft(entry)
      failed.push(entry)
    }
  }
  return { created, failed }
}

const addressOf = (sender) => {
  const m = /<([^>\s]+)>$/.exec(String(sender ?? ''))
  return (m ? m[1] : String(sender ?? '')).trim().toLowerCase()
}

/** Chooses the identity that belongs to the message's account, preferring one of its recipients. */
export function pickIdentity(account, header) {
  const identities = account?.identities ?? []
  if (!identities.length) return null
  const people = new Set(
    [header?.author, ...(header?.recipients ?? []), ...(header?.ccList ?? [])]
      .map(addressOf)
      .filter(Boolean),
  )
  return identities.find((i) => people.has(String(i.email ?? '').toLowerCase())) ?? identities[0]
}

/** The account identity for a message, so compose saves into that account's Drafts folder. */
export async function identityForHeader(header, accounts) {
  const accountId = header?.folder?.accountId
  if (!accountId) return null
  const list = accounts ?? (await browser.accounts.list(true))
  const account = list.find((a) => String(a.id) === String(accountId))
  return pickIdentity(account, header)?.id ?? null
}

/** Saves a reply as a draft through Thunderbird's compose window (TB 102+). Never sends. */
export async function saveDraftWithCompose(header, body, { identityId = null } = {}) {
  if (typeof browser === 'undefined' || !browser.compose?.beginReply)
    throw new Error('Thunderbird compose is not available.')
  if (!browser.compose.saveMessage)
    throw new Error('This Thunderbird version cannot save drafts from add-ons (102+ required).')
  const tab = await browser.compose.beginReply(
    header.id,
    'replyToSender',
    identityId ? { identityId } : undefined,
  )
  try {
    const details = await browser.compose.getComposeDetails(tab.id)
    await browser.compose.setComposeDetails(tab.id, {
      ...withDraft(details, body),
      ...(identityId ? { identityId } : {}),
    })
    const result = await browser.compose.saveMessage(tab.id, { mode: 'draft' })
    const saved = result?.messages?.[0]
    if (!saved) throw new Error('Thunderbird did not confirm the saved draft.')
    return saved
  } finally {
    await browser.tabs.remove(tab.id).catch(() => undefined)
  }
}
