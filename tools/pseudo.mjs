// Regenerates i18n/locales/en-XA.json from en.json: accented letters, brackets
// and extra length, with {placeholders} and @:links untouched.
import { readFileSync, writeFileSync } from 'node:fs'

const MAP = {
  a: 'á',
  e: 'é',
  i: 'í',
  o: 'ö',
  u: 'ü',
  n: 'ñ',
  y: 'ý',
  c: 'ç',
  s: 'š',
  A: 'Á',
  E: 'É',
  I: 'Í',
  O: 'Ö',
  U: 'Ü',
  N: 'Ñ',
  S: 'Š',
}
const PAD = ['one', 'two', 'three', 'four']

export function pseudo(s) {
  const parts = s.split(/(\{[^}]*\}|@:[\w.]+)/)
  const body = parts.map((p, i) => (i % 2 ? p : [...p].map((c) => MAP[c] ?? c).join(''))).join('')
  const extra = PAD.slice(0, Math.max(1, Math.ceil(s.length / 20))).join(' ')
  return `[${body} ${extra}]`
}

export const walk = (o) =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [
      k,
      typeof v === 'object' && v ? walk(v) : pseudo(String(v)),
    ]),
  )

export const build = () => walk(JSON.parse(readFileSync('i18n/locales/en.json', 'utf8')))

if (import.meta.url === `file://${process.argv[1]}`)
  writeFileSync('i18n/locales/en-XA.json', JSON.stringify(build(), null, 2) + '\n')
