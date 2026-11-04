import { analyze, userContext } from './ai.js'
import { normalizeAnalysis } from './analysis.js'
import { monitorBlockedReason } from './config.js'
import { eventsFromAnalysis } from './calendar.js'
import { toMailMessage } from './mail.js'
import { matchRule, applyAnalysisPolicy, preFilter, withSender } from './rules.js'
import { createStore } from './store.js'
import {
  actionList,
  categoryLabel,
  chip,
  clear,
  el,
  empty,
  formatDateTime,
  intentLabel,
  openDashboard,
  priorityChip,
  send,
  status,
} from './ui.js'

const $ = (id) => document.getElementById(id)
const store = createStore(browser.storage.local)
let current = null
let settings = null
let rules = []
let analysis = null
let drafts = []

const say = (message, kind = '') => status($('status'), message, kind)
const senderAddress = (author) => {
  const m = /<([^>\s]+)>$/.exec(String(author ?? ''))
  return (m ? m[1] : String(author ?? '')).toLowerCase()
}

async function activeMessage() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  const md = browser.messageDisplay
  const shown = md.getDisplayedMessages
    ? await md.getDisplayedMessages(tab.id).then((r) => (Array.isArray(r) ? r : r?.messages))
    : [await md.getDisplayedMessage(tab.id)]
  return shown?.[0] ?? null
}

async function init() {
  settings = await store.settings()
  rules = await store.rules()
  drafts = await store.drafts()
  const header = await activeMessage()
  if (!header) {
    $('subject').textContent = 'Open a message first.'
    say('Select a message in Thunderbird, then open Sentinel again.')
    return
  }
  current = { header, message: null }
  $('subject').textContent = header.subject || '(no subject)'
  $('meta').textContent = `${header.author || 'Unknown sender'} · ${formatDateTime(header.date)}`
  $('senders').hidden = false
  renderSenderRule()
  analysis = await store.analysis(header)
  if (analysis) analysis = { ...analysis, ...normalizeAnalysis(analysis) }
  if (analysis) render()
  else {
    $('view').replaceChildren(
      empty(
        'This message has not been analysed yet.',
        el('button', { class: 'btn btn--primary', type: 'button', onclick: () => runAnalyze(false), text: 'Analyze now' }),
      ),
    )
    $('actions').replaceChildren()
  }
}

async function message() {
  if (current?.message) return current.message
  const full = await browser.messages.getFull(current.header.id)
  current.message = toMailMessage(current.header, full)
  return current.message
}

async function context() {
  const accounts = await browser.accounts.list()
  return userContext(accounts, new Date(), settings.profile, rules)
}

async function runAnalyze(force) {
  if (!settings || monitorBlockedReason(settings)) {
    say(monitorBlockedReason(settings ?? {}), 'status--error')
    return
  }
  try {
    say('Analysing…')
    const m = await message()
    const plan = preFilter(m, rules, settings, new Date())
    const result = plan.action === 'local' ? plan.analysis : await analyze(settings, m, await context())
    const stored = withSender(
      applyAnalysisPolicy(result, plan),
      current.header,
      Date.now(),
    )
    stored.by = plan.action === 'local' ? 'rule' : 'ai'
    stored.promptVersion = plan.action === 'local' ? null : 'assistant.v1'
    await store.saveAnalysis(current.header, stored)
    analysis = stored
    render()
    void send({ type: 'tag-message', messageId: current.header.id }).catch(() => undefined)
    say(
      plan.action === 'local'
        ? 'Classified locally — no AI call was made.'
        : force
          ? 'Analysed again.'
          : 'Analysis saved.',
      'status--ok',
    )
  } catch (e) {
    say(e.message ?? 'The analysis failed.', 'status--error')
  }
}

