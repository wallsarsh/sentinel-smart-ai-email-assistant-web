import { z } from 'zod'
import type { Db } from '../db/client'
import { forUser } from '../repos'
import { priorityOf } from '../../shared/domain'
import type { AppFailure } from '../../shared/errors/failure'
import { err, ok, type Result } from '../../shared/errors/result'

const input = z
  .object({
    importance: z.enum(['high', 'medium', 'low']).optional(),
    needsReply: z.boolean().optional(),
  })
  .refine((v) => v.importance !== undefined || v.needsReply !== undefined)

/**
 * Lets the user fix a classification (BR-04). The message changes right away,
 * is marked as set by the user, and an importance correction is remembered for
 * the sender so later mail from them is classified the same way.
 */
export function triageCorrections(db: Db) {
  return {
    async correct(
      userId: string,
      messageId: string,
      body: unknown,
    ): Promise<Result<undefined, AppFailure>> {
      const p = input.safeParse(body)
      if (!p.success) return err({ kind: 'validation', field: 'correction', code: 'invalid' })
      const repos = forUser(db, userId)
      const message = await repos.mail.getMessage(messageId)
      const current = await repos.triage.resultFor(messageId)
      if (!message || !current) return err({ kind: 'not_found' })
      await repos.transaction(async (tx) => {
        await tx.triage.update(messageId, {
          source: 'user',
          ...(p.data.importance
            ? {
                importance: p.data.importance,
                priority: priorityOf(p.data.importance, current.urgency),
              }
            : {}),
          ...(p.data.needsReply === undefined ? {} : { needsReply: p.data.needsReply }),
        })
        if (p.data.importance) await tx.rules.setCorrection(message.fromAddress, p.data.importance)
      })
      return ok(undefined)
    },
  }
}
