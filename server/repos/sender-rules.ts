import { and, eq, isNotNull, isNull, or } from 'drizzle-orm'
import { senderRules } from '../db/schema'
import type { Importance } from '../../shared/domain'
import type { Scope } from './scope'

export type RuleKind = 'vip' | 'mute' | 'correction'

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DOMAIN = /^@[^@\s]+\.[^@\s]+$/

/** Normalises user input to an address or `@domain` pattern, or null when it is neither. */
export function normalizePattern(input: string): string | null {
  const p = input.trim().toLowerCase()
  return ADDRESS.test(p) || DOMAIN.test(p) ? p : null
}

export const MAX_HINTS = 10
const MAX_HINT_CHARS = 160

const LABEL: Record<Importance, string> = { high: 'High', medium: 'Medium', low: 'Low' }

/**
 * VIP/mute rules (address or @domain; global or for one account) and the
 * importance corrections that become hints in AI prompts.
 */
export const senderRulesRepo = (s: Scope) => {
  const mine = eq(senderRules.userId, s.userId)
  const scope = (accountId: string | null) =>
    accountId ? eq(senderRules.accountId, accountId) : isNull(senderRules.accountId)

  return {
    list: () => s.db.select().from(senderRules).where(mine).orderBy(senderRules.pattern),

    /** Rules that apply to mail of [accountId]: global ones plus that account's own, de-duplicated. */
    async effective(accountId: string) {
      const rows = await s.db
        .select()
        .from(senderRules)
        .where(and(mine, or(isNull(senderRules.accountId), eq(senderRules.accountId, accountId))))
      const seen = new Set<string>()
      return rows
        .filter((r) =>
          seen.has(`${r.rule}:${r.pattern}`) ? false : (seen.add(`${r.rule}:${r.pattern}`), true),
        )
        .map((r) => ({ pattern: r.pattern, kind: r.rule as RuleKind }))
    },

    /**
     * Adds a VIP or mute rule. Returns false for invalid input. The opposite
     * rule for the same sender in the same scope is removed (a sender is never
     * both), and a duplicate is a no-op. A per-account rule that a global rule
     * already covers is not stored again.
     */
    async add(
      kind: 'vip' | 'mute',
      input: string,
      accountId: string | null = null,
    ): Promise<boolean> {
      const pattern = normalizePattern(input)
      if (!pattern || (kind !== 'vip' && kind !== 'mute')) return false
      const opposite = kind === 'vip' ? 'mute' : 'vip'
      await s.db.transaction(async (tx) => {
        await tx
          .delete(senderRules)
          .where(
            and(
              mine,
              scope(accountId),
              eq(senderRules.pattern, pattern),
              eq(senderRules.rule, opposite),
            ),
          )
        const covers = await tx
          .select({ id: senderRules.id })
          .from(senderRules)
          .where(
            and(
              mine,
              eq(senderRules.pattern, pattern),
              eq(senderRules.rule, kind),
              accountId
                ? or(isNull(senderRules.accountId), eq(senderRules.accountId, accountId))
                : isNull(senderRules.accountId),
            ),
          )
        if (!covers.length)
          await tx.insert(senderRules).values({ userId: s.userId, accountId, pattern, rule: kind })
        // A new global rule makes the account-specific copies redundant.
        if (!accountId)
          await tx
            .delete(senderRules)
            .where(
              and(
                mine,
                eq(senderRules.pattern, pattern),
                eq(senderRules.rule, kind),
                isNotNull(senderRules.accountId),
              ),
            )
      })
      return true
    },

    async remove(id: string): Promise<boolean> {
      const r = await s.db
        .delete(senderRules)
        .where(and(mine, eq(senderRules.id, id)))
        .returning({ id: senderRules.id })
      return r.length > 0
    },

    /** Remembers the user's importance for a sender; later mail gets that importance. One correction per sender. */
    async setCorrection(address: string, importance: Importance): Promise<void> {
      const pattern = address.trim().toLowerCase()
      await s.db.transaction(async (tx) => {
        await tx
          .delete(senderRules)
          .where(
            and(
              mine,
              isNull(senderRules.accountId),
              eq(senderRules.pattern, pattern),
              eq(senderRules.rule, 'correction'),
            ),
          )
        await tx.insert(senderRules).values({
          userId: s.userId,
          accountId: null,
          pattern,
          rule: 'correction',
          payloadJson: { importance },
        })
      })
    },

    /** The remembered importance for [address], if any. */
    async correctionFor(address: string): Promise<Importance | null> {
      const a = address.trim().toLowerCase()
      const [r] = await s.db
        .select()
        .from(senderRules)
        .where(and(mine, eq(senderRules.rule, 'correction'), eq(senderRules.pattern, a)))
      const v = (r?.payloadJson as { importance?: string } | undefined)?.importance
      return v === 'high' || v === 'medium' || v === 'low' ? v : null
    },

    /** Short prompt hints from corrections, newest first, bounded in count and length. */
    async hints(): Promise<string[]> {
      const rows = await s.db
        .select()
        .from(senderRules)
        .where(and(mine, eq(senderRules.rule, 'correction')))
        .orderBy(senderRules.createdAt)
      return rows
        .reverse()
        .flatMap((r) => {
          const v = (r.payloadJson as { importance?: Importance }).importance
          return v && v in LABEL
            ? [`${r.pattern} → user marks ${LABEL[v]} importance`.slice(0, MAX_HINT_CHARS)]
            : []
        })
        .slice(0, MAX_HINTS)
    },
  }
}
