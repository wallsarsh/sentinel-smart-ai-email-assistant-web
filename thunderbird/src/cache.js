// Analysis results are kept per message so a message is analysed once, whether the brief or Summarize gets to it first.
export const TRIAGE_PREFIX = 'sentinel.triage:'
export const triageKey = (header) => `${TRIAGE_PREFIX}${header.headerMessageId ?? header.id}`

/** Storage seam over browser.storage.local: get(key) → value|null, set(key, value). */
export const localStore = (area) => ({
  async get(key) {
    return (await area.get(key))[key] ?? null
  },
  async set(key, value) {
    await area.set({ [key]: value })
  },
})
