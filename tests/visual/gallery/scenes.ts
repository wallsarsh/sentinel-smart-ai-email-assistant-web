import { defineComponent, h, ref } from 'vue'
import DefaultLayout from '../../../app/layouts/default.vue'
import SettingsHub from '../../../app/pages/settings/index.vue'
import BriefBody from '../../../app/components/brief/BriefBody.vue'
import MessageRow from '../../../app/components/inbox/MessageRow.vue'
import SegmentChips from '../../../app/components/inbox/SegmentChips.vue'
import MessageCard from '../../../app/components/message/MessageCard.vue'
import AiCard from '../../../app/components/triage/AiCard.vue'
import RecipientList from '../../../app/components/composer/RecipientList.vue'
import ToneIntent from '../../../app/components/composer/ToneIntent.vue'
import DraftEditor from '../../../app/components/composer/DraftEditor.vue'
import ConfirmDialog from '../../../app/components/send/ConfirmDialog.vue'
import BackgroundSettings from '../../../app/components/settings/BackgroundSettings.vue'
import PrivacyForm from '../../../app/components/privacy/PrivacyForm.vue'

export type Scene = { path: string; root: object }

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const shell = (body: () => unknown) =>
  defineComponent({ render: () => h(DefaultLayout, null, { default: body }) })

const brief = {
  id: A,
  windowStart: '2026-10-27T08:00:00Z',
  windowEnd: '2026-10-28T08:00:00Z',
  headline:
    'Alex needs the Q3 numbers by Thursday and the vendor contract is waiting for your signature. Two invoices arrived overnight.',
  sections: [
    {
      type: 'topPriorities' as const,
      items: [
        { text: 'Send Alex the Q3 numbers before Thursday noon', messageIds: [A] },
        { text: 'Sign the vendor contract (due today)', messageIds: [B] },
      ],
    },
    {
      type: 'needsReply' as const,
      items: [{ text: 'Priya asks if Friday still works', messageIds: [A] }],
    },
    { type: 'fyi' as const, items: [{ text: 'Two invoices arrived', messageIds: [A, B] }] },
  ],
  stats: { total: 42, needsReply: 5, p1: 2, p2: 4, newsletters: 11, notifications: 9 },
  createdAt: '2026-10-28T07:30:00Z',
  model: 'm',
}

const rows = [
  {
    id: A,
    fromAddress: 'alex@acme.example',
    fromName: 'Alex Morgan',
    subject: 'Q3 numbers needed by Thursday',
    snippet: 'Hi, could you send the final figures before the board pack goes out? Thanks, Alex',
    receivedAt: '2026-10-28T06:10:00Z',
    isRead: false,
    priority: 'p1_do_now',
    needsReply: true,
    summary: 'Alex wants the final Q3 figures before Thursday noon.',
  },
  {
    id: B,
    fromAddress: 'legal@vendor.example',
    fromName: null,
    subject: 'Contract for signature',
    snippet: 'Please find the agreement attached. It expires at the end of the week.',
    receivedAt: '2026-10-27T15:00:00Z',
    isRead: false,
    priority: 'p2_today',
    needsReply: false,
    summary: null,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    fromAddress: 'news@letters.example',
    fromName: 'Weekly Letters',
    subject: 'Ten ideas for a calmer inbox',
    snippet: 'This week we look at batching, filters and when to just say no to a meeting request.',
    receivedAt: '2026-10-26T09:00:00Z',
    isRead: true,
    priority: 'p4_fyi',
    needsReply: false,
    summary: null,
  },
]

const detail = {
  id: A,
  fromAddress: 'alex@acme.example',
  fromName: 'Alex Morgan',
  subject: 'Q3 numbers needed by Thursday',
  sentAt: '2026-10-28T06:10:00Z',
  toJson: [{ address: 'me@example.test', name: 'Me' }],
  ccJson: [{ address: 'finance@acme.example' }],
  bodyText:
    'Hi,\n\nCould you send the final Q3 figures before the board pack goes out on Thursday? I need revenue by region and the updated forecast.\n\nThanks,\nAlex',
  bodyHtmlSanitized: null,
  attachmentNames: ['q3-draft.xlsx'],
}
const triage = {
  priority: 'p1_do_now',
  category: 'work_request',
  importance: 'high',
  needsReply: true,
  summary:
    'Alex wants the final Q3 figures (revenue by region and the forecast) before Thursday noon.',
  reason: 'Direct request from a colleague with a deadline.',
  confidence: 0.86,
  source: 'ai' as const,
}

