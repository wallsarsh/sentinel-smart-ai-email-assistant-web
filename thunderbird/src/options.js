import { checkBaseUrl } from './mail.js'
import { createStore } from './store.js'
import { openDashboard, status } from './ui.js'

const $ = (id) => document.getElementById(id)
const store = createStore(browser.storage.local)
let settings = null

function say(message, kind = '') {
  status($('status'), message, kind)
}

async function init() {
  settings = await store.settings()
  $('baseUrl').value = settings.baseUrl ?? ''
  $('model').value = settings.model ?? ''
  if (settings.apiKey) {
    $('apiKey').placeholder = 'Saved key — leave blank to keep it'
    $('key-note').textContent = `A key is saved (ending ${settings.apiKey.slice(-4)}). Leave the field blank to keep it.`
  }
}

$('dashboard').onclick = openDashboard
$('dashboard2').onclick = openDashboard

$('f').addEventListener('submit', async (e) => {
  e.preventDefault()
  try {
    const baseUrl = checkBaseUrl($('baseUrl').value)
    const model = $('model').value.trim()
    if (!model) throw new Error('Enter a model.')
    const key = $('apiKey').value.trim()
    if (!key && !settings?.apiKey) throw new Error('Paste an API key.')
    const url = new URL(baseUrl)
    const allowed = await browser.permissions.request({ origins: [`${url.origin}/*`] })
    if (!allowed) throw new Error('Permission to contact the provider was not granted.')
    settings = await store.saveSettings({
      baseUrl,
      model,
      ...(key ? { apiKey: key } : {}),
    })
    $('apiKey').value = ''
    $('baseUrl').value = settings.baseUrl
    $('model').value = settings.model
    $('apiKey').placeholder = 'Saved key — leave blank to keep it'
    $('key-note').textContent = `A key is saved (ending ${settings.apiKey.slice(-4)}). Leave the field blank to keep it.`
    say('Provider saved.', 'status--ok')
  } catch (err) {
    say(err?.message ?? 'Could not save the provider.', 'status--error')
  }
})

void init()
