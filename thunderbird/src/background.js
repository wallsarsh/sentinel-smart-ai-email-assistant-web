import { withDraft } from './mail.js'

// Opening the reply window closes the toolbar popup and ends its scripts, so the popup hands the draft to this
// page, which outlives it and finishes filling in the reply.
browser.runtime.onMessage.addListener(async (msg) => {
  if (msg?.type !== 'open-reply') return undefined
  const tab = await browser.compose.beginReply(msg.messageId, 'replyToSender')
  const details = await browser.compose.getComposeDetails(tab.id)
  await browser.compose.setComposeDetails(tab.id, withDraft(details, msg.draft))
  return { ok: true }
})