const preview = {
  from: { address: 'me@example.test', name: 'Me' },
  to: ['alex@acme.example'],
  cc: [],
  subject: 'Re: Q3 numbers needed by Thursday',
  bodyText:
    'Hi Alex,\n\nThanks for flagging this. I will send the final Q3 figures, revenue by region and the updated forecast, on Wednesday afternoon.\n\nBest,\nMe',
  placeholders: [],
  flags: { newRecipients: [], externalDomains: ['acme.example'], foreign: [] },
  contentHash: 'a'.repeat(64),
}

const inbox = shell(() => [
  h('h1', { class: 'mb-3 text-2xl font-semibold' }, 'Inbox'),
  h(SegmentChips, {
    modelValue: 'all',
    counts: { all: 42, needs_reply: 5, actions: 3, important: 6, fyi: 20, newsletters: 11 },
  }),
  h(
    'div',
    { class: 'mt-3 rounded border' },
    rows.map((row) => h(MessageRow, { row })),
  ),
])

const composer = defineComponent({
  setup() {
    const to = ref(['alex@acme.example'])
    const cc = ref<string[]>([])
    const tone = ref('professional')
    const intent = ref('accept')
    const note = ref('')
    const body = ref(
      'Hi Alex,\n\nI will send the figures on Wednesday afternoon. [confirm date]\n\nBest,\nMe',
    )
    return () =>
      h(DefaultLayout, null, {
        default: () =>
          h('section', { class: 'space-y-4' }, [
            h('h1', { class: 'text-2xl font-semibold' }, 'Reply'),
            h(RecipientList, {
              label: 'To',
              id: 'to',
              modelValue: to.value,
              'onUpdate:modelValue': (v: string[]) => (to.value = v),
            }),
            h(RecipientList, {
              label: 'Cc',
              id: 'cc',
              modelValue: cc.value,
              'onUpdate:modelValue': (v: string[]) => (cc.value = v),
            }),
            h(ToneIntent, {
              tone: tone.value,
              intent: intent.value,
              instruction: note.value,
              'onUpdate:tone': (v: string) => (tone.value = v),
              'onUpdate:intent': (v: string) => (intent.value = v),
              'onUpdate:instruction': (v: string) => (note.value = v),
            }),
            h(DraftEditor, {
              modelValue: body.value,
              known: [],
              streaming: false,
              'onUpdate:modelValue': (v: string) => (body.value = v),
            }),
          ]),
      })
  },
})

const confirmation = defineComponent({
  render: () =>
    h(DefaultLayout, null, {
      default: () => [
        h('h1', { class: 'text-2xl font-semibold' }, 'Reply'),
        h(ConfirmDialog, {
          preview: { ...preview, placeholders: ['[confirm date]'] },
          needsPassword: false,
        }),
      ],
    }),
})

const bgSettings = {
  'bg.intervalMinutes': 15,
  'bg.aiEnabled': true,
  'notify.mode': 'important' as const,
  'notify.previews': false,
  'notify.quietStart': 1320,
  'notify.quietEnd': 420,
  'notify.mutedAccounts': [],
  'brief.minutes': 450,
  'brief.notify': true,
}

export const SCENES: Record<string, Scene> = {
  brief: {
    path: '/',
    root: shell(() => [
      h('h1', { class: 'mb-3 text-2xl font-semibold' }, 'Brief'),
      h(BriefBody, { brief, now: new Date('2026-10-28T08:00:00Z') }),
    ]),
  },
  inbox: { path: '/inbox', root: inbox },
  detail: {
    path: `/inbox/${A}`,
    root: shell(() => [
      h('h1', { class: 'mb-3 text-2xl font-semibold' }, detail.subject),
      h(AiCard, { messageId: A, triage }),
      h('div', { class: 'mt-3' }, [h(MessageCard, { message: detail, expanded: true })]),
    ]),
  },
  composer: { path: `/inbox/${A}/reply`, root: composer },
  confirmation: { path: `/inbox/${A}/reply`, root: confirmation },
  settings: {
    path: '/settings',
    root: shell(() => [
      h(SettingsHub),
      h('div', { class: 'mt-8 space-y-8' }, [
        h(BackgroundSettings, {
          settings: bgSettings,
          accounts: [
            { id: 'a1', email: 'me@example.test' },
            { id: 'a2', email: 'work@acme.example' },
          ],
        }),
        h(PrivacyForm, {
          settings: {
            'privacy.subjectOnly': false,
            'privacy.maxChars': 6000,
            'privacy.redactCards': true,
            'privacy.redactIbans': true,
            'privacy.redactPhones': true,
            'privacy.redactEmails': false,
            'retention.days': 30,
          },
          accounts: [{ id: 'a1', email: 'me@example.test', aiExcluded: false }],
        }),
      ]),
    ]),
  },
}
