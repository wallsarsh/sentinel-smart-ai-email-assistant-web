import { mergeSettings, normalizeSettings } from './config.js'
import { providerUsable } from './providers.js'
import { normalizeRule } from './rules.js'
import { createStore } from './store.js'
import {
  categoryLabel,
  chip,
  clear,
  el,
  empty,
  formatDateTime,
  intentLabel,
  openMessage,
  priorityChip,
  relativeTime,
  send,
  status,
  wireTabs,
} from './ui.js'

const $ = (id) => document.getElementById(id)
const store = createStore(browser.storage.local)
const state = { tab: 'brief', filter: 'all', data: null, selected: new Set(), batchMessage: '' }

const FILTERS = [
  ['all', 'All'],
  ['reply', 'Needs reply'],
  ['p1', 'P1'],
  ['important', 'Important'],
  ['bulk', 'Bulk'],
  ['ignored', 'Ignored'],
]
const KIND_LABEL = {
  important: 'Important',
  marketing: 'Marketing',
  ignore: 'Ignore',
  normal: 'Normal',
}
const KIND_CHIP = {
  important: 'chip--p1',
  marketing: 'chip--warn',
  ignore: 'chip--p4',
  normal: '',
}

async function load() {
  const [settings, rules, brief, briefStatus, monitor, analyses, drafts] = await Promise.all([
    store.settings(),
    store.rules(),
    store.brief(),
    store.briefStatus(),
    store.monitor(),
    store.allAnalyses(),
    store.drafts(),
  ])
  state.data = { settings, rules, brief, briefStatus, monitor, analyses, drafts }
  return state.data
}

function pill(message, kind = '') {
  const node = $('status')
  node.className = `pill ${kind}`.trim()
  node.textContent = message
}

function renderStatus({ settings, monitor, briefStatus }) {
  if (!settings.providers?.some(providerUsable))
    return pill('Setup needed', 'pill--warn')
  if (monitor?.state === 'running') return pill('Checking…', 'pill--warn')
  if (monitor?.state === 'error' || briefStatus?.state === 'error')
    return pill('Needs attention', 'pill--error')
  if (monitor?.at) return pill(`Updated ${relativeTime(monitor.at)}`, 'pill--ok')
  return pill('Ready')
}

function renderBrief({ brief, briefStatus, monitor }) {
  const root = $('brief')
  clear(root)
  if (monitor?.state === 'error' && monitor.error) {
    root.append(el('div', { class: 'error', text: `Last check: ${monitor.error}` }))
  }
  if (briefStatus?.state === 'running') {
    root.append(el('div', { class: 'notice', text: 'Updating the brief…' }))
  }
  if (briefStatus?.state === 'error') {
    root.append(el('div', { class: 'warning', text: briefStatus.message ?? 'The brief could not be updated.' }))
  }
  if (!brief?.createdAt) {
    root.append(
      empty(
        'No brief yet. Run a refresh to analyse today’s inbox.',
        el('button', { class: 'btn btn--primary', type: 'button', onclick: () => refresh('brief'), text: 'Build brief' }),
      ),
    )
    return
  }
  const stats = brief.stats ?? {}
  const checkText = monitor?.at
    ? `Last check ${relativeTime(monitor.at)} · ${monitor.processed ?? 0} checked · ${monitor.analysed ?? 0} analysed${monitor.pending ? ` · ${monitor.pending} pending` : ''}`
    : 'No check has run yet.'
  const head = el(
    'section',
    { class: 'card card--accent stack' },
    el('div', { class: 'row row--between' },
      el('span', { class: 'chip chip--accent', text: 'Daily brief' }),
      el('span', { class: 'brief-generated', text: `Generated ${formatDateTime(brief.createdAt)}` }),
    ),
    el('p', { class: 'meta', text: checkText }),
    el('p', { class: 'brief-headline', text: brief.headline || 'Nothing needs your attention right now.' }),
    el(
      'div',
      { class: 'grid grid--stats' },
      ...[
        ['New mail', stats.total],
        ['Need reply', stats.needsReply],
        ['Urgent', stats.p1],
        ['Bulk', (stats.newsletters ?? 0) + (stats.notifications ?? 0)],
      ].map(([label, value]) =>
        el('div', { class: 'stat' }, el('div', { class: 'stat__value', text: String(value ?? 0) }), el('div', { class: 'stat__label', text: label })),
      ),
    ),
    el('div', { class: 'actions' },
      el('button', { class: 'btn btn--small', type: 'button', onclick: () => refresh('brief'), text: 'Refresh brief' }),
    ),
  )
  root.append(head)

  const titles = {
    topPriorities: 'Top priorities',
    needsReply: 'Needs a reply',
    dueToday: 'Due today',
    fyi: 'Good to know',
  }
  const sections = brief.sections ?? []
  if (!sections.length) {
    root.append(el('p', { class: 'muted', text: 'No items need attention. New mail will appear after the next check.' }))
    return
  }
  for (const section of sections) {
    const card = el('section', { class: 'card stack' },
      el('div', { class: 'section-title' }, el('h2', { text: titles[section.type] ?? section.type })),
    )
    for (const item of section.items ?? []) {
      const first = item.messageIds?.[0]
      const subject = brief.heads?.[first]?.subject
      card.append(
        el('div', { class: 'item' },
          el('div', { class: 'item__top' },
            el('span', { class: 'item__summary', text: item.text }),
            first
              ? el('button', { class: 'btn btn--small', type: 'button', onclick: () => openMessage(first), title: subject ?? '', text: 'Open' })
              : null,
          ),
          subject ? el('div', { class: 'item__meta', text: subject }) : null,
        ),
      )
    }
    root.append(card)
  }
}

