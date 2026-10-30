import { err, ok, type Result } from '../errors/result'
import type { AppFailure } from '../errors/failure'
import { repairTemplate } from '../prompts/registry'
import type { StopReason } from './types'

/**
 * Pulls the first balanced JSON object/array out of model text. Handles
 * ```json fences and chatty prefixes or suffixes. Null when none is complete.
 */
export function extractJsonText(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(t)
  const source = fenced ? fenced[1]!.trim() : t
  const start = source.search(/[{[]/)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < source.length; i++) {
    const c = source[i]!
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') if (--depth === 0) return source.slice(start, i + 1)
  }
  return null
}

type Schema = Record<string, unknown>
type Checker = (schema: Schema, value: unknown) => string[]
let checker: Checker = miniCheck

/** Replaces the schema checker (the server plugs in Ajv). The built-in one covers the subset our schemas use. */
export function setSchemaChecker(c: Checker) {
  checker = c
}

/** Validation problems as "$.results[0].importance: must be equal to one of the allowed values". */
export function check(schema: Schema, value: unknown): string[] {
  return checker(schema, value)
}

const typeOf = (v: unknown) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v
const isType = (v: unknown, t: string) =>
  t === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeOf(v) === t

/**
 * JSON Schema subset used by our prompts: type, enum, const, required, properties, additionalProperties:false,
 * items, minItems/maxItems, minLength/maxLength, minimum/maximum. No code generation, so it runs under
 * extension content-security policies. Never echoes data values.
 */
export function miniCheck(schema: Schema, value: unknown, at = '$'): string[] {
  const out: string[] = []
  const types = ([] as string[]).concat((schema.type as string | string[] | undefined) ?? [])
  if (types.length && !types.some((t) => isType(value, t)))
    return [`${at}: must be ${types.join(' or ')}`]
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === value))
    out.push(`${at}: must be equal to one of the allowed values`)
  if ('const' in schema && schema.const !== value) out.push(`${at}: must be equal to constant`)
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength)
      out.push(`${at}: must NOT have fewer than ${schema.minLength} characters`)
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength)
      out.push(`${at}: must NOT have more than ${schema.maxLength} characters`)
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      out.push(`${at}: must be >= ${schema.minimum}`)
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      out.push(`${at}: must be <= ${schema.maximum}`)
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      out.push(`${at}: must NOT have fewer than ${schema.minItems} items`)
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      out.push(`${at}: must NOT have more than ${schema.maxItems} items`)
    if (schema.items && typeof schema.items === 'object')
      value.forEach((v, i) => out.push(...miniCheck(schema.items as Schema, v, `${at}[${i}]`)))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    const props = (schema.properties ?? {}) as Record<string, Schema>
    for (const k of (schema.required as string[] | undefined) ?? [])
      if (!(k in obj)) out.push(`${at}: must have required property '${k}'`)
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) out.push(...miniCheck(props[k], v, `${at}.${k}`))
      else if (schema.additionalProperties === false)
        out.push(`${at}: must NOT have additional properties`)
    }
  }
  return out.slice(0, 20)
}

/** Parses and validates [text]; returns problems for the repair turn (empty = valid). */
export function problems(
  text: string,
  schema: Record<string, unknown>,
): { value?: unknown; errors: string[] } {
  const json = extractJsonText(text)
  if (json === null) return { errors: ['No complete JSON object found in the output.'] }
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return { errors: ['Output is not valid JSON.'] }
  }
  const errors = check(schema, value)
  return errors.length ? { errors } : { value, errors }
}

export const repairPrompt = (errors: string[]) =>
  repairTemplate.replace('{{validator_errors}}', errors.join('\n'))

export type Attempt = { text: string; stop: StopReason }
/** Runs one model call. `repair` marks the follow-up turn (carries the invalid output and the repair prompt). */
export type Caller = (
  turn:
    | { kind: 'initial' }
    | { kind: 'repair'; invalid: string; prompt: string }
    | { kind: 'retry_longer' },
) => Promise<Result<Attempt, AppFailure>>

/**
 * Gets schema-valid JSON from the model: a refusal or empty answer fails
 * immediately; a truncated answer is retried once with a larger budget; an
 * invalid answer gets exactly one repair turn; anything still wrong fails with
 * a typed ai_output problem.
 */
export async function structuredCall(
  call: Caller,
  schema: Record<string, unknown>,
): Promise<Result<unknown, AppFailure>> {
  const first = await call({ kind: 'initial' })
  if (!first.ok) return first
  let cur = first.value
  if (cur.stop === 'refusal') return err({ kind: 'ai_output', problem: 'refusal' })
  if (cur.stop === 'length') {
    const again = await call({ kind: 'retry_longer' })
    if (!again.ok) return again
    if (again.value.stop === 'refusal') return err({ kind: 'ai_output', problem: 'refusal' })
    if (again.value.stop === 'length') return err({ kind: 'ai_output', problem: 'truncated' })
    cur = again.value
  }
  if (!cur.text.trim()) return err({ kind: 'ai_output', problem: 'empty' })
  let r = problems(cur.text, schema)
  if (!r.errors.length) return ok(r.value)
  const fixed = await call({ kind: 'repair', invalid: cur.text, prompt: repairPrompt(r.errors) })
  if (!fixed.ok) return fixed
  if (fixed.value.stop === 'length') return err({ kind: 'ai_output', problem: 'truncated' })
  r = problems(fixed.value.text, schema)
  return r.errors.length ? err({ kind: 'ai_output', problem: 'schema_invalid' }) : ok(r.value)
}

/** The user message for a repair turn: the original input, the invalid output and what was wrong. */
export const repairUserMessage = (original: string, invalid: string, prompt: string) =>
  `${original}\n\n<previous_output>\n${invalid}\n</previous_output>\n${prompt}`

/**
 * Keeps only entries whose id the request actually contained. Returns what was
 * dropped (hallucinated ids) and which requested ids were not answered.
 */
export function reconcileIds<T extends { id: string }>(items: T[], requested: string[]) {
  const known = new Set(requested)
  const seen = new Set<string>()
  const kept: T[] = []
  const dropped: string[] = []
  for (const it of items) {
    if (!known.has(it.id) || seen.has(it.id)) dropped.push(it.id)
    else {
      seen.add(it.id)
      kept.push(it)
    }
  }
  return { kept, dropped, missing: requested.filter((id) => !seen.has(id)) }
}
