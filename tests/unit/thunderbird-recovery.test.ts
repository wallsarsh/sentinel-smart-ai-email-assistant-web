import { describe, expect, it } from 'vitest'
import { discover } from '../../thunderbird/src/discovery.js'
import { createStore, memoryArea } from '../../thunderbird/src/store.js'
import { runMonitor } from '../../thunderbird/src/monitor.js'

describe('monitor recovery', () => {
  it('commits successful folder pages, retains partial pages and retries a broken folder', async () => {
    const area = memoryArea()
    const now = new Date('2026-11-18T08:00:00Z')
    const since = new Date(now.getTime() - 86400000)
    const folders = ['a', 'b'].map(id => ({ id, accountId: id }))
    let offline = true
    const query = async (id: string, from: Date) => {
      if (id === 'b') expect(from.getTime()).toBeLessThanOrEqual(since.getTime())
      return { id: id === 'b' ? 'second' : null, messages: [{ id: id === 'a' ? 1 : 2, headerMessageId: 'shared', date: now, folder: { id } }] }
    }
    const next = async () => {
      if (offline) throw new Error('Offline')
      return { messages: [{ id: 3, date: now, folder: { id: 'b' } }] }
    }
    const first = await discover({ area, folders, since, now, query, next })
    expect(first.failures).toEqual(['b'])
    expect(first.headers).toHaveLength(2)
    expect(await area.get('sentinel.scan:b')).toEqual({ 'sentinel.scan:b': since.getTime() })
    offline = false
    const second = await discover({ area, folders, since, now, query, next })
    expect(second.headers).toHaveLength(3)
    expect(second.failures).toEqual([])
  })

  it('reads an ISO checkpoint from a previous pass', async () => {
    const store = createStore(memoryArea())
    const now = new Date('2026-11-18T08:00:00Z')
    await store.saveMonitor({ lastScanAt: now.toISOString() })
    let start
    await runMonitor({ store, settings: await store.settings(), now, ctx: {}, api: { recent: async (since: Date) => { start = since; return [] } } })
    expect(start).toEqual(new Date(now.getTime() - 300000))
  })

  it('preserves the completed brief and isolates cached analyses across accounts', async () => {
    const store = createStore(memoryArea())
    await store.saveBrief({ headline: 'Completed', partial: false })
    await store.saveBrief({ partial: true })
    expect((await store.displayedBrief()).headline).toBe('Completed')
    expect((await store.brief()).partial).toBe(true)
    const header = { id: 4, headerMessageId: 'common', folder: { accountId: 'a' } }
    await store.saveAnalysis(header, { summary: 'A' })
    expect(await store.analysis({ ...header, folder: { accountId: 'b' } })).toBeNull()
  })
})

it('drains four cached eligible sources over two wakes with a three-draft budget', async () => {
  const { drainDraftBacklog } = await import('../../thunderbird/src/drafts.js')
  const area = memoryArea()
  const store = createStore(area)
  const settings = await store.settings()
  const date = new Date().toISOString()
  const header = (id: number) => ({ id, date, folder: { id: 'inbox', accountId: 'one' }, headerMessageId: String(id) })
  for (const id of [1, 2, 3, 4]) await store.saveAnalysis(header(id), { needsReply: true, priority: 'p1_do_now', at: Date.now() })
  const saved: number[] = []
  const args = { settings, store, folders: new Set(['inbox']), resolveSource: async (r: {messageId: number}) => header(r.messageId),
    isLocked: () => false, reconcileSave: async () => false, manualDraft: async (id: number) => {
      saved.push(id)
      await store.saveDraftRecord(header(id), { status: 'saved', at: Date.now() })
      return { ok: true, draft: { messageId: id } }
    } }
  expect((await drainDraftBacklog(args)).queued).toBe(1)
  await drainDraftBacklog({ ...args, store: createStore(area) })
  expect(saved).toEqual([1, 2, 3, 4])
})
