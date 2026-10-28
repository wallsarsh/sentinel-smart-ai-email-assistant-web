import { z } from 'zod'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import type { MailMessage } from '../../shared/domain'
import type { aiGateway } from './gateway'
import { PromptBuilder, type UserContext } from './prompts/builder'
import { triagePrompt } from './prompts/registry'
import { problems } from './structured'

/**
 * Made-up emails for comparing models. The bench never reads the user's
 * mailbox: this module imports no repository, and a test enforces it.
 */
export const SAMPLES: MailMessage[] = [
  {
    subject: 'Board call moved up: Q3 numbers by 3pm',
    from: { address: 'alex@acme.example', name: 'Alex Chen' },
    body: 'Hi, can you send the final Q3 numbers before 3pm today? The board call moved up. Thanks!',
  },
  {
    subject: 'Your weekly digest',
    from: { address: 'news@vendor.example', name: 'Vendor News' },
    body: 'Top stories this week: ten tips for better dashboards. Unsubscribe any time.',
  },
  {
    subject: 'Invoice 4411 due Friday',
    from: { address: 'billing@supplier.example', name: 'Supplier Billing' },
    body: 'Invoice 4411 for 1,200 EUR is due this Friday. Please confirm payment.',
  },
].map((m, i) => ({
  providerMessageId: `bench-${i + 1}`,
  providerThreadId: null,
  internetMessageId: `<bench-${i + 1}@bench.example>`,
  from: m.from,
  to: [{ address: 'you@bench.example', name: 'You' }],
  cc: [],
  subject: m.subject,
  sentAt: new Date('2026-10-27T07:14:00Z'),
  receivedAt: new Date('2026-10-27T07:14:00Z'),
  isRead: false,
  bodyText: m.body,
  bodyHtml: null,
  attachmentNames: [],
  references: [],
  listUnsubscribe: null,
  precedence: null,
  autoSubmitted: null,
}))

const side = z.object({ providerId: z.uuid(), model: z.string().trim().min(1).max(200) })
export const benchInput = z.object({ a: side, b: side })

export type BenchSide = {
  ok: boolean
  failure?: AppFailure
  validJson?: boolean
  errors?: string[]
  text?: string
  tokens?: { input: number; output: number; cached: number }
  latencyMs: number
  costMicros?: number
  unpriced?: boolean
}

const context: UserContext = {
  name: 'You',
  timezoneName: 'UTC',
  offsetAt: () => 0,
  now: new Date('2026-10-27T08:00:00Z'),
  selfAddresses: new Set(['you@bench.example']),
  vipSenders: [],
  senderHints: [],
}

export function aiBench(d: {
  gateway: Pick<ReturnType<typeof aiGateway>, 'complete'>
  clock?: () => number
}) {
  const clock = d.clock ?? (() => performance.now())
  return {
    /** Runs the triage prompt over the samples on two provider/model pairs. Calls are metered like any other. */
    async compare(
      userId: string,
      input: unknown,
    ): Promise<
      Result<{ samples: { id: string; subject: string }[]; a: BenchSide; b: BenchSide }, AppFailure>
    > {
      const p = benchInput.safeParse(input)
      if (!p.success) return err({ kind: 'validation', field: 'bench', code: 'invalid' })
      const built = new PromptBuilder().buildTriage(
        SAMPLES.map((m) => ({ messageId: m.providerMessageId, message: m })),
        context,
      )
      const run = async (s: z.infer<typeof side>): Promise<BenchSide> => {
        const t0 = clock()
        const r = await d.gateway.complete({
          userId,
          providerId: s.providerId,
          task: 'triage',
          request: {
            model: s.model,
            system: triagePrompt.system,
            user: built.text,
            maxTokens: 2000,
            temperature: 0,
            schema: triagePrompt.schema,
          },
        })
        const latencyMs = Math.round(clock() - t0)
        if (!r.ok) return { ok: false, failure: r.error, latencyMs }
        const check = problems(r.value.text, triagePrompt.schema!.schema)
        return {
          ok: true,
          validJson: check.errors.length === 0,
          errors: check.errors,
          text: r.value.text,
          latencyMs,
          tokens: {
            input: r.value.usage.inputTokens,
            output: r.value.usage.outputTokens,
            cached: r.value.usage.cachedTokens,
          },
          costMicros: r.value.cost.micros,
          unpriced: r.value.cost.unpriced,
        }
      }
      const [a, b] = await Promise.all([run(p.data.a), run(p.data.b)])
      return ok({
        samples: SAMPLES.map((m) => ({ id: m.providerMessageId, subject: m.subject })),
        a,
        b,
      })
    },
  }
}
