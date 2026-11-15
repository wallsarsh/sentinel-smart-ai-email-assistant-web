import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { writeCalendarEvents } from '../../thunderbird/src/calendar.js'

it('sends schema-compatible fields and a stable identity to the calendar experiment', async () => {
  const received: object[] = []
  const api = { createEvent: async (event: object) => { received.push(event); return { id: 'saved' } } }
  const event = { title: 'Meeting', start: '2026-11-05', allDay: true, end: null, location: null, sourceMessageId: 'mail-1' }
  await writeCalendarEvents([event], { api })
  await writeCalendarEvents([event], { api })
  expect(received[0]).toEqual(received[1])
  expect(received[0]).toMatchObject({ title: 'Meeting', uid: expect.any(String) })
  expect(received[0]).not.toHaveProperty('sourceMessageId')
  expect(received[0]).not.toHaveProperty('end')
})
it('reports calendar write failures without silently downloading an ICS', async () => {
  await expect(writeCalendarEvents([{ title: 'Meeting', start: '2026-11-05' }], {
    api: { createEvent: async () => { throw new Error('No writable calendar') } },
  })).rejects.toThrow('No writable calendar')
})
it('builds events with the Thunderbird 140 CalEvent class, not the removed cal.createEvent', () => {
  const source = readFileSync('thunderbird/experiments/sentinel-calendar/implementation.js', 'utf8')
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
  expect(source).toContain('resource:///modules/CalEvent.sys.mjs')
  expect(code).toContain('new CalEvent()')
  expect(code).not.toMatch(/cal\.createEvent\s*\(/)
})
it('reports how many events were already written when a later one fails', async () => {
  let calls = 0
  const api = {
    createEvent: async () => {
      calls++
      if (calls === 2) throw new Error('The provider rejected the event')
      return { id: `id-${calls}` }
    },
  }
  const events = [
    { title: 'First', start: '2026-11-05' },
    { title: 'Second', start: '2026-11-06' },
  ]
  await expect(writeCalendarEvents(events, { api })).rejects.toMatchObject({
    message: 'The provider rejected the event',
    created: 1,
  })
})
