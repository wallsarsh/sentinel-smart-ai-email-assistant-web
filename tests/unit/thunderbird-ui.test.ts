// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS modules shipped inside the extension
import { actionList, chip, el, priorityChip, wireTabs } from '../../thunderbird/src/ui.js'
// @ts-expect-error plain JS modules shipped inside the extension
import { renderBrief } from '../../thunderbird/src/brief-view.js'

describe('Thunderbird UI primitives', () => {
  it('inserts untrusted text as text, never as markup', () => {
    const node = el('p', { class: 'x', text: '<img src=x onerror=alert(1)>' })
    expect(node.querySelector('img')).toBeNull()
    expect(node.textContent).toBe('<img src=x onerror=alert(1)>')
    const chipNode = chip('<script>bad()</script>')
    expect(chipNode.querySelector('script')).toBeNull()
    expect(chipNode.textContent).toBe('<script>bad()</script>')
  })

  it('labels priority and actions', () => {
    expect(priorityChip('p1_do_now').textContent).toContain('P1')
    const list = actionList([
      { text: 'Send Q3', dueText: 'Friday' },
      { text: 'Call Alex', dueDate: '2026-11-06' },
    ])
    expect(list.querySelectorAll('li')).toHaveLength(2)
    expect(list.textContent).toContain('Friday')
  })

  it('renders a brief with links only to real messages', () => {
    const root = document.createElement('div')
    const open = vi.fn()
    renderBrief(
      root,
      {
        createdAt: new Date().toISOString(),
        headline: 'Alex needs the Q3 numbers <b>today</b>.',
        stats: { total: 3, needsReply: 1, p1: 1, newsletters: 1 },
        heads: { 1: { subject: 'Q3 numbers' } },
        sections: [
          {
            type: 'topPriorities',
            items: [
              { text: 'Send Q3 numbers', messageIds: ['1', '99'] },
              { text: 'No real id', messageIds: [] },
            ],
          },
        ],
      },
      open,
    )
    expect(root.querySelector('b')).toBeNull()
    expect(root.textContent).toContain('<b>today</b>')
    const buttons = [...root.querySelectorAll('button')]
    expect(buttons).toHaveLength(1)
    buttons[0].click()
    expect(open).toHaveBeenCalledWith('1')
  })

  it('supports arrow-key tab navigation', () => {
    document.body.innerHTML = `
      <div class="tabs">
        <button role="tab" data-tab="brief" aria-controls="p1" aria-selected="true">Brief</button>
        <button role="tab" data-tab="inbox" aria-controls="p2" aria-selected="false" tabindex="-1">Inbox</button>
      </div>
      <section id="p1"></section><section id="p2" hidden></section>`
    const root = document.querySelector('.tabs')
    const onChange = vi.fn()
    const tabs = wireTabs(root, onChange)
    tabs.tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(document.getElementById('p2').hidden).toBe(false)
    expect(tabs.tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(onChange).toHaveBeenCalledWith('inbox')
  })
})
