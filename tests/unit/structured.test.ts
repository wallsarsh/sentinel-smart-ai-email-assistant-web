import { describe, expect, it } from 'vitest'
import { briefPrompt, triagePrompt } from '../../server/ai/prompts/registry'
import {
  check,
  extractJsonText,
  problems,
  reconcileIds,
  repairPrompt,
  repairUserMessage,
  structuredCall,
  type Attempt,
  type Caller,
} from '../../server/ai/structured'
import { err, ok } from '../../shared/errors/result'

const triage = triagePrompt.schema!.schema
const result = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  category: 'workRequest',
  importance: 'high',
  urgency: 'urgent',
  needsReply: true,
  summary: 'Alex needs the numbers.',
  reason: 'VIP',
  actionItems: [{ text: 'Send Q3', dueDate: '2026-10-27', dueText: null }],
  confidence: 0.9,
  ...over,
})
const valid = JSON.stringify({ results: [result()] })

describe('extractJsonText', () => {
  it.each([
    ['plain', '{"a":1}', '{"a":1}'],
    ['fenced', 'Sure!\n```json\n{"a":[1,2]}\n```\nDone', '{"a":[1,2]}'],
    ['prefix and suffix', 'Here: {"a":"}"} thanks', '{"a":"}"}'],
    ['braces in strings', '{"a":"{[("}', '{"a":"{[("}'],
    ['escaped quote', '{"a":"x\\"}"}', '{"a":"x\\"}"}'],
    ['array', ' [1,{"b":2}] ', '[1,{"b":2}]'],
  ])('%s', (_n, input, want) => expect(extractJsonText(input)).toBe(want))
  it.each(['', '   ', 'no json here', '{"a":1', '{"a":"unterminated', '[1,2'])(
    'incomplete or empty → null: %j',
    (t) => expect(extractJsonText(t)).toBeNull(),
  )
})

describe('schema checks', () => {
  it('accepts realistic results including null due fields', () => {
    expect(check(triage, { results: [result()] })).toEqual([])
    expect(check(triage, { results: [] })).toEqual([])
  })
  it('reports paths without echoing values', () => {
    const errs = check(triage, { results: [result({ importance: 'SECRET-VALUE', extra: 'x' })] })
    expect(errs.join('\n')).toContain('$.results[0].importance')
    expect(errs.join('\n')).not.toContain('SECRET-VALUE')
    expect(check(triage, { results: [{ id: 'e1' }] }).some((e) => e.includes('required'))).toBe(
      true,
    )
    expect(
      check(briefPrompt.schema!.schema, { headline: 'x', sections: [{ type: 'nope', items: [] }] }),
    ).not.toEqual([])
  })
  it('problems() classifies unparseable output', () => {
    expect(problems('prose only', triage).errors[0]).toContain('No complete JSON')
    expect(problems('{"results": [1,]}', triage).errors[0]).toContain('not valid JSON')
    expect(problems(`\`\`\`json\n${valid}\n\`\`\``, triage).value).toEqual({ results: [result()] })
  })
})

function script(...steps: (Attempt | { fail: true })[]) {
  const turns: string[] = []
  const call: Caller = async (t) => {
    turns.push(t.kind)
    const s = steps.shift()!
    return 'fail' in s ? err({ kind: 'network' }) : ok(s)
  }
  return { call, turns }
}
const end = (text: string): Attempt => ({ text, stop: 'end' })

describe('structuredCall', () => {
  it('returns valid output without further calls', async () => {
    const s = script(end(valid))
    expect(await structuredCall(s.call, triage)).toEqual({
      ok: true,
      value: { results: [result()] },
    })
    expect(s.turns).toEqual(['initial'])
  })
  it('repairs once with the validator errors', async () => {
    let prompt = ''
    const turns: string[] = []
    const call: Caller = async (t) => {
      turns.push(t.kind)
      if (t.kind === 'repair') {
        prompt = t.prompt
        return ok(end(valid))
      }
      return ok(end('{"results":[{"id":"e1"}]}'))
    }
    expect((await structuredCall(call, triage)).ok).toBe(true)
    expect(turns).toEqual(['initial', 'repair'])
    expect(prompt).toContain('$.results[0]')
    expect(prompt).not.toContain('{{validator_errors}}')
  })
  it('fails with schema_invalid when the repair is still wrong, and does not loop', async () => {
    const s = script(end('nonsense'), end('{"results":"no"}'))
    expect(await structuredCall(s.call, triage)).toEqual({
      ok: false,
      error: { kind: 'ai_output', problem: 'schema_invalid' },
    })
    expect(s.turns).toEqual(['initial', 'repair'])
  })
  it('refusals and empty output fail immediately', async () => {
    expect(await structuredCall(script({ text: '', stop: 'refusal' }).call, triage)).toEqual({
      ok: false,
      error: { kind: 'ai_output', problem: 'refusal' },
    })
    const s = script(end('   '))
    expect(await structuredCall(s.call, triage)).toEqual({
      ok: false,
      error: { kind: 'ai_output', problem: 'empty' },
    })
    expect(s.turns).toEqual(['initial'])
  })
  it('a truncated answer is retried once with more room; truncation twice fails', async () => {
    const ok1 = script({ text: '{"results":[{"id', stop: 'length' }, end(valid))
    expect((await structuredCall(ok1.call, triage)).ok).toBe(true)
    expect(ok1.turns).toEqual(['initial', 'retry_longer'])
    const bad = script({ text: '{', stop: 'length' }, { text: '{"a', stop: 'length' })
    expect(await structuredCall(bad.call, triage)).toEqual({
      ok: false,
      error: { kind: 'ai_output', problem: 'truncated' },
    })
    const afterRepair = script(end('{}'), { text: '{"res', stop: 'length' })
    expect(await structuredCall(afterRepair.call, triage)).toEqual({
      ok: false,
      error: { kind: 'ai_output', problem: 'truncated' },
    })
  })
  it('provider failures pass through unchanged', async () => {
    expect(await structuredCall(script({ fail: true }).call, triage)).toEqual({
      ok: false,
      error: { kind: 'network' },
    })
    expect(await structuredCall(script(end('{}'), { fail: true }).call, triage)).toEqual({
      ok: false,
      error: { kind: 'network' },
    })
  })
})

describe('id reconciliation and repair message', () => {
  it('drops unknown and duplicate ids and reports unanswered ones', () => {
    const r = reconcileIds(
      [{ id: 'e1' }, { id: 'e9' }, { id: 'e1' }, { id: 'e2' }],
      ['e1', 'e2', 'e3'],
    )
    expect(r).toEqual({
      kept: [{ id: 'e1' }, { id: 'e2' }],
      dropped: ['e9', 'e1'],
      missing: ['e3'],
    })
  })
  it('the repair turn carries the original input, the invalid output and the errors', () => {
    const m = repairUserMessage('ORIGINAL', 'BAD', repairPrompt(['$.x: wrong']))
    expect(m).toContain('ORIGINAL')
    expect(m).toContain('<previous_output>\nBAD\n</previous_output>')
    expect(m).toContain('$.x: wrong')
  })
})
