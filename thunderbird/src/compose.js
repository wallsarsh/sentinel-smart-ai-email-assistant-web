import { draftReplyStream, runTextTask, userContext } from './ai.js'
import { normalizeAnalysis } from './analysis.js'
import { monitorBlockedReason } from './config.js'
import { diffWords, renderDecisions } from './diff.js'
import { toMailMessage, withDraft } from './mail.js'
import { proofreadPrompt, rewritePrompt, selectionEnvelope } from './prompts.js'
import { getSelection, replaceSelection } from './selection.js'
import { createStore } from './store.js'
import { LENGTHS, TONES, composeRequest } from './tones.js'
import {
  actionList,
  categoryLabel,
  chip,
  clear,
  el,
  intentLabel,
  priorityChip,
  status,
} from './ui.js'

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
  length: 'standard',
  preview: '',
  diff: null,
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

function renderAnalysis() {
  const root = $('analysis')
  clear(root)
  if (!state.analysis) {
    root.hidden = true
    return
  }
  const a = state.analysis
  root.hidden = false
  root.append(
    el('div', { class: 'row row--between' },
      el('span', { class: 'meta', text: 'Original message' }),
      el('span', { class: 'chips' },
        priorityChip(a.priority),
        chip(intentLabel(a.intent), 'chip--accent'),
        chip(categoryLabel(a.category)),
      ),
    ),
    el('p', { class: 'item__summary', text: a.summary || 'No summary yet.' }),
    a.reason ? el('p', { class: 'meta', text: a.reason }) : null,
    a.actionItems?.length
      ? el('div', {}, el('div', { class: 'meta', text: 'Action items' }), actionList(a.actionItems))
      : null,
  )
}

function startPreview() {
  $('preview').value = ''
  $('preview-field').hidden = false
  $('insert-actions').hidden = true
  $('regenerate').hidden = true
}

function showPreview(body) {
  state.preview = body
  $('preview').value = body
  $('preview-field').hidden = false
  $('insert-actions').hidden = false
  $('regenerate').hidden = false
}

function renderDiff() {
  const root = $('diff-list')
  clear(root)
  if (!state.diff?.hunks.length) {
    $('diff').hidden = true
    return
  }
  for (const hunk of state.diff.hunks) {
    const accepted = state.diff.accepted.has(hunk.id)
    const stateLabel = el('span', { text: accepted ? 'Use suggestion' : 'Keep original' })
    root.append(
      el('div', { class: 'diff-hunk stack' },
        el('div', { class: 'row row--between' },
          el('span', { class: 'chip chip--warn', text: `Change ${hunk.id + 1}` }),
          el('label', { class: 'check' },
            el('input', {
              type: 'checkbox',
              checked: accepted,
              onchange: (e) => {
                if (e.target.checked) state.diff.accepted.add(hunk.id)
                else state.diff.accepted.delete(hunk.id)
                stateLabel.textContent = e.target.checked ? 'Use suggestion' : 'Keep original'
              },
            }),
            stateLabel,
          ),
        ),
        el('div', { class: 'diff-pair' },
          el('div', { class: 'diff-original' }, el('div', { class: 'meta', text: 'Original' }), el('div', { text: hunk.before })),
          el('div', { class: 'diff-suggestion' }, el('div', { class: 'meta', text: 'Suggestion' }), el('div', { text: hunk.after })),
        ),
      ),
    )
  }
  $('diff').hidden = false
}

async function reviewSelection(kind) {
  try {
    const selected = (await getSelection(state.tab.id)).trim()
    if (!selected) throw new Error('Select the text in the reply first.')
    say(kind === 'proofread' ? 'Proofreading…' : 'Rewriting…')
    const instruction =
      kind === 'rewrite'
        ? `Tone: ${state.tone}.${$('instruction').value.trim() ? ` ${$('instruction').value.trim()}` : ''}`
        : ''
    const system = kind === 'proofread' ? proofreadPrompt.system : rewritePrompt.system
    const user = `${instruction ? `${instruction}\n\n` : ''}${selectionEnvelope(selected)}`
    const result = await runTextTask(state.settings, kind, system, user)
    const diff = diffWords(selected, result)
    state.diff = { ...diff, accepted: new Set(diff.hunks.map((h) => h.id)) }
    if (!state.diff.hunks.length) {
      say('No changes suggested.', 'status--ok')
      $('diff').hidden = true
      return
    }
    renderDiff()
    say('Review each change, then apply the accepted ones.', 'status--ok')
  } catch (e) {
    say(e?.message ?? 'The selection could not be processed.', 'status--error')
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
  const intents = ['acknowledge', 'accept', 'decline', 'ask_for_info', 'custom']
  if (intents.includes(state.analysis?.replyIntent)) $('intent').value = state.analysis.replyIntent
  $('length').value = state.length

  const lengths = new Set(LENGTHS.map((l) => l.id))
  if (!lengths.has(state.length)) state.length = 'standard'

  $('context').textContent = `Replying to ${state.header.author ?? 'the sender'} · ${state.header.subject ?? '(no subject)'}`
  renderTones()
  renderAnalysis()
}

async function generate() {
  try {
    if (monitorBlockedReason(state.settings)) throw new Error(monitorBlockedReason(state.settings))
    const intent = $('intent').value
    if (intent === 'custom' && !$('instruction').value.trim())
      throw new Error('Add an instruction for the custom reply.')
    say('Drafting…')
    const accounts = await browser.accounts.list()
    const ctx = userContext(accounts, new Date(), state.settings.profile, state.rules)
    startPreview()
    const body = await draftReplyStream(
      state.settings,
      [state.message],
      ctx,
      composeRequest({
        tone: state.tone,
        intent,
        length: $('length').value,
        instruction: $('instruction').value,
      }),
      (_delta, full) => {
        $('preview').value = full
      },
    )
    showPreview(body)
    say('Preview ready. Edit it if needed, then insert it.', 'status--ok')
  } catch (e) {
    say(e?.message ?? 'The draft could not be generated.', 'status--error')
  }
}

async function insert() {
  try {
    const body = $('preview').value.trim()
    if (!body) throw new Error('The preview is empty.')
    const details = await browser.compose.getComposeDetails(state.tab.id)
    await browser.compose.setComposeDetails(state.tab.id, withDraft(details, body))
    say('Draft inserted above the quote. Review it and press Send yourself.', 'status--ok')
  } catch (e) {
    say(e?.message ?? 'The draft could not be inserted.', 'status--error')
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText($('preview').value)
    say('Preview copied.', 'status--ok')
  } catch {
    say('Could not copy the preview.', 'status--error')
  }
}

$('generate').onclick = generate
$('regenerate').onclick = generate
$('insert').onclick = insert
$('copy').onclick = copy
$('proofread').onclick = () => reviewSelection('proofread')
$('rewrite').onclick = () => reviewSelection('rewrite')
$('apply-diff').onclick = async () => {
  try {
    const text = renderDecisions(state.diff.ops, state.diff.accepted)
    await replaceSelection(state.tab.id, text)
    $('diff').hidden = true
    say('Accepted changes applied.', 'status--ok')
  } catch (e) {
    say(e?.message ?? 'The changes could not be applied.', 'status--error')
  }
}
$('discard-diff').onclick = () => {
  state.diff = null
  $('diff').hidden = true
  say('Changes discarded.')
}
$('length').onchange = () => {
  state.length = $('length').value
}
void init().catch((e) => say(e?.message ?? 'Could not read the compose window.', 'status--error'))
