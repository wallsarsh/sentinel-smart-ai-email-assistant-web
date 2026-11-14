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
import { listModels } from './models.js'

const $ = (id) => document.getElementById(id)
const store = createStore(browser.storage.local)
let settings = null
let editingId = null
let formPicker = null
let formModels = []
let modelCache = {}
const MODELS_KEY = 'sentinel.models'
const OTHER = '__other__'
const isLocalUrl = (u) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u)

/** A dropdown of models with an "Other…" escape hatch for names the provider does not list. */
function modelPicker(label, models, value) {
  const select = el('select', { 'aria-label': label })
  const input = el('input', { 'aria-label': `${label} (type a name)`, placeholder: 'Model name' })
  const node = el('div', { class: 'stack model-picker' }, select, input)
  const fill = (list, current) => {
    clear(select)
    const names = [...new Set([...(list ?? []), ...(current ? [current] : [])])]
    for (const m of names) select.append(el('option', { value: m, text: m }))
    select.append(el('option', { value: OTHER, text: names.length ? 'Other (type a name)…' : 'Type a model name…' }))
    select.value = current && names.includes(current) ? current : names.length ? names[0] : OTHER
    input.hidden = select.value !== OTHER
    input.value = ''
  }
  select.addEventListener('change', () => {
    input.hidden = select.value !== OTHER
    if (!input.hidden) input.focus()
  })
  fill(models, value)
  return {
    node,
    set: fill,
    get: () => (select.value === OTHER ? input.value.trim() : select.value),
    onChange: (fn) => select.addEventListener('change', () => fn()),
    setDisabled: (d) => { select.disabled = d; input.disabled = d },
  }
}

async function loadCache() {
  modelCache = (await browser.storage.local.get(MODELS_KEY))[MODELS_KEY] ?? {}
}
const cachedModels = (id) => modelCache[id]?.models ?? []
async function rememberModels(id, models) {
  modelCache = { ...modelCache, [id]: { at: Date.now(), models } }
  await browser.storage.local.set({ [MODELS_KEY]: modelCache })
}

/** Ask for host access for the origins that do not have it yet (needs a click), in one prompt. */
async function ensureOrigins(urls) {
  const origins = [...new Set(urls.filter(Boolean).map((u) => `${new URL(u).origin}/*`))]
  const missing = []
  for (const o of origins) if (!(await browser.permissions.contains({ origins: [o] }))) missing.push(o)
  if (!missing.length) return true
  return browser.permissions.request({ origins: missing })
}

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
  formModels = []
  formPicker.set([], preset.model)
  say($('model-status'), '')
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

const rowControls = {}

function routeControls(label, route, onProviderChange) {
  const providerSelect = el(
    'select',
    { 'aria-label': `${label} provider` },
    ...settings.providers.map((p) =>
      el('option', { value: p.id, text: p.name, selected: p.id === route.providerId }),
    ),
  )
  const modelFor = (id) => settings.providers.find((x) => x.id === id)
  const picker = modelPicker(`${label} model`, cachedModels(route.providerId), route.model)
  providerSelect.addEventListener('change', () => {
    const next = modelFor(providerSelect.value)
    picker.set(cachedModels(providerSelect.value), next?.model ?? '')
    onProviderChange?.()
  })
  return { providerSelect, picker }
}

