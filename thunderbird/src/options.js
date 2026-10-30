import { checkBaseUrl } from './mail.js'

const $ = (id) => document.getElementById(id)
const { settings } = await browser.storage.local.get('settings')
for (const k of ['baseUrl', 'apiKey', 'model']) $(k).value = settings?.[k] ?? ''

$('f').addEventListener('submit', async (e) => {
  e.preventDefault()
  const next = {
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value,
    model: $('model').value.trim(),
  }
  try {
    next.baseUrl = checkBaseUrl(next.baseUrl)
    const url = new URL(next.baseUrl)
    // Thunderbird asks the user to allow requests to this one host.
    const ok = await browser.permissions.request({ origins: [`${url.origin}/*`] })
    if (!ok) throw new Error('Permission to contact the provider was not granted.')
    await browser.storage.local.set({ settings: next })
    $('status').textContent = 'Saved.'
  } catch (err) {
    $('status').textContent = err.message
  }
})
