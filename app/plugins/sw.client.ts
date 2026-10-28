// Registers the service worker at start: installability, the offline page and push all need it.
export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) return
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
})
