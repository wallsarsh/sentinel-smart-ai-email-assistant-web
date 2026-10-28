import Ajv from 'ajv'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import { repairTemplate } from './prompts/registry'
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

const ajv = new Ajv({ allErrors: true, strict: false })
const compiled = new WeakMap<object, ReturnType<Ajv['compile']>>()

const path = (p: string) =>
  p === ''
    ? '$'
    : '$' +
      p
        .split('/')
        .filter(Boolean)
        .map((x) => (/^\d+$/.test(x) ? `[${x}]` : `.${x}`))
        .join('')

/** Validation problems as "$.results[0].importance: must be equal to one of the allowed values". Never echoes data values. */
export function check(schema: Record<string, unknown>, value: unknown): string[] {
  let v = compiled.get(schema)
  if (!v) compiled.set(schema, (v = ajv.compile(schema)))
  if (v(value)) return []
  return (v.errors ?? [])
    .slice(0, 20)
    .map((e) => `${path(e.instancePath)}: ${e.message ?? 'invalid'}`)
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
