import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  briefPrompt,
  draftPrompt,
  PROMPT_VERSIONS,
  repairTemplate,
  triagePrompt,
} from '../../server/ai/prompts/registry'
import * as T from '../../server/ai/prompts/texts.generated'
import { extract, render } from '../../tools/sync-prompts.mjs'

const doc = readFileSync('docs/reference/ai-prompts.md', 'utf8')

/** Keywords strict structured outputs reject or ignore. */
const UNSUPPORTED = new Set([
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'uniqueItems',
  'oneOf',
  'allOf',
  '$ref',
  'patternProperties',
])
function assertStrict(node: unknown, path: string) {
  if (Array.isArray(node)) return node.forEach((n, i) => assertStrict(n, `${path}[${i}]`))
  if (!node || typeof node !== 'object') return
  const o = node as Record<string, unknown>
  for (const k of Object.keys(o)) expect(UNSUPPORTED.has(k), `${path} uses ${k}`).toBe(false)
  if (o.type === 'object') {
    expect(o.additionalProperties, `${path} additionalProperties`).toBe(false)
    expect(new Set(o.required as string[]), `${path} requires every property`).toEqual(
      new Set(Object.keys((o.properties as object) ?? {})),
    )
  }
  for (const [k, v] of Object.entries(o)) assertStrict(v, `${path}.${k}`)
}

describe('prompt registry', () => {
  it('generated texts match the reviewed document (run `npm run prompts:sync`)', () => {
    expect(readFileSync('server/ai/prompts/texts.generated.ts', 'utf8')).toBe(render(extract(doc)))
  })
  it('exposes versions for logging and no prompt text in them', () => {
    expect(PROMPT_VERSIONS).toEqual({
      triage: 'triage.v1',
      brief: 'brief.v1',
      draft: 'draft.v1',
      repair: 'repair.v1',
    })
  })
  it('system prompts are static and carry the injection rules', () => {
    for (const p of [triagePrompt, draftPrompt]) {
      expect(p.system).toContain('untrusted')
      expect(p.system).not.toMatch(/\{\{|\$\{/)
    }
    expect(draftPrompt.schema).toBeUndefined()
    expect(repairTemplate).toContain('{{validator_errors}}')
    expect(T.triageSystem.length).toBeGreaterThan(500)
  })
  it('schemas follow the strict structured-output subset', () => {
    assertStrict(triagePrompt.schema!.schema, 'triage')
    assertStrict(briefPrompt.schema!.schema, 'brief')
  })
})
