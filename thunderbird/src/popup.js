import { chat, extractText, replyMessages, summaryMessages } from './core.js'

const $ = (id) => document.getElementById(id)
const say = (t) => ($('out').textContent = t)

async function current() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  const msg = await browser.messageDisplay.getDisplayedMessage(tab.id)
  if (!msg) throw new Error('Open a message first.')
  const full = await browser.messages.getFull(msg.id)
  return {
    id: msg.id,
    subject: msg.subject,
    from: msg.author,
    text: extractText(full),
  }
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

$('sum').onclick = () =>
  run(async () => {
    const m = await current()
    say(await chat(await settings(), summaryMessages(m)))
  })

// The draft opens in Thunderbird's own reply window. Nothing is sent from here.
$('reply').onclick = () =>
  run(async () => {
    const m = await current()
    const body = await chat(await settings(), replyMessages(m, { instruction: $('instr').value }))
    await browser.compose.beginReply(m.id, 'replyToSender', { body, isPlainText: true })
    say('Draft opened. Review it and press Send yourself.')
  })
