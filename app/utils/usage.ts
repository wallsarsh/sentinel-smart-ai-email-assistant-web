export type UsageRow = {
  day: string
  providerId: string | null
  model: string
  task: string
  calls: number
  inputTokens: number
  outputTokens: number
  costMicros: number
}

export type DayTotal = { day: string; tokens: number; costMicros: number; calls: number }

/** One entry per day in the window (zeros included) so the chart has no gaps. */
export function byDay(rows: UsageRow[], days: number, today: Date): DayTotal[] {
  const out = new Map<string, DayTotal>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i),
    )
      .toISOString()
      .slice(0, 10)
    out.set(d, { day: d, tokens: 0, costMicros: 0, calls: 0 })
  }
  for (const r of rows) {
    const t = out.get(r.day)
    if (!t) continue
    t.tokens += r.inputTokens + r.outputTokens
    t.costMicros += r.costMicros
    t.calls += r.calls
  }
  return [...out.values()]
}

export type ModelTotal = {
  model: string
  tokens: number
  costMicros: number
  calls: number
  unpriced: boolean
}

/** Per model; `unpriced` marks models that cost 0 only because no price was entered. */
export function byModel(rows: UsageRow[], prices: Record<string, unknown>): ModelTotal[] {
  const m = new Map<string, ModelTotal>()
  for (const r of rows) {
    const t = m.get(r.model) ?? {
      model: r.model,
      tokens: 0,
      costMicros: 0,
      calls: 0,
      unpriced: !(r.model in prices),
    }
    t.tokens += r.inputTokens + r.outputTokens
    t.costMicros += r.costMicros
    t.calls += r.calls
    m.set(r.model, t)
  }
  return [...m.values()].sort((a, b) => b.tokens - a.tokens)
}

/** micro-USD → "$1.23". */
export const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(micros >= 10_000 ? 2 : 4)}`
