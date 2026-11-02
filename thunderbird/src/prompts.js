// Thunderbird assistant prompt: the shared triage prompt plus intent and calendar fields.
// Static and versioned; mail content still enters only through PromptBuilder.
import { triagePrompt } from '../../packages/core/src/prompts/registry'

const clone = (v) => JSON.parse(JSON.stringify(v))
const baseSchema = () => clone(triagePrompt.schema.schema)

const schema = baseSchema()
const item = schema.properties.results.items
item.properties.intent = {
  type: 'string',
  enum: [
    'request',
    'question',
    'meeting',
    'approval',
    'payment',
    'informational',
    'marketing',
    'notification',
    'social',
    'security',
    'other',
  ],
}
item.properties.replyIntent = {
  type: 'string',
  enum: ['accept', 'decline', 'ask_for_info', 'acknowledge', 'custom'],
}
item.properties.replyInstruction = { type: 'string' }
item.properties.calendarEvents = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'start', 'end', 'allDay', 'location', 'description'],
    properties: {
      title: { type: 'string' },
      start: { type: 'string' },
      end: { type: ['string', 'null'] },
      allDay: { type: 'boolean' },
      location: { type: ['string', 'null'] },
      description: { type: ['string', 'null'] },
    },
  },
}
item.required.push('intent', 'replyIntent', 'replyInstruction', 'calendarEvents')

const EXTRA = `

Additional fields for the Thunderbird assistant:
- intent: one of request (asks the user to do something), question (asks for information), meeting (schedules or changes a meeting), approval (waits for a yes/no), payment (invoice, receipt, money due), informational (useful update), marketing (bulk promotion), notification (automated system mail), social (social network), security (password/login/security), other.
- replyIntent: when needsReply is true, the most likely useful reply: accept, decline, ask_for_info, acknowledge, or custom. Use acknowledge when a short confirmation is enough.
- replyInstruction: a short instruction for the reply writer when replyIntent is custom; otherwise an empty string.
- calendarEvents: only events the email explicitly asks the user to attend or schedule, with a concrete date or date-time. Do not invent one. start/end are ISO 8601 date-time with offset, or YYYY-MM-DD for an all-day item; end may be null. allDay is true for date-only items. Include location and a one-line description, or null. Empty array if none.

Keep the reply body out of this answer; the reply is drafted separately after the user reviews this analysis.`

export const assistantPrompt = {
  version: 'assistant.v1',
  system: `${triagePrompt.system}${EXTRA}`.trim(),
  schema: { name: 'assistant_v1', schema },
}