function renderRoutes() {
  const root = $('routes')
  const defaultRoot = $('default-route')
  clear(root)
  clear(defaultRoot)
  if (!settings.providers.length) {
    defaultRoot.append(el('p', { class: 'muted', text: 'Add a provider to choose models.' }))
    return
  }
  const def = settings.defaultRoute
  const d = routeControls('Default', def)
  rowControls.default = d
  defaultRoot.append(
    el('div', { class: 'item__top' }, el('span', { class: 'item__title', text: 'Default for all features' })),
    el('p', { class: 'meta', text: 'Every feature below uses this unless you give it its own model.' }),
    el('div', { class: 'grid grid--2' },
      el('label', { class: 'field' }, el('span', { text: 'Provider' }), d.providerSelect),
      el('div', { class: 'field' }, el('span', { text: 'Model' }), d.picker.node),
    ),
  )
  for (const task of TASKS) {
    const route = settings.routes[task]
    const custom = settings.customRoutes.includes(task)
    const c = routeControls(TASK_LABELS[task], route)
    const toggle = el('input', { type: 'checkbox', checked: !custom, 'aria-label': `${TASK_LABELS[task]}: use default` })
    const apply = () => {
      c.providerSelect.disabled = toggle.checked
      c.picker.setDisabled(toggle.checked)
    }
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        c.providerSelect.value = d.providerSelect.value
        c.picker.set(cachedModels(d.providerSelect.value), d.picker.get())
      }
      apply()
    })
    apply()
    rowControls[task] = { ...c, toggle }
    root.append(
      el('div', { class: 'item' },
        el('div', { class: 'item__top' },
          el('span', { class: 'item__title', text: TASK_LABELS[task] }),
          el('label', { class: 'meta' }, toggle, ' Use default'),
        ),
        el('div', { class: 'grid grid--2' },
          el('label', { class: 'field' }, el('span', { text: 'Provider' }), c.providerSelect),
          el('div', { class: 'field' }, el('span', { text: 'Model' }), c.picker.node),
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
  formModels = cachedModels(p.id)
  formPicker.set(formModels, p.model)
  say($('model-status'), '')
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
  settings = await store.saveSettings({
    providers: next,
    defaultProviderId,
    defaultRoute: { providerId: defaultProviderId, model: '' },
  })
  if (editingId === id) resetForm()
  renderProviders()
  renderRoutes()
}

async function saveProvider(event) {
  event.preventDefault()
  try {
    const baseUrl = checkBaseUrl($('pbase').value)
    const model = formPicker.get()
    if (!model) throw new Error('Choose or enter a model.')
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
    if (formModels.length) await rememberModels(provider.id, formModels)
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
    const d = rowControls.default
    const defaultRoute = { providerId: d.providerSelect.value, model: d.picker.get() }
    if (!defaultRoute.model) throw new Error('Choose a default model.')
    const routes = {}
    const customRoutes = []
    for (const task of TASKS) {
      const r = rowControls[task]
      if (r.toggle.checked) continue
      const model = r.picker.get()
      if (!model) throw new Error(`Choose a model for ${TASK_LABELS[task]}.`)
      customRoutes.push(task)
      routes[task] = { providerId: r.providerSelect.value, model }
    }
    settings = await store.saveSettings({
      defaultProviderId: defaultRoute.providerId,
      defaultRoute,
      customRoutes,
      routes,
    })
    renderRoutes()
    say($('route-status'), 'Routing saved.', 'status--ok')
  } catch (err) {
    say($('route-status'), err?.message ?? 'Could not save routing.', 'status--error')
  }
}

async function loadFormModels() {
  const baseUrl = $('pbase').value.trim()
  const existing = settings.providers.find((p) => p.id === editingId)
  const provider = {
    kind: $('pkind').value,
    baseUrl,
    apiKey: $('pkey').value.trim() || existing?.apiKey || '',
  }
  try {
    checkBaseUrl(baseUrl || 'https://api.anthropic.com')
    if (provider.kind !== 'anthropic' && !baseUrl) throw new Error('Enter the base URL first.')
    if (!provider.apiKey && !isLocalUrl(baseUrl)) throw new Error('Paste the API key first.')
    if (!(await ensureOrigins([baseUrl || 'https://api.anthropic.com'])))
      throw new Error('Permission to contact this provider was not granted.')
  } catch (e) {
    return say($('model-status'), e.message, 'status--error')
  }
  say($('model-status'), 'Loading models…')
  $('load-models').disabled = true
  const res = await listModels(provider)
  $('load-models').disabled = false
  if (!res.ok) return say($('model-status'), res.error, 'status--error')
  formModels = res.models
  formPicker.set(res.models, formPicker.get())
  say($('model-status'), `${res.models.length} models loaded.`, 'status--ok')
}

async function refreshAllModels() {
  const usable = settings.providers.filter((p) => p.baseUrl || p.kind === 'anthropic')
  say($('route-status'), 'Loading models…')
  try {
    const granted = await ensureOrigins(usable.map((p) => p.baseUrl || 'https://api.anthropic.com'))
    if (!granted) throw new Error('Permission to contact the providers was not granted.')
    const failed = []
    for (const p of usable) {
      const res = await listModels(p)
      if (res.ok) await rememberModels(p.id, res.models)
      else failed.push(`${p.name}: ${res.error}`)
    }
    renderRoutes()
    say(
      $('route-status'),
      failed.length ? failed.join(' ') : 'Model lists updated.',
      failed.length ? 'status--error' : 'status--ok',
    )
  } catch (e) {
    say($('route-status'), e.message, 'status--error')
  }
}

async function init() {
  fillPresetOptions()
  formPicker = modelPicker('Model', [], '')
  $('pmodel-field').append(formPicker.node)
  await loadCache()
  settings = await store.settings()
  resetForm()
  renderProviders()
  renderRoutes()
}

$('preset').addEventListener('change', applyPreset)
$('provider-form').addEventListener('submit', saveProvider)
$('cancel-edit').addEventListener('click', resetForm)
$('save-routes').addEventListener('click', saveRoutes)
$('load-models').addEventListener('click', () => void loadFormModels())
$('refresh-models').addEventListener('click', () => void refreshAllModels())
$('dashboard').onclick = openDashboard
void init().catch((e) => say($('provider-status'), e?.message ?? 'Could not load settings.', 'status--error'))

enhanceActions()