const matchesFilter = (a, filter) => {
  if (filter === 'all') return true
  if (filter === 'reply') return Boolean(a.needsReply)
  if (filter === 'p1') return a.priority === 'p1_do_now'
  if (filter === 'important') return a.importance === 'high'
  if (filter === 'bulk') return ['newsletterMarketing', 'notificationAutomated', 'social'].includes(a.category)
  if (filter === 'ignored') return Boolean(a.skipped)
  return true
}

function renderInbox({ analyses }) {
  const rows = [...analyses].sort((a, b) => new Date(b.date ?? b.at ?? 0) - new Date(a.date ?? a.at ?? 0))
  const filters = $('inbox-filters')
  clear(filters)
  for (const [key, label] of FILTERS) {
    const count = rows.filter((a) => matchesFilter(a, key)).length
    filters.append(
      el('button', {
        class: `chip ${state.filter === key ? 'chip--accent' : ''}`.trim(),
        type: 'button',
        'aria-pressed': String(state.filter === key),
        onclick: () => {
          state.filter = key
          renderInbox({ analyses })
        },
        text: `${label} ${count}`,
      }),
    )
  }
  $('inbox-meta').textContent = `${rows.length} analysed${state.batchMessage ? ` · ${state.batchMessage}` : ''}`
  const root = $('inbox')
  clear(root)
  const visible = rows.filter((a) => matchesFilter(a, state.filter))
  if (!visible.length) {
    root.append(empty(rows.length ? 'Nothing in this filter.' : 'No analysed mail yet. Run a refresh.'))
    return
  }
  const list = el('div', { class: 'list' })
  for (const a of visible) {
    const subject = a.subject || '(no subject)'
    const selected = state.selected.has(a.messageId)
    const checkbox = el('input', {
      type: 'checkbox',
      checked: selected,
      'aria-label': `Select ${subject}`,
      onchange: (e) => {
        if (e.target.checked) state.selected.add(a.messageId)
        else state.selected.delete(a.messageId)
        renderInbox({ analyses })
      },
    })
    const row = el('div', { class: 'item' },
      el('div', { class: 'item__top' },
        checkbox,
        el('span', { class: 'item__title', text: subject }),
        el('span', { class: 'item__side' },
          priorityChip(a.priority),
          a.needsReply ? chip('Reply', 'chip--accent') : null,
          el('button', {
            class: 'btn btn--small',
            type: 'button',
            onclick: () => openMessage(a.messageId),
            text: 'Open',
          }),
        ),
      ),
      el('div', { class: 'item__meta' },
        `${a.sender || 'Unknown sender'} · ${categoryLabel(a.category)} · ${intentLabel(a.intent)} · ${relativeTime(a.date ?? a.at)}`,
      ),
      a.summary ? el('div', { class: 'item__summary', text: a.summary }) : null,
      a.skipped ? el('div', { class: 'item__meta', text: 'Classified locally — no AI call.' }) : null,
    )
    list.append(row)
  }
  root.append(list)
  renderBatchBar()
}

function renderBatchBar() {
  const bar = $('batch-bar')
  const count = state.selected.size
  bar.hidden = count === 0
  if (!count) return
  $('batch-count').textContent = `${count} selected`
}

