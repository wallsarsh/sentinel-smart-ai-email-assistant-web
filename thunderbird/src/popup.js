import { analyze, draftReply, userContext } from './ai.js'
import { toMailMessage } from './mail.js'

const $ = (id) => document.getElementById(id)
const say = (t) => ($('out').textContent = t)

async function current() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  // Thunderbird returns a page of messages (one for a single selection); older builds had a singular form.
  const md = browser.messageDisplay
  const shown = md.getDisplayedMessages
    ? await md.getDisplayedMessages(tab.id).then((r) => (Array.isArray(r) ? r : r?.messages))
    : [await md.getDisplayedMessage(tab.id)]
  const header = shown?.[0]
  if (!header) throw new Error('Open a message first.')
  const full = await browser.messages.getFull(header.id)
  const ctx = userContext(await browser.accounts.list())
  return { id: header.id, message: toMailMessage(header, full), ctx }
}

async function settings() {
  const { settings: s } = await browser.storage.local.get('settings')
  if (!s?.baseUrl || !s?.apiKey || !s?.model) {
    await browser.runtime.openOptionsPage()
    throw new Error('Set the API URL, key and model first.')
  }
  return s
}

async function run(fn) {
  try {
    say('Working…')
    await fn()
  } catch (e) {
    say(e.message)
  }
}

const PRIORITY = { high: 'High importance', medium: 'Medium importance', low: 'Low importance' }

$('sum').onclick = () =>
  run(async () => {
    const m = await current()
    const r = await analyze(await settings(), m.message, m.ctx)
    const lines = [
      `${PRIORITY[r.importance] ?? r.importance}${r.urgency === 'urgent' ? ' · urgent' : ''}${r.needsReply ? ' · needs a reply' : ''}`,
      '',
      r.summary,
    ]
    if (r.actionItems.length) {
      lines.push('', 'Action items:')
      for (const a of r.actionItems)
        lines.push(`• ${a.text}${a.dueText || a.dueDate ? ` (${a.dueText || a.dueDate})` : ''}`)
    }
    say(lines.join('\n'))
  })

// The draft opens in Thunderbird's own reply window. Nothing is sent from here.
$('reply').onclick = () =>
  run(async () => {
    const m = await current()
    const instruction = $('instr').value.trim()
    const draft = await draftReply(await settings(), [m.message], m.ctx, {
      tone: 'professional',
      intent: instruction ? 'custom' : 'acknowledge',
      instruction,
    })
    await browser.runtime.sendMessage({ type: 'open-reply', messageId: m.id, draft })
    say('Draft opened. Review it and press Send yourself.')
  })
