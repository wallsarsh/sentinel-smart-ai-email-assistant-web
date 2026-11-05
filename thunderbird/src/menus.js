// menus.create reports asynchronous failures through its callback, not its return value.
export function menuRegistrar(api, report) {
  let running = null
  const create = (properties) => new Promise((resolve, reject) => {
    api.menus.create(properties, () => {
      const error = api.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve()
    })
  })
  return function register() {
    if (running) return running
    running = (async () => {
      try {
        if (!api.menus?.create) throw new Error('Thunderbird menus API is unavailable.')
        await api.menus.removeAll()
    const contexts = ['message_list', 'message_display_action', 'page']
    await create({ id: 'sentinel', title: 'Sentinel AI', contexts })
    for (const [id, title] of [
      ['sentinel-analyze', 'Analyze selected'],
      ['sentinel-draft', 'Create draft replies (never send)'],
      ['sentinel-summary', 'Summarize selected messages'],
      ['sentinel-actions', 'Extract action items'],
      ['sentinel-categorize', 'Categorize and apply priority tags'],
      ['sentinel-dashboard', 'Open dashboard'],
      ['sentinel-calendar', 'Add to calendar'],
    ])
      await create({ id, parentId: 'sentinel', title, contexts })
    await create({ id: 'sentinel-sender', parentId: 'sentinel', title: 'Sender rule', contexts })
    for (const [id, title] of [
      ['sentinel-important', 'Important'],
      ['sentinel-marketing', 'Marketing'],
      ['sentinel-ignore', 'Ignore'],
      ['sentinel-normal', 'Normal'],
    ])
      await create({ id, parentId: 'sentinel-sender', title, contexts })
        await report({ state: 'ready' })
      } catch (error) {
        await report({ state: 'error', error: error.message || 'Menu registration failed.' })
      }
    })().finally(() => { running = null })
    return running
  }
}
