import { renderBrief } from './brief-view.js'
import { createStore } from './store.js'
import { openDashboard, send, status } from './ui.js'

const $ = (id) => document.getElementById(id)
const store = createStore(browser.storage.local)
const open = (id) => browser.messageDisplay.open({ messageId: Number(id) }).catch(() => undefined)

async function show() {
  const [brief, briefStatus, settings] = await Promise.all([
    store.brief(),
    store.briefStatus(),
    store.settings(),
  ])
  renderBrief($('brief'), brief, open)
  const running = briefStatus?.state === 'running'
  $('refresh').disabled = running
  if (running) status($('status'), 'Updating…')
  else if (briefStatus?.state === 'error') status($('status'), briefStatus.message, 'status--error')
  else if (!settings.baseUrl) status($('status'), 'Add a provider in settings first.', 'status--error')
  else if (briefStatus?.at) status($('status'), `Updated ${new Date(briefStatus.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
  else status($('status'), '')
}

$('refresh').onclick = async () => {
  $('refresh').disabled = true
  status($('status'), 'Updating…')
  await send({ type: 'brief-run' }).catch((e) => status($('status'), e.message, 'status--error'))
  await show()
}
$('dashboard').onclick = openDashboard
browser.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && (c.brief || c.briefStatus || c.settings)) void show()
})
void show().catch((e) => status($('status'), e?.message ?? 'Could not read the brief.', 'status--error'))
