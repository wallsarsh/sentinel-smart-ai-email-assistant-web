// Small DOM primitives shared by every extension page. Untrusted text is only ever inserted as text.
export const PRIORITY_LABEL = {
  p1_do_now: 'P1 · Do now',
  p2_today: 'P2 · Today',
  p3_this_week: 'P3 · This week',
  p4_fyi: 'P4 · FYI',
}
export const PRIORITY_CLASS = {
  p1_do_now: 'p1',
  p2_today: 'p2',
  p3_this_week: 'p3',
  p4_fyi: 'p4',
}
export const INTENT_LABEL = {
  request: 'Request',
  question: 'Question',
  meeting: 'Meeting',
  approval: 'Approval',
  payment: 'Payment',
  informational: 'Information',
  marketing: 'Marketing',
  notification: 'Notification',
  social: 'Social',
  security: 'Security',
  other: 'Other',
}
export const CATEGORY_LABEL = {
  directPersonal: 'Personal',
  workRequest: 'Work request',
  meetingCalendar: 'Meeting',
  financeBilling: 'Finance',
  notificationAutomated: 'Notification',
  newsletterMarketing: 'Newsletter',
  social: 'Social',
  securityAccount: 'Security',
  other: 'Other',
}

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null) continue
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key === 'dataset') Object.assign(node.dataset, value)
    else if (key.startsWith('on') && typeof value === 'function')
      node.addEventListener(key.slice(2).toLowerCase(), value)
    else if (key in node) node[key] = value
    else node.setAttribute(key, value)
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue
    node.append(typeof kid === 'string' || typeof kid === 'number' ? String(kid) : kid)
  }
  return node
}

export const clear = (node) => node.replaceChildren()
export const text = (s) => document.createTextNode(String(s ?? ''))

export function chip(label, kind = '') {
  return el('span', { class: `chip ${kind}`.trim(), text: label })
}

export function priorityChip(priority) {
  return chip(PRIORITY_LABEL[priority] ?? 'P4 · FYI', `chip--${PRIORITY_CLASS[priority] ?? 'p4'}`)
}

export const intentLabel = (intent) => INTENT_LABEL[intent] ?? 'Other'
export const categoryLabel = (category) => CATEGORY_LABEL[category] ?? 'Other'

export function relativeTime(value, now = new Date()) {
  const d = value instanceof Date ? value : new Date(value ?? 0)
  if (!Number.isFinite(d.getTime())) return ''
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.round(diff / 60_000)} min ago`
  if (diff < 24 * 3600_000) return `${Math.round(diff / 3600_000)} h ago`
  if (diff < 48 * 3600_000) return 'yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value ?? 0)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function status(node, message, kind = '') {
  node.className = `status ${kind}`.trim()
  node.textContent = message ?? ''
  node.hidden = !message
}

export function empty(message, action = null) {
  return el('div', { class: 'empty' }, el('p', { class: 'muted', text: message }), action)
}

export const openMessage = (id) =>
  id == null
    ? Promise.resolve()
    : browser.messageDisplay.open({ messageId: Number(id) }).catch(() => undefined)

export const openDashboard = () => {
  // Seeing the dashboard clears the brief badge without waiting for another monitor run.
  void browser.runtime.sendMessage({ type: 'brief-seen' }).catch(() => undefined)
  return browser.tabs.create({ url: browser.runtime.getURL('dist/dashboard.html') }).catch(() => undefined)
}

export const send = (message) => browser.runtime.sendMessage(message)

/** Keyboard behaviour for a tablist: arrows move, Home/End jump, each tab selects on focus. */
export function wireTabs(root, onChange) {
  const tabs = [...root.querySelectorAll('[role="tab"]')]
  const select = (index) => {
    const tab = tabs[index]
    if (!tab) return
    tabs.forEach((t, i) => {
      const selected = i === index
      t.setAttribute('aria-selected', String(selected))
      t.tabIndex = selected ? 0 : -1
      const panel = document.getElementById(t.getAttribute('aria-controls'))
      if (panel) panel.hidden = !selected
    })
    onChange?.(tab.dataset.tab)
    tab.focus()
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i))
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        select((i + 1) % tabs.length)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        select((i - 1 + tabs.length) % tabs.length)
      } else if (e.key === 'Home') {
        e.preventDefault()
        select(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        select(tabs.length - 1)
      }
    })
  })
  return { select, tabs }
}

/** Renders a labelled action row for an analysis. */
export function actionList(actions = []) {
  if (!actions.length) return el('p', { class: 'muted', text: 'No action items.' })
  return el(
    'ul',
    { class: 'actions' },
    ...actions.map((a) =>
      el(
        'li',
        {},
        el('span', { text: a.text }),
        a.dueText || a.dueDate
          ? el('span', { class: 'meta', text: ` · ${a.dueText || a.dueDate}` })
          : null,
      ),
    ),
  )
}
