// Injected into compose windows by browser.composeScripts. It only reads the selection and replaces it.
let savedRange = null

const selection = () => {
  const sel = window.getSelection()
  return sel && sel.rangeCount ? sel : null
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return undefined
  if (message.type === 'sentinel-selection-get') {
    const sel = selection()
    savedRange = sel ? sel.getRangeAt(0).cloneRange() : null
    return Promise.resolve({ text: sel ? sel.toString() : '' })
  }
  if (message.type === 'sentinel-selection-replace') {
    const sel = selection()
    const range = savedRange ?? (sel ? sel.getRangeAt(0) : null)
    if (!range) return Promise.resolve({ ok: false, error: 'Select text in the compose window first.' })
    range.deleteContents()
    const node = document.createTextNode(String(message.text ?? ''))
    range.insertNode(node)
    if (sel) sel.removeAllRanges()
    const after = document.createRange()
    after.setStartAfter(node)
    after.collapse(true)
    if (sel) sel.addRange(after)
    return Promise.resolve({ ok: true })
  }
  return undefined
})
