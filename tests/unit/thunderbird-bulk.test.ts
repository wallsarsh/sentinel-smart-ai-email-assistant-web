import { describe, it, expect } from 'vitest'
import { runBulk, selectedHeaders } from '../../thunderbird/src/bulk.js'

describe('bulk message actions', () => {
  it('processes every unique message beyond the former limits and checkpoints failures', async () => {
    const snapshots: { processed: number }[] = []
    const ids = Array.from({ length: 15 }, (_, i) => i + 1)
    const result = await runBulk([...ids, 1], async (id: number) => {
      if (id === 3) throw new Error('Provider unavailable')
      return { summary: String(id) }
    }, async (job: { processed: number }) => { snapshots.push(structuredClone(job)) }, 'summary')
    expect(result.total).toBe(15)
    expect(result.processed).toBe(15)
    expect(result.failed).toBe(1)
    expect(result.results[14].id).toBe(15)
    expect(snapshots.map((s) => s.processed)).toEqual([0, ...ids, 15])
    expect(result.state).toBe('partial')
  })
  it('uses the context-click selection and drains all selection pages', async () => {
    const headers = await selectedHeaders({ selectedMessages: { id: 'next', messages: [{ id: 1 }] } }, { id: 99 }, {
      messages: { continueList: async () => ({ messages: [{ id: 2 }, { id: 1 }] }) },
      messageDisplay: { getDisplayedMessage: async () => { throw new Error('Must not use active selection') } },
    })
    expect(headers.map((h: { id: number }) => h.id)).toEqual([1, 2])
  })
  it('uses the separate tab argument for a displayed message', async () => {
    expect(await selectedHeaders({}, { id: 42 }, {
      messageDisplay: { getDisplayedMessage: async (id: number) => ({ id }) },
    })).toEqual([{ id: 42 }])
  })
})

it('retries failures and unfinished messages without repeating successful work', async () => {
  const called: number[] = []
  const job = await runBulk([1, 2, 3], async (id: number) => {
    called.push(id)
    return { summary: 'Recovered' }
  }, async () => {}, 'analyze', { results: [{ id: 1, summary: 'Saved' }, { id: 2, error: 'Offline' }] })
  expect(called).toEqual([2, 3])
  expect(job.processed).toBe(3)
  expect(job.failed).toBe(0)
  expect(job.state).toBe('done')
})
