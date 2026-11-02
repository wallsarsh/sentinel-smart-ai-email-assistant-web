import {
  chip,
  clear,
  el,
  empty,
  relativeTime,
} from './ui.js'

const TITLES = {
  topPriorities: 'Top priorities',
  needsReply: 'Needs a reply',
  dueToday: 'Due today',
  fyi: 'Good to know',
}
const STATS = [
  ['total', (n) => `${n} new`],
  ['needsReply', (n) => `${n} need a reply`],
  ['p1', (n) => `${n} urgent`],
  ['newsletters', (n) => `${n} newsletters`],
]

/** Renders a stored brief. Item text is model output, so it is only ever inserted as text. */
export function renderBrief(root, brief, open) {
  clear(root)
  if (!brief?.createdAt) {
    root.append(empty('No brief yet. Press Refresh brief.'))
    return
  }
  const head = el('section', { class: 'card card--accent stack' },
    el('div', { class: 'row row--between' },
      el('span', { class: 'chip chip--accent', text: 'Daily brief' }),
      el('span', { class: 'brief-generated', text: `Updated ${relativeTime(brief.createdAt)}` }),
    ),
    el('p', { class: 'brief-headline', text: brief.headline || 'Nothing needs your attention.' }),
  )
  const chips = el('div', { class: 'chips' })
  for (const [key, fmt] of STATS) if (brief.stats?.[key] > 0) chips.append(chip(fmt(brief.stats[key])))
  if (chips.childElementCount) head.append(chips)
  root.append(head)

  if (!brief.sections?.length) {
    root.append(el('p', { class: 'muted', text: 'No items to show.' }))
    return
  }
  for (const section of brief.sections) {
    const card = el('section', { class: 'card stack' },
      el('div', { class: 'section-title' }, el('h2', { text: TITLES[section.type] ?? section.type })),
    )
    for (const item of section.items ?? []) {
      const first = item.messageIds?.[0]
      const subject = brief.heads?.[first]?.subject
      card.append(
        el('div', { class: 'item' },
          el('div', { class: 'item__top' },
            el('span', { class: 'item__summary', text: item.text }),
            first
              ? el('button', { class: 'btn btn--small', type: 'button', onclick: () => open(first), title: subject ?? '', text: 'Open' })
              : null,
          ),
          subject ? el('div', { class: 'item__meta', text: subject }) : null,
        ),
      )
    }
    root.append(card)
  }
}
