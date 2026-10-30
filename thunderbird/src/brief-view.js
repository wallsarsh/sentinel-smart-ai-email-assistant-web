const TITLES = {
  topPriorities: 'Top priorities',
  needsReply: 'Needs a reply',
  dueToday: 'Due today',
  fyi: 'Good to know',
}
const CHIPS = [
  ['total', (n) => `${n} new`],
  ['needsReply', (n) => `${n} need a reply`],
  ['p1', (n) => `${n} urgent`],
  ['newsletters', (n) => `${n} newsletters`],
]

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props)
  e.append(...kids)
  return e
}

/** Renders a stored brief. Item text is model output, so it is only ever inserted as text. */
export function renderBrief(root, brief, open) {
  root.replaceChildren()
  if (!brief) {
    root.append(el('p', { className: 'muted' }, 'No brief yet. Press Refresh brief.'))
    return
  }
  const when = new Date(brief.createdAt).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  root.append(el('p', { className: 'muted' }, `Generated ${when}`))
  root.append(el('p', { className: 'head' }, brief.headline || 'Nothing new to report.'))
  const chips = el('div', { className: 'chips' })
  for (const [k, fmt] of CHIPS)
    if (brief.stats?.[k] > 0) chips.append(el('span', {}, fmt(brief.stats[k])))
  root.append(chips)
  for (const s of brief.sections) {
    root.append(el('h2', {}, TITLES[s.type] ?? s.type))
    const ul = el('ul')
    for (const item of s.items) {
      const first = item.messageIds[0]
      const label = brief.heads?.[first]?.subject
      const li = el('li', {}, item.text)
      if (first)
        li.append(
          ' ',
          el(
            'button',
            { className: 'link', title: label ?? '', onclick: () => open(Number(first)) },
            'Open',
          ),
        )
      ul.append(li)
    }
    root.append(ul)
  }
}
