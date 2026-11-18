import { renderBrief } from './brief-view.js'
import { createStore } from './store.js'
import { openDashboard, send, status } from './ui.js'

const $ = (id) => document.getElementById(id)
const store = createStore(browser.storage.local)
const open = (id) => browser.messageDisplay.open({ messageId: Number(id) }).catch(() => undefined)

async function show() {
  const alive = await browser.runtime.sendMessage({ type: 'ping' }).catch(() => null)
  if (!alive?.ok) {
    status($('status'), 'Background service not running — reload the add-on.', 'status--error')
    return
  }
  const [brief, briefStatus, settings] = await Promise.all([
    store.displayedBrief(),
    store.briefStatus(),
    store.settings(),
  ])
  renderBrief($('brief'), brief, open)
  const running = briefStatus?.state === 'running'
  $('refresh').disabled = running
  $('refresh').textContent = ['partial', 'error'].includes(briefStatus?.state) ? 'Resume brief' : 'Rebuild today’s brief'
  if (running) status($('status'), 'Updating… ' + (briefStatus.progress ? briefStatus.progress.processed + '/' + briefStatus.progress.total + ' processed' : ''))
  else if (briefStatus?.state === 'error') status($('status'), briefStatus.message, 'status--error')
  else if (briefStatus?.state === 'partial') status($('status'), briefStatus.message ?? 'Paused; press Refresh brief to resume.', 'status--error')
  else if (!settings.baseUrl) status($('status'), 'Add a provider in settings first.', 'status--error')
  else if (briefStatus?.at) status($('status'), `Updated ${new Date(briefStatus.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
  else status($('status'), '')
}

$('refresh').onclick = async () => {
  $('refresh').disabled = true
  status($('status'), 'Updating…')
  try {
    await send({ type: 'brief-run' })
    await show()
  } catch (e) {
    $('refresh').disabled = false
    status($('status'), e.message, 'status--error')
  }
}
$('dashboard').onclick = openDashboard
browser.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && (c.brief || c.briefStatus || c.settings)) void show()
})
void show().catch((e) => status($('status'), e?.message ?? 'Could not read the brief.', 'status--error'))
