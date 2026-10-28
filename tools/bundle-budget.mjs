// Fails when the built client bundle outgrows its budget. Run after `npm run build`:
//   node tools/bundle-budget.mjs          (check)   |   node tools/bundle-budget.mjs --json   (numbers only)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Gzip bytes. Raise a number only with a note in the task log saying why. */
export const BUDGET = {
  jsTotal: 200_000, // all client JavaScript
  jsLargestChunk: 70_000, // the biggest single file (the framework chunk)
  cssTotal: 10_000,
}

export function measure(dir = '.output/public/_nuxt') {
  const walk = (d) =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
  const out = { jsTotal: 0, jsLargestChunk: 0, largestFile: '', cssTotal: 0, files: 0 }
  for (const p of walk(dir)) {
    const gz = gzipSync(readFileSync(p)).length
    if (p.endsWith('.js')) {
      out.jsTotal += gz
      out.files++
      if (gz > out.jsLargestChunk) [out.jsLargestChunk, out.largestFile] = [gz, p]
    } else if (p.endsWith('.css')) out.cssTotal += gz
  }
  return out
}

export function check(m, budget = BUDGET) {
  return Object.keys(budget)
    .filter((k) => m[k] > budget[k])
    .map((k) => `${k}: ${m[k]} B gzip > budget ${budget[k]} B`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = measure()
  console.log(JSON.stringify(m))
  if (process.argv.includes('--json')) process.exit(0)
  const bad = check(m)
  for (const b of bad) console.error(`over budget - ${b}`)
  process.exit(bad.length ? 1 : 0)
}
