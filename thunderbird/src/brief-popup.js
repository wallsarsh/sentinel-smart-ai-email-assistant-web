import { renderBrief } from './brief-view.js'

const $ = (id) => document.getElementById(id)
const open = (id) => browser.messageDisplay.open({ messageId: id }).catch(() => undefined)

async function show() {
  const { brief, briefStatus } = await browser.storage.local.get(['brief', 'briefStatus'])
  renderBrief($('brief'), brief, open)
  const running = briefStatus?.state === 'running'
  $('refresh').disabled = running
  $('status').textContent = running
    ? 'Working…'
    : briefStatus?.state === 'error'
      ? briefStatus.message
      : ''
}

$('refresh').onclick = async () => {
  await browser.runtime.sendMessage({ type: 'brief-run' })
  await show()
}
browser.storage.onChanged.addListener(
  (c, area) => area === 'local' && (c.brief || c.briefStatus) && void show(),
)
await show()
