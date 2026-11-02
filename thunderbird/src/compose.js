import { draftReply, userContext } from './ai.js'
import { normalizeAnalysis } from './analysis.js'
import { monitorBlockedReason } from './config.js'
import { toMailMessage, withDraft } from './mail.js'
import { createStore } from './store.js'
import { TONES, toneRequest } from './tones.js'
import { clear, el, status } from './ui.js'

const $ = (id) => document.getElementById(id)
const store = createStore(browser.storage.local)
const state = {
  tab: null,
  details: null,
  header: null,
  message: null,
  analysis: null,
  settings: null,
  rules: [],
  tone: 'standard',
}

const say = (message, kind = '') => status($('status'), message, kind)

function renderTones() {
  const root = $('tones')
  clear(root)
  for (const tone of TONES) {
    root.append(
      el('button', {
        type: 'button',
        class: `chip ${state.tone === tone.id ? 'chip--accent' : ''}`.trim(),
        'aria-pressed': String(state.tone === tone.id),
        onclick: () => {
          state.tone = tone.id
          renderTones()
        },
        text: tone.label,
      }),
    )
  }
}

async function findComposeTab() {
  const current = await browser.tabs.query({ active: true, currentWindow: true })
  for (const tab of current ?? []) {
    try {
      await browser.compose.getComposeDetails(tab.id)
      return tab
    } catch {
      // Not the compose tab; keep looking.
    }
  }
  const all = await browser.tabs.query({})
  for (const tab of all ?? []) {
    try {
      await browser.compose.getComposeDetails(tab.id)
      return tab
    } catch {
      // Not a compose tab.
    }
  }
  throw new Error('Open a reply compose window first, then choose a tone.')
}

async function init() {
  state.settings = await store.settings()
  state.rules = await store.rules()
  const tab = await findComposeTab()
  state.tab = tab
  state.details = await browser.compose.getComposeDetails(tab.id)
  const related = state.details.relatedMessageId
  if (related == null) throw new Error('Open a reply compose window first, then choose a tone.')
  state.header = await browser.messages.get(related)
  if (!state.header) throw new Error('The original message could not be read.')
  const full = await browser.messages.getFull(related)
  state.message = toMailMessage(state.header, full)
  const cached = await store.analysis(state.header)
  state.analysis = cached ? { ...cached, ...normalizeAnalysis(cached) } : null
  state.tone = ['standard', 'professional', 'friendly', 'concise', 'formal'].includes(
    state.settings.profile.tone,
  )
    ? state.settings.profile.tone
    : 'standard'
  $('context').textContent = `Replying to ${state.header.author ?? 'the sender'} · ${state.header.subject ?? '(no subject)'}`
  renderTones()
}

async function generate() {
  try {
    if (monitorBlockedReason(state.settings)) throw new Error(monitorBlockedReason(state.settings))
    say('Drafting…')
    const accounts = await browser.accounts.list()
    const ctx = userContext(accounts, new Date(), state.settings.profile, state.rules)
    const body = await draftReply(
      state.settings,
      [state.message],
      ctx,
      toneRequest(state.tone, {
        intent: state.analysis?.replyIntent ?? 'acknowledge',
        instruction: $('instruction').value,
      }),
    )
    const details = await browser.compose.getComposeDetails(state.tab.id)
    await browser.compose.setComposeDetails(state.tab.id, withDraft(details, body))
    say('Draft inserted. Review it and press Send yourself.', 'status--ok')
    $('regenerate').hidden = false
  } catch (e) {
    say(e?.message ?? 'The draft could not be generated.', 'status--error')
  }
}

$('generate').onclick = generate
$('regenerate').onclick = generate
void init().catch((e) => say(e?.message ?? 'Could not read the compose window.', 'status--error'))