async function runBatch(action) {
  if (!state.selected.size) return
  const ids = [...state.selected]
  $('batch-status').textContent = action === 'analyze' ? 'Analysing selected…' : 'Creating drafts…'
  const res = await send({ type: 'batch-run', action, ids }).catch((e) => ({
    ok: false,
    error: e.message,
  }))
  state.selected.clear()
  if (!res) state.batchMessage = 'Batch failed.'
  else if (res.ok === false) state.batchMessage = res.error ?? 'Batch failed.'
  else if (action === 'analyze')
    state.batchMessage = `Analysed ${res.analyzed ?? 0}${res.local ? `, ${res.local} local` : ''}${res.failed ? `, ${res.failed} failed` : ''}.`
  else state.batchMessage = `Created ${res.created ?? 0} drafts${res.failed ? `, ${res.failed} failed` : ''}.`
  await reload()
  $('inbox-meta').textContent = `${state.data?.analyses.length ?? 0} analysed · ${state.batchMessage}`
}

function renderDrafts({ drafts }) {
  const root = $('drafts')
  clear(root)
  if (!drafts.length) {
    root.append(empty('No drafts yet. Sentinel creates them for messages that need a reply.'))
    return
  }
  const list = el('div', { class: 'list' })
  for (const d of drafts) {
    list.append(
      el('div', { class: 'item' },
        el('div', { class: 'item__top' },
          el('span', { class: 'item__title', text: d.subject || '(no subject)' }),
          chip(d.status === 'saved' ? 'Saved draft' : 'Save failed', d.status === 'saved' ? 'chip--ok' : 'chip--warn'),
        ),
        el('div', { class: 'item__meta', text: `${d.sender || 'Unknown sender'} · ${formatDateTime(d.at)}${d.draftFolder ? ` · ${d.draftFolder}` : ''}` }),
        el('div', { class: 'actions' },
          d.draftId ? el('button', { class: 'btn btn--small', type: 'button', onclick: () => openMessage(d.draftId), text: 'Open draft' }) : null,
          d.messageId ? el('button', { class: 'btn btn--small', type: 'button', onclick: () => openMessage(d.messageId), text: 'Open source' }) : null,
        ),
        d.error ? el('div', { class: 'error', text: d.error }) : null,
      ),
    )
  }
  root.append(list)
}

function renderSenders({ rules }) {
  const root = $('rules')
  clear(root)
  if (!rules.length) {
    root.append(empty('No sender rules yet. Add one above to save tokens or raise a sender.'))
    return
  }
  const list = el('div', { class: 'list' })
  for (const r of rules) {
    list.append(
      el('div', { class: 'item' },
        el('div', { class: 'item__top' },
          el('span', { class: 'item__title code', text: r.pattern }),
          chip(KIND_LABEL[r.kind] ?? r.kind, KIND_CHIP[r.kind] ?? ''),
        ),
        el('div', { class: 'actions' },
          el('button', {
            class: 'btn btn--small btn--danger',
            type: 'button',
            onclick: () => removeRule(r.id),
            text: 'Remove',
          }),
        ),
      ),
    )
  }
  root.append(list)
}

function renderSettings({ settings }) {
  $('monitor-enabled').checked = settings.monitor.enabled
  const interval = $('monitor-interval')
  if (![...interval.options].some((o) => o.value === String(settings.monitor.intervalMinutes)))
    interval.append(el('option', { value: String(settings.monitor.intervalMinutes), text: `${settings.monitor.intervalMinutes} minutes` }))
  interval.value = String(settings.monitor.intervalMinutes)
  $('monitor-max').value = String(settings.monitor.maxMessagesPerRun)
  $('monitor-ai').value = String(settings.monitor.maxAiMessagesPerRun)
  $('monitor-lookback').value = String(settings.monitor.lookbackDays)
  $('monitor-tagging').checked = settings.monitor.tagging
  $('monitor-local').checked = settings.monitor.includeLocalFolders
  $('draft-auto').checked = settings.monitor.autoDraft
  $('draft-max').value = String(settings.monitor.maxDraftsPerRun)
  $('draft-priority').value = settings.monitor.draftMinPriority
  $('profile-tone').value = settings.profile.tone
  $('profile-signoff').value = settings.profile.signOff
  $('monitor-marketing').checked = settings.monitor.analyzeMarketing
  $('brief-enabled').checked = settings.brief.enabled
  $('brief-hourly').checked = settings.brief.updateHourly
  $('brief-notify').checked = settings.brief.notify
  const hour = $('brief-hour')
  if (!hour.options.length) {
    for (let h = 0; h < 24; h++)
      hour.append(el('option', { value: String(h), text: `${String(h).padStart(2, '0')}:00` }))
  }
  hour.value = String(settings.brief.hour)
}