function renderCalendar(events) {
  if (!events.length) return null
  const card = el('section', { class: 'card card--flat stack' },
    el('div', { class: 'section-title' }, el('h3', { text: 'Calendar' }), el('span', { class: 'meta', text: 'Export first, then open or import.' })),
  )
  for (const event of events) {
    card.append(
      el('div', { class: 'row row--between' },
        el('div', {},
          el('div', { text: event.title }),
          el('div', { class: 'meta', text: `${event.allDay ? 'All day' : formatDateTime(event.start)}${event.location ? ` · ${event.location}` : ''}` }),
        ),
        el('button', {
          class: 'btn btn--small',
          type: 'button',
          onclick: () => addCalendar([event]),
          text: 'Add',
        }),
      ),
    )
  }
  if (events.length > 1)
    card.append(el('button', { class: 'btn btn--small', type: 'button', onclick: () => addCalendar(events), text: 'Add all' }))
  return card
}

async function addCalendar(events) {
  const res = await send({ type: 'calendar-download', events }).catch((e) => ({ ok: false, error: e.message }))
  if (res?.ok === false) say(res.error ?? 'Could not save the calendar item.', 'status--error')
  else if (res?.mode === 'direct') say('Added to your calendar.', 'status--ok')
  else say('Calendar file downloaded. Open it with your calendar.', 'status--ok')
}

function renderSenderRule() {
  const rule = matchRule(senderAddress(current?.header?.author), rules)
  $('sender-rule').textContent = rule ? `${rule.kind} rule` : 'No rule yet'
}

async function setRule(kind) {
  const address = senderAddress(current?.header?.author)
  if (!address) return
  const res = await send({ type: 'rule-set', pattern: address, kind }).catch((e) => ({ ok: false, error: e.message }))
  if (res?.ok === false) return say(res.error ?? 'Could not save the rule.', 'status--error')
  rules = await store.rules()
  renderSenderRule()
  say(`Sender marked ${kind}.`, 'status--ok')
}

function render() {
  const root = $('view')
  clear(root)
  const a = analysis
  const chips = el('div', { class: 'chips' },
    priorityChip(a.priority),
    chip(intentLabel(a.intent), 'chip--accent'),
    chip(categoryLabel(a.category)),
    a.needsReply ? chip('Needs reply', 'chip--ok') : null,
    a.skipped ? chip('Local rule', 'chip--warn') : null,
    drafts.some((d) => d.messageId === current.header.id && d.status === 'saved')
      ? chip('Draft saved', 'chip--ok')
      : null,
  )
  const card = el('section', { class: 'card stack' },
    chips,
    el('p', { class: 'brief-headline', text: a.summary || 'No summary.' }),
    a.reason ? el('p', { class: 'meta', text: a.reason }) : null,
    el('div', { class: 'section-title' }, el('h3', { text: 'Action items' })),
    actionList(a.actionItems),
  )
  root.append(card)
  const events = eventsFromAnalysis(a, { header: current.header })
  const calendar = renderCalendar(events)
  if (calendar) root.append(calendar)

  const actions = $('actions')
  clear(actions)
  actions.append(
    a.needsReply && !a.skipped
      ? el('button', { class: 'btn btn--primary', type: 'button', onclick: () => saveDraft(false), text: 'Save AI draft' })
      : null,
    el('button', { class: 'btn', type: 'button', onclick: () => runAnalyze(true), text: 'Analyze again' }),
    el('button', { class: 'btn', type: 'button', onclick: openDashboard, text: 'Open dashboard' }),
  )
}

async function saveDraft(force) {
  say('Drafting…')
  const res = await send({ type: 'draft-create', messageId: current.header.id, force }).catch((e) => ({
    ok: false,
    error: e.message,
  }))
  if (res?.ok === false) {
    say(res.error ?? 'The draft could not be saved.', 'status--error')
    if (/already|exists|draft/i.test(res.error ?? '')) {
      $('actions').append(
        el('button', { class: 'btn btn--small btn--danger', type: 'button', onclick: () => saveDraft(true), text: 'Create another anyway' }),
      )
    }
    return
  }
  say('Draft saved to your Drafts folder. Nothing was sent.', 'status--ok')
  if (res.draft) drafts = [res.draft, ...drafts]
  render()
}

$('dashboard').onclick = openDashboard
$('senders').addEventListener('click', (e) => {
  const kind = e.target?.dataset?.kind
  if (kind) void setRule(kind)
})

void init().catch((e) => say(e?.message ?? 'Could not read this message.', 'status--error'))
