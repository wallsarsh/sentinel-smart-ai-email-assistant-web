import { PromptBuilder, type BriefEmail, type UserContext } from './prompts/builder'
import { briefPrompt } from './prompts/registry'
import { structuredCall, type Attempt, type Caller } from './ai/structured'
import type { AiRequest } from './ai/types'
import type { AppFailure } from './errors/failure'
import { err, ok, type Result } from './errors/result'

export const BRIEF_SECTIONS = ['topPriorities', 'needsReply', 'dueToday', 'fyi'] as const
export type BriefSectionType = (typeof BRIEF_SECTIONS)[number]
export type BriefItem = { text: string; messageIds: string[] }
export type BriefSection = { type: BriefSectionType; items: BriefItem[] }

export type PriorityCode = 'p1_do_now' | 'p2_today' | 'p3_this_week' | 'p4_fyi'
/** Importance x urgency to priority (same matrix as the mobile app and shared/domain). */
export function priorityOf(importance: string, urgency: string): PriorityCode {
  const urgent = urgency === 'urgent'
  if (importance === 'high') return urgent ? 'p1_do_now' : 'p2_today'
  if (importance === 'medium') return urgent ? 'p2_today' : 'p3_this_week'
  return urgent ? 'p3_this_week' : 'p4_fyi'
}
export const PRIORITY_LABEL: Record<PriorityCode, string> = {
  p1_do_now: 'P1',
  p2_today: 'P2',
  p3_this_week: 'P3',
  p4_fyi: 'P4',
}

/** Order in which mail is offered to the brief (lower first). Bulk mail without urgency returns null: counted, not listed. */
export function briefRank(
  priority: PriorityCode,
  needsReply: boolean,
  bulk: boolean,
): number | null {
  const rank =
    priority === 'p1_do_now'
      ? 0
      : priority === 'p2_today'
        ? 1
        : needsReply
          ? 2
          : priority === 'p3_this_week'
            ? 3
            : bulk
              ? 9
              : 4
  return rank === 9 ? null : rank
}

export const clip = (s: string, max: number) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`
}

type Parsed = {
  headline: string
  sections: { type: string; items: { text: string; emailIds: string[] }[] }[]
}

/**
 * Turns the model's answer into a brief. Every id is checked against the ids that were sent: unknown ids are
 * dropped, and an item with no valid id left is dropped too, so each item links to real mail.
 */
export function assembleBrief(
  parsed: Parsed,
  idMap: Record<string, string>,
  maxItems = 5,
): { headline: string; sections: BriefSection[] } {
  const byType = new Map<string, BriefItem[]>()
  const seen = new Set<string>()
  for (const sec of parsed.sections) {
    if (!(BRIEF_SECTIONS as readonly string[]).includes(sec.type)) continue
    for (const item of sec.items) {
      const valid: string[] = []
      for (const id of item.emailIds) {
        const local = idMap[id]
        if (local && !valid.includes(local)) valid.push(local)
      }
      const text = clip(item.text, 160)
      if (!valid.length || !text || seen.has(text)) continue
      seen.add(text)
      const list = byType.get(sec.type) ?? []
      if (list.length < maxItems) list.push({ text, messageIds: valid })
      byType.set(sec.type, list)
    }
  }
  return {
    headline: clip(parsed.headline, 400),
    sections: BRIEF_SECTIONS.filter((t) => byType.get(t)?.length).map((type) => ({
      type,
      items: byType.get(type)!,
    })),
  }
}

export type BriefAsk = (
  req: Omit<AiRequest, 'model'>,
  kind: 'brief' | 'repair',
) => Promise<Result<Attempt, AppFailure>>

/** Builds the brief prompt from already-analysed mail, asks the model (one repair turn allowed) and assembles the result. */
export async function runBrief(o: {
  emails: BriefEmail[]
  ctx: UserContext
  window: { start: Date; end: Date }
  stats: Record<string, number>
  builder: PromptBuilder
  ask: BriefAsk
  maxItems?: number
}): Promise<Result<{ headline: string; sections: BriefSection[] }, AppFailure>> {
  const prompt = o.builder.buildBrief(o.emails, o.ctx, {
    windowStart: o.window.start,
    windowEnd: o.window.end,
    stats: o.stats,
  })
  const call: Caller = (turn) =>
    o.ask(
      {
        system: briefPrompt.system,
        user:
          turn.kind === 'repair'
            ? `${prompt.text}\n\n<previous_output>\n${turn.invalid}\n</previous_output>\n${turn.prompt}`
            : prompt.text,
        maxTokens: turn.kind === 'retry_longer' ? 4000 : 2000,
        schema: briefPrompt.schema,
      },
      turn.kind === 'repair' ? 'repair' : 'brief',
    )
  const res = await structuredCall(call, briefPrompt.schema!.schema)
  if (!res.ok) return res
  const out = assembleBrief(res.value as Parsed, prompt.idMap, o.maxItems)
  if (!out.headline && !out.sections.length) return err({ kind: 'ai_output', problem: 'empty' })
  return ok(out)
}