function render() {
  const data = state.data
  if (!data) return
  renderStatus(data)
  renderBrief(data)
  renderInbox(data)
  renderDrafts(data)
  renderSenders(data)
  renderSettings(data)
}

async function refresh(what = 'all') {
  $('refresh').disabled = true
  status($('settings-status'), 'Working…')
  await send({ type: what === 'brief' ? 'brief-run' : 'monitor-run', brief: true }).catch(() => undefined)
  $('refresh').disabled = false
}

async function removeRule(id) {
  const res = await send({ type: 'rule-remove', id }).catch((e) => ({ ok: false, error: e.message }))
  if (res?.ok === false) return status($('rule-status'), res.error ?? 'Could not remove the rule.', 'status--error')
  await reload()
  status($('rule-status'), 'Rule removed.', 'status--ok')
}

async function reload() {
  await load()
  render()
}

function saveSettings(event) {
  event.preventDefault()
  const current = state.data?.settings ?? normalizeSettings({})
  const patch = {
    monitor: {
      enabled: $('monitor-enabled').checked,
      intervalMinutes: Number($('monitor-interval').value),
      maxMessagesPerRun: Number($('monitor-max').value),
      maxAiMessagesPerRun: Number($('monitor-ai').value),
      lookbackDays: Number($('monitor-lookback').value),
      tagging: $('monitor-tagging').checked,
      includeLocalFolders: $('monitor-local').checked,
      autoDraft: $('draft-auto').checked,
      maxDraftsPerRun: Number($('draft-max').value),
      draftMinPriority: $('draft-priority').value,
      analyzeMarketing: $('monitor-marketing').checked,
    },
    brief: {
      enabled: $('brief-enabled').checked,
      hour: Number($('brief-hour').value),
      updateHourly: $('brief-hourly').checked,
      notify: $('brief-notify').checked,
    },
    profile: {
      tone: $('profile-tone').value,
      signOff: $('profile-signoff').value.trim(),
    },
  }
  const next = normalizeSettings(mergeSettings(current, patch))
  store
    .saveSettings(next)
    .then(async () => {
      status($('settings-status'), 'Saved.', 'status--ok')
      await reload()
    })
    .catch((e) => status($('settings-status'), e?.message ?? 'Could not save settings.', 'status--error'))
}

$('refresh').onclick = () => refresh('all')
$('provider').onclick = () => browser.runtime.openOptionsPage()
$('run-now').onclick = () => refresh('all')
$('batch-analyze').onclick = () => runBatch('analyze')
$('batch-draft').onclick = () => runBatch('draft')
$('batch-clear').onclick = () => {
  state.selected.clear()
  renderInbox(state.data)
}
$('settings-form').addEventListener('submit', saveSettings)
$('rule-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  try {
    const rule = normalizeRule({ pattern: $('rule-pattern').value, kind: $('rule-kind').value })
    const res = await send({ type: 'rule-set', pattern: rule.pattern, kind: rule.kind })
    if (res?.ok === false) throw new Error(res.error)
    $('rule-pattern').value = ''
    status($('rule-status'), 'Rule saved.', 'status--ok')
    await reload()
  } catch (err) {
    status($('rule-status'), err?.message ?? 'Could not save the rule.', 'status--error')
  }
})

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (Object.keys(changes).some((k) => k.startsWith('sentinel') || ['brief', 'briefStatus', 'settings', 'senderRules'].includes(k)))
    void reload()
})

const tabs = wireTabs(document.querySelector('.tabs'), (tab) => {
  state.tab = tab
  history.replaceState(null, '', `#${tab}`)
  render()
})
const initial = location.hash.replace('#', '') || 'brief'
const index = Math.max(0, [...document.querySelectorAll('[role="tab"]')].findIndex((t) => t.dataset.tab === initial))
tabs.select(index)
void send({ type: 'brief-seen' }).catch(() => undefined)
void reload().catch((e) => {
  $('status').className = 'pill pill--error'
  $('status').textContent = e?.message ?? 'Could not load the dashboard.'
})
