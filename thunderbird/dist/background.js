// thunderbird/src/mail.js
var escapeHtml = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function withDraft(details, draft) {
  if (details.isPlainText) {
    const quote = (details.plainTextBody || "").replace(/^\n+/, "");
    return { plainTextBody: `${draft}

${quote}` };
  }
  const html = escapeHtml(draft).replace(/\n/g, "<br>");
  const body = details.body || "";
  const block = `<div>${html}</div><br>`;
  return {
    body: /<body[^>]*>/i.test(body) ? body.replace(/(<body[^>]*>)/i, `$1${block}`) : block + body
  };
}

// thunderbird/src/background.js
browser.runtime.onMessage.addListener(async (msg) => {
  if (msg?.type !== "open-reply") return void 0;
  const tab = await browser.compose.beginReply(msg.messageId, "replyToSender");
  const details = await browser.compose.getComposeDetails(tab.id);
  await browser.compose.setComposeDetails(tab.id, withDraft(details, msg.draft));
  return { ok: true };
});
