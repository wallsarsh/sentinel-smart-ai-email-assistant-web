// Sequential processing keeps each result recoverable and isolates message failures.
export async function runBulk(ids, process, save, action, previous = null) {
  const results = previous?.results?.filter((r) => !r.error) || []
  const job = { action, ids: [...new Set(ids)], state: 'running', total: new Set(ids).size, processed: results.length, failed: 0, results }
  await save(job)
  const completed = new Set(results.map((r) => r.id))
  for (const id of new Set(ids)) {
    if (completed.has(id)) continue
    try {
      const result = await process(id)
      if (result?.ok === false) throw new Error(result.error || 'Action failed')
      job.results.push({ id, ...result })
    } catch (error) {
      job.failed++
      job.results.push({ id, error: error.message || 'Action failed' })
    }
    job.processed++
    await save(job)
  }
  job.state = job.failed ? 'partial' : 'done'
  await save(job)
  return job
}

export async function selectedHeaders(info, tab, api) {
  if (info.selectedMessages) {
    let page = info.selectedMessages
    const headers = [...(page.messages || [])]
    while (page.id) {
      page = await api.messages.continueList(page.id)
      headers.push(...page.messages)
    }
    return [...new Map(headers.map((h) => [h.id, h])).values()]
  }
  if (info.messageId != null) return [await api.messages.get(info.messageId)]
  if (tab?.id != null) {
    const header = await api.messageDisplay.getDisplayedMessage(tab.id)
    return header ? [header] : []
  }
  return []
}
