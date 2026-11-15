import { normalizeAnalysis } from './analysis.js'
import { eventsFromAnalysis } from './calendar.js'
import { matchRule } from './rules.js'
import { createStore } from './store.js'
import {
  actionList,
  busyAction,
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
let rules = []
let analysis = null
let drafts = []
let starting = false
let refreshing = false
let lastJob = null
function busy(action) {
  document.querySelectorAll('[data-job-action]').forEach((button) => {
    button.dataset.label ||= button.textContent
    button.disabled = Boolean(action)
    button.setAttribute('aria-busy', String(button.dataset.jobAction === action))
    button.textContent = button.dataset.jobAction === action
      ? action === 'draft' ? 'Saving AI draft…' : 'Analysing…'
      : button.dataset.label
  })
}

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
        el('button', { class: 'btn btn--primary', type: 'button', dataset: { jobAction: 'analyze' }, onclick: () => runAnalyze(false), text: 'Analyze now' }),
      ),
    )
    $('actions').replaceChildren()
  }
  await showJob()
  const health = await send({ type: 'ping' })
  if (health.menus?.state === 'error') say(`Context menu setup failed: ${health.menus.error}`, 'status--error')
}

async function showJob() {
  if (!current) return
  const key = `sentinel.messageJob:${current.header.id}`
  const job = (await browser.storage.local.get(key))[key]
  if (!job) return
  const live = job.state === 'running' && (await send({ type: 'message-job-status', messageId: current.header.id })).active
  busy(live ? job.action : null)
  if (live) say(`${job.stage || (job.action === 'draft' ? 'Saving AI draft…' : 'Analysing…')} You can close this popup.`)
  else if (job.state === 'running') say('The action was interrupted. Please try again.', 'status--error')
  else if (job.state === 'error') {
    say(job.error || 'The action failed.', 'status--error')
    $('force-draft')?.remove()
    if (job.action === 'draft' && /already|exists/i.test(job.error ?? ''))
      $('actions').append(el('button', { id: 'force-draft', class: 'btn btn--small btn--danger', type: 'button', dataset: { jobAction: 'draft' }, onclick: () => saveDraft(true), text: 'Create another anyway' }))
  } else say(job.action === 'draft' ? 'Draft saved to your Drafts folder. Nothing was sent.' : 'Analysis saved.', 'status--ok')
}

async function startJob(action, force) {
  if (starting) return
  starting = true
  busy(action)
  say(action === 'draft' ? 'Saving AI draft…' : 'Analysing…')
  try {
    const res = await send({ type: 'message-job-start', messageId: current.header.id, action, force })
    if (!res?.ok) throw new Error(res?.error || 'Could not start the action.')
    await showJob()
  } catch (e) {
    busy(null)
    say(e.message, 'status--error')
  } finally { starting = false }
}
const runAnalyze = (force) => startJob('analyze', force)

function renderCalendar(events) {
  if (!events.length) return null
  const card = el('section', { class: 'card card--flat stack' },
    el('div', { class: 'section-title' }, el('h3', { text: 'Calendar' }), el('span', { class: 'meta', text: 'Add to your default writable Thunderbird calendar.' })),
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
          onclick: busyAction(() => addCalendar([event])),
          text: 'Add',
        }),
      ),
    )
  }
  if (events.length > 1)
    card.append(el('button', { class: 'btn btn--small', type: 'button', onclick: busyAction(() => addCalendar(events)), text: 'Add all' }))
  return card
}

async function addCalendar(events) {
  say('Adding calendar event…')
  const res = await send({ type: 'calendar-download', events }).catch((e) => ({ ok: false, error: e.message }))
  if (res?.ok === false) say(res.error ?? 'Could not save the calendar item.', 'status--error')
  else if (res?.mode === 'direct') {
    const name = res.created?.find((c) => c?.calendarName)?.calendarName
    say(name ? `Added to ${name}.` : 'Added to your calendar.', 'status--ok')
  } else if (res?.mode === 'download') {
    say(`Could not write to your calendar (${res.warning ?? 'direct access failed'}). Downloaded ${res.filename} — open it to add the event.`)
  } else say('Calendar file downloaded. Open it with your calendar.', 'status--ok')
}

function renderSenderRule() {
  const rule = matchRule(senderAddress(current?.header?.author), rules)
  $('sender-rule').textContent = rule ? `${rule.kind} rule` : 'No rule yet'
}

async function setRule(kind) {
  say('Saving sender rule…')
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
      ? el('button', { class: 'btn btn--primary', type: 'button', dataset: { jobAction: 'draft' }, onclick: () => saveDraft(false), text: 'Save AI draft' })
      : null,
    el('button', { class: 'btn', type: 'button', dataset: { jobAction: 'analyze' }, onclick: () => runAnalyze(true), text: 'Analyze again' }),
    el('button', { class: 'btn', type: 'button', onclick: openDashboard, text: 'Open dashboard' }),
  )
}

const saveDraft = (force) => startJob('draft', force)

async function refreshJob() {
  if (!current || starting || refreshing) return
  refreshing = true
  try {
    const key = `sentinel.messageJob:${current.header.id}`
    const job = (await browser.storage.local.get(key))[key]
    if (!job) return
    const signature = JSON.stringify(job)
    if (job.state !== 'running' && signature === lastJob) return
    lastJob = signature
    if (job.state === 'done') {
      analysis = await store.analysis(current.header)
      if (analysis) { analysis = { ...analysis, ...normalizeAnalysis(analysis) }; drafts = await store.drafts(); render() }
    }
    await showJob()
  } catch (e) { busy(null); say(e.message, 'status--error') }
  finally { refreshing = false }
}
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && current && changes[`sentinel.messageJob:${current.header.id}`]) void refreshJob()
})
// Reconcile even if a storage notification was missed or the background restarted.
const poll = setInterval(() => { void refreshJob() }, 2000)
window.addEventListener('unload', () => clearInterval(poll))

$('dashboard').onclick = openDashboard
document.querySelectorAll('[data-kind]').forEach((button) => {
  button.onclick = busyAction(() => setRule(button.dataset.kind))
})

void init().catch((e) => say(e?.message ?? 'Could not read this message.', 'status--error'))
