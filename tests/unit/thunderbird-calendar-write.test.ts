import { it, expect } from 'vitest'
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
