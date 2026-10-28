import { PromptBuilder } from '../../server/ai/prompts/builder'
import { triagePrompt } from '../../server/ai/prompts/registry'
import type { AiProvider } from '../../server/ai/types'
import type { MailMessage } from '../../shared/domain'
import { extractJsonText } from '../../server/ai/structured'
import {
  misses,
  scoreEvaluation,
  TARGETS,
  type Expectation,
  type Prediction,
  type Report,
} from './metrics'

export type Row = {
  id: string
  from: string
  subject: string
  body: string
  expect: { importance: Expectation['importance']; needsReply: boolean; actions?: string[] }
}

export type EvalOptions = {
  provider: AiProvider
  model: string
  rows: Row[]
  /** Emails per request. */
  batch?: number
  /** Stop starting new requests once this many tokens were used. */
  tokenBudget?: number
  /** Stop once the estimated spend reaches this many USD; needs [price]. */
  maxCostUsd?: number
  /** USD per million tokens. */
  price?: { in: number; out: number }
  maxEmails?: number
  /** 0.95 for providers without strict structured output. */
  schemaTarget?: number
  log?: (line: string) => void
}

export type EvalResult = {
  report: Report
  missed: string[]
  tokens: { input: number; output: number }
  costUsd: number | null
  stopped: 'budget' | 'cost' | null
  promptVersion: string
}

const FROM = /^(.*)<(.+)>$/
function toMessage(r: Row): MailMessage {
  const m = FROM.exec(r.from)
  const at = new Date('2026-10-27T09:00:00Z')
  return {
    providerMessageId: r.id,
    providerThreadId: r.id,
    internetMessageId: `<${r.id}@eval.invalid>`,
    from: m ? { address: m[2]!.trim(), name: m[1]!.trim() } : { address: r.from },
    to: [{ address: 'me@eval.invalid' }],
    cc: [],
    subject: r.subject,
    sentAt: at,
    receivedAt: at,
    isRead: false,
    bodyText: r.body,
    bodyHtml: null,
    attachmentNames: [],
    references: [],
    listUnsubscribe: null,
    precedence: null,
    autoSubmitted: null,
  }
}

/** One email's answer from the parsed `results` list; invalid or missing counts against the schema rate. */
function predict(e: Record<string, unknown> | undefined): Prediction {
  if (!e) return { schemaValid: false }
  const valid = typeof e.importance === 'string' && typeof e.needsReply === 'boolean'
  return {
    schemaValid: valid,
    importance: valid ? (e.importance as string) : null,
    needsReply: valid ? (e.needsReply as boolean) : null,
    actions: (Array.isArray(e.actionItems) ? e.actionItems : []).flatMap((a) =>
      a && typeof a === 'object'
        ? [
            String(
              (a as { text?: unknown; title?: unknown }).text ??
                (a as { title?: unknown }).title ??
                '',
            ),
          ]
        : [],
    ),
  }
}

/** Scores the triage prompt against a labelled set with a token and spend limit. No database, no mailbox. */
export async function runEval(o: EvalOptions): Promise<EvalResult> {
  const log = o.log ?? (() => undefined)
  const rows = o.rows.slice(0, o.maxEmails ?? 1000)
  const batch = o.batch ?? 8
  const builder = new PromptBuilder()
  const ctx = {
    name: 'Evaluator',
    timezoneName: 'UTC',
    offsetAt: () => 0,
    now: new Date('2026-10-28T08:00:00Z'),
    selfAddresses: new Set(['me@eval.invalid']),
  }
  const expected: Expectation[] = []
  const predicted: Prediction[] = []
  const tokens = { input: 0, output: 0 }
  const cost = () =>
    o.price ? (tokens.input * o.price.in + tokens.output * o.price.out) / 1e6 : null
  let stopped: EvalResult['stopped'] = null

  for (let i = 0; i < rows.length; i += batch) {
    if (o.tokenBudget !== undefined && tokens.input + tokens.output >= o.tokenBudget) {
      stopped = 'budget'
      break
    }
    const c = cost()
    if (o.maxCostUsd !== undefined && c !== null && c >= o.maxCostUsd) {
      stopped = 'cost'
      break
    }
    const part = rows.slice(i, i + batch)
    const prompt = builder.buildTriage(
      part.map((r) => ({ messageId: r.id, message: toMessage(r) })),
      ctx,
    )
    const res = await o.provider.complete({
      model: o.model,
      system: triagePrompt.system,
      user: prompt.text,
      maxTokens: 250 * part.length + 200,
      schema: triagePrompt.schema,
    })
    const byLocal = new Map<string, Record<string, unknown>>()
    if (res.ok) {
      tokens.input += res.value.usage.inputTokens
      tokens.output += res.value.usage.outputTokens
      try {
        const json = JSON.parse(extractJsonText(res.value.text) ?? res.value.text) as {
          results?: Record<string, unknown>[]
        }
        for (const e of json.results ?? []) {
          const local = prompt.idMap[String(e.id)]
          if (local) byLocal.set(local, e)
        }
      } catch {
        // unparseable: every email in the batch counts as schema-invalid
      }
    }
    for (const r of part) {
      expected.push({ ...r.expect, actions: r.expect.actions ?? [] })
      predicted.push(predict(byLocal.get(r.id)))
    }
    log(`scored ${expected.length}/${rows.length}`)
  }

  const report = scoreEvaluation(expected, predicted)
  return {
    report,
    missed: misses(report, o.schemaTarget),
    tokens,
    costUsd: cost(),
    stopped,
    promptVersion: triagePrompt.version,
  }
}

/** The report as printed: each metric next to its target. */
export function formatReport(r: EvalResult, model: string, schemaTarget = TARGETS.schemaValidRate) {
  const per = r.report.cases ? Math.round((r.tokens.input + r.tokens.output) / r.report.cases) : 0
  const lines = [
    `prompt ${r.promptVersion}  model ${model}  emails ${r.report.cases}`,
    `tokens: ${r.tokens.input} in, ${r.tokens.output} out (${per} per email)` +
      (r.costUsd !== null ? `  estimated spend: $${r.costUsd.toFixed(4)}` : ''),
    ...(r.stopped ? [`stopped early: ${r.stopped} limit reached`] : []),
  ]
  for (const k of Object.keys(TARGETS) as (keyof typeof TARGETS)[]) {
    const target = k === 'schemaValidRate' ? schemaTarget : TARGETS[k]
    lines.push(
      `${r.report[k] >= target ? 'ok  ' : 'MISS'} ${k.padEnd(20)} ${r.report[k].toFixed(3)}  (target ${target})`,
    )
  }
  return lines.join('\n')
}
