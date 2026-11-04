// Access to the reply editor through the compose content script.
export async function getSelection(tabId) {
  const result = await browser.tabs.sendMessage(tabId, { type: 'sentinel-selection-get' })
  return result?.text ?? ''
}

export async function replaceSelection(tabId, text) {
  const result = await browser.tabs.sendMessage(tabId, { type: 'sentinel-selection-replace', text })
  if (!result?.ok) throw new Error(result?.error ?? 'Select text in the compose window first.')
  return result
}
