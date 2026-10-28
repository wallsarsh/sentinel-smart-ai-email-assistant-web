// A page-less harness: mounts the real components, layout and settings hub with fixture data,
// one scene per URL (`?scene=brief`), so screenshots need no server, database or login.
import { createApp, h, ref } from 'vue'
import '../../../app/assets/css/main.css'
import en from '../../../i18n/locales/en.json'
import { SCENES } from './scenes'

const lookup = (key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en)
const t = (key: string, p: Record<string, unknown> = {}) =>
  String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_m, k) => String(p[k] ?? ''))

const params = new URLSearchParams(location.search)
const scene = SCENES[params.get('scene') ?? '']
if (!scene) throw new Error(`unknown scene ${params.get('scene')}`)

// The bits of Nuxt that components reach for.
const g = globalThis as Record<string, unknown>
g.useRoute = () => ({ path: scene.path, query: {}, params: {} })
g.useState = (_k: string, init?: () => unknown) => ref(init ? init() : undefined)
g.navigateTo = async () => undefined
g.$fetch = async () => ({ state: 'waiting' })

const app = createApp({ render: () => h(scene.root) })
app.config.globalProperties.$t = t
app.config.globalProperties.$te = (k: string) => typeof lookup(k) === 'string'

// Components are registered under the names Nuxt gives them (folder prefix + file name).
const files = import.meta.glob('../../../app/components/**/*.vue', { eager: true }) as Record<
  string,
  { default: object }
>
const pascal = (s: string) => s.replace(/(^|[-_])(\w)/g, (_m, _a, c: string) => c.toUpperCase())
for (const [path, mod] of Object.entries(files)) {
  const parts = path
    .split('/components/')[1]!
    .replace(/\.vue$/, '')
    .split('/')
  const file = parts.pop()!
  const prefix = parts.map(pascal).join('')
  app.component(file.startsWith(prefix) ? file : `${prefix}${file}`, mod.default)
}
app.component('NuxtLink', {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
})
app.component('NuxtLayout', { template: '<slot />' })
app.mount('#app')
;(window as unknown as { __ready: boolean }).__ready = true
