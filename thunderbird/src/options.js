import { enhanceActions, clear, el, openDashboard, status  } from './ui.js'
import { checkBaseUrl } from './mail.js'
import {
  PROVIDER_PRESETS,
  TASKS,
  TASK_LABELS,
  normalizeProvider,
  providerUsable,
} from './providers.js'
import { createStore } from './store.js'

const $ = (id) => document.getElementById(id)
const store = createStore(browser.storage.local)
let settings = null
let editingId = null

const say = (node, message, kind = '') => status(node, message, kind)

function fillPresetOptions() {
  const select = $('preset')
  for (const preset of PROVIDER_PRESETS)
    select.append(el('option', { value: preset.id, text: preset.name }))
}

function applyPreset() {
  const preset = PROVIDER_PRESETS.find((p) => p.id === $('preset').value)
  if (!preset) return
  $('pname').value = preset.name
  $('pkind').value = preset.kind
  $('pbase').value = preset.baseUrl
  $('pmodel').value = preset.model
  $('pkey').value = ''
  $('pkey').placeholder = preset.keyRequired ? 'Paste a key' : 'Optional for a local server'
  $('key-note').textContent = preset.keyRequired
    ? 'The key stays in this Thunderbird profile and goes only to this provider.'
    : 'A local server usually needs no key; if it does, it stays in this profile.'
}

function resetForm() {
  editingId = null
  $('preset').value = 'openai'
  applyPreset()
  $('pkey').value = ''
  $('save-provider').textContent = 'Add provider'
  $('cancel-edit').hidden = true
}

function renderProviders() {
  const root = $('providers')
  clear(root)
  if (!settings.providers.length) {
    root.append(el('p', { class: 'muted', text: 'No provider configured yet.' }))
    return
  }
  for (const p of settings.providers) {
    root.append(
      el('div', { class: 'item' },
        el('div', { class: 'item__top' },
          el('span', { class: 'item__title', text: p.name }),
          el('span', { class: 'item__side' },
            el('span', { class: 'chip', text: p.kind === 'openai_compatible' ? 'compatible' : p.kind }),
            p.id === settings.defaultProviderId ? el('span', { class: 'chip chip--accent', text: 'default' }) : null,
            !providerUsable(p) ? el('span', { class: 'chip chip--warn', text: 'incomplete' }) : null,
          ),
        ),
        el('div', { class: 'item__meta', text: `${p.baseUrl || 'No URL'} · ${p.model || 'No model'}` }),
        el('div', { class: 'actions' },
          el('button', { class: 'btn btn--small', type: 'button', onclick: () => editProvider(p.id), text: 'Edit' }),
          el('button', { class: 'btn btn--small btn--danger', type: 'button', onclick: () => removeProvider(p.id), text: 'Remove' }),
        ),
      ),
    )
  }
}

function renderRoutes() {
  const root = $('routes')
  clear(root)
  for (const task of TASKS) {
    const route = settings.routes[task]
    const provider = settings.providers.find((p) => p.id === route.providerId)
    const providerSelect = el(
      'select',
      { 'aria-label': `${TASK_LABELS[task]} provider` },
      ...settings.providers.map((p) =>
        el('option', { value: p.id, text: p.name, selected: p.id === route.providerId }),
      ),
    )
    const modelInput = el('input', {
      value: route.model,
      placeholder: provider?.model ?? 'Model',
      'aria-label': `${TASK_LABELS[task]} model`,
    })
    providerSelect.addEventListener('change', () => {
      const next = settings.providers.find((p) => p.id === providerSelect.value)
      if (next) modelInput.value = next.model
    })
    root.append(
      el('div', { class: 'item' },
        el('div', { class: 'item__top' }, el('span', { class: 'item__title', text: TASK_LABELS[task] })),
        el('div', { class: 'grid grid--2' },
          el('label', { class: 'field' }, el('span', { text: 'Provider' }), providerSelect),
          el('label', { class: 'field' }, el('span', { text: 'Model' }), modelInput),
        ),
      ),
    )
  }
}

function editProvider(id) {
  const p = settings.providers.find((x) => x.id === id)
  if (!p) return
  editingId = id
  $('pname').value = p.name
  $('pkind').value = p.kind
  $('pbase').value = p.baseUrl
  $('pmodel').value = p.model
  $('pkey').value = ''
  $('pkey').placeholder = 'Saved key — leave blank to keep it'
  $('key-note').textContent = p.apiKey
    ? `A key is saved (ending ${p.apiKey.slice(-4)}). Leave blank to keep it.`
    : 'No key saved.'
  $('save-provider').textContent = 'Save provider'
  $('cancel-edit').hidden = false
}

async function removeProvider(id) {
  const next = settings.providers.filter((p) => p.id !== id)
  const defaultProviderId =
    settings.defaultProviderId === id ? (next[0]?.id ?? '') : settings.defaultProviderId
  settings = await store.saveSettings({ providers: next, defaultProviderId })
  if (editingId === id) resetForm()
  renderProviders()
  renderRoutes()
}

async function saveProvider(event) {
  event.preventDefault()
  try {
    const baseUrl = checkBaseUrl($('pbase').value)
    const model = $('pmodel').value.trim()
    if (!model) throw new Error('Enter a default model.')
    const existing = settings.providers.find((p) => p.id === editingId)
    const key = $('pkey').value.trim()
    if (!key && !existing?.apiKey && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(baseUrl))
      throw new Error('Paste an API key.')
    const url = new URL(baseUrl)
    const allowed = await browser.permissions.request({ origins: [`${url.origin}/*`] })
    if (!allowed) throw new Error('Permission to contact this provider was not granted.')
    const provider = normalizeProvider({
      id: existing?.id,
      name: $('pname').value.trim() || 'AI provider',
      kind: $('pkind').value,
      baseUrl,
      model,
      apiKey: key || existing?.apiKey || '',
      presetId: $('preset').value,
    })
    const providers = existing
      ? settings.providers.map((p) => (p.id === existing.id ? provider : p))
      : [...settings.providers, provider]
    const defaultProviderId = settings.defaultProviderId || provider.id
    settings = await store.saveSettings({ providers, defaultProviderId })
    resetForm()
    renderProviders()
    renderRoutes()
    say($('provider-status'), 'Provider saved.', 'status--ok')
  } catch (err) {
    say($('provider-status'), err?.message ?? 'Could not save the provider.', 'status--error')
  }
}

async function saveRoutes() {
  try {
    const rows = [...$('routes').children]
    const routes = { ...settings.routes }
    TASKS.forEach((task, i) => {
      const row = rows[i]
      if (!row) return
      const selects = row.querySelectorAll('select')
      const inputs = row.querySelectorAll('input')
      routes[task] = {
        providerId: selects[0]?.value ?? '',
        model: inputs[0]?.value.trim() || '',
      }
    })
    settings = await store.saveSettings({ routes })
    renderRoutes()
    say($('route-status'), 'Routing saved.', 'status--ok')
  } catch (err) {
    say($('route-status'), err?.message ?? 'Could not save routing.', 'status--error')
  }
}

async function init() {
  fillPresetOptions()
  settings = await store.settings()
  resetForm()
  renderProviders()
  renderRoutes()
}

$('preset').addEventListener('change', applyPreset)
$('provider-form').addEventListener('submit', saveProvider)
$('cancel-edit').addEventListener('click', resetForm)
$('save-routes').addEventListener('click', saveRoutes)
$('dashboard').onclick = openDashboard
void init().catch((e) => say($('provider-status'), e?.message ?? 'Could not load settings.', 'status--error'))

enhanceActions()
