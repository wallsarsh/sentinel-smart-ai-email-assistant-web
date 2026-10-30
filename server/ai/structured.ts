import Ajv from 'ajv'
import { setSchemaChecker } from '../../packages/core/src/ai/structured'

export * from '../../packages/core/src/ai/structured'

// The server validates with Ajv (full JSON Schema); the extension cannot, because Ajv compiles code at run time.
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
setSchemaChecker(check)
