import { z } from 'zod'

export const draftTone = z.enum(['professional', 'friendly', 'concise', 'formal'])
export const draftIntent = z.enum(['accept', 'decline', 'ask_for_info', 'acknowledge', 'custom'])
export const draftStatus = z.enum(['local', 'saved', 'deleted'])
export type DraftTone = z.infer<typeof draftTone>
export type DraftIntent = z.infer<typeof draftIntent>

export const sendStatus = z.enum([
  'pending',
  'submitting',
  'sent',
  'failed',
  'unknown',
  'cancelled',
])
export type SendStatus = z.infer<typeof sendStatus>

export const briefSectionType = z.enum(['top_priorities', 'needs_reply', 'due_today', 'fyi'])
export const briefItem = z.object({ text: z.string(), messageIds: z.array(z.string()) })
export const briefSection = z.object({ type: briefSectionType, items: z.array(briefItem) })
export const dailyBrief = z.object({
  id: z.string(),
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
  headline: z.string(),
  sections: z.array(briefSection),
  createdAt: z.coerce.date(),
})
export type DailyBrief = z.infer<typeof dailyBrief>
