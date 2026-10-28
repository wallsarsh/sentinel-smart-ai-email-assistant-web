import type { Db } from '../db/client'
import { forUser } from '../repos'
import { rowToMailMessage } from '../sync/message-mapper'
import { builderOptions } from '../ai/prompts/from-settings'
import { PromptBuilder } from '../ai/prompts/builder'
import { PROMPT_VERSIONS, draftPrompt } from '../ai/prompts/registry'
import { buildUserContext } from '../ai/user-context'
import type { aiGateway } from '../ai/gateway'
import type { aiRouter, Route } from '../ai/router'
import { isRetryable } from '../ai/router'
import { AiStreamError } from '../ai/types'
import type { DraftIntent, DraftTone } from '../../shared/domain'
import type { AppFailure } from '../../shared/errors/failure'
import { cleanDraft, placeholders, scanForeignDetails, type ForeignDetail } from './clean'

export type DraftEvent =
  | { type: 'delta'; text: string }
  | {
      type: 'done'
      text: string
      placeholders: string[]
      foreign: ForeignDetail[]
      promptVersion: string
      model: string
    }

export type DraftRequest = {
  userId: string
  messageId: string
  tone: DraftTone
  intent: DraftIntent
  instruction?: string
  signal?: AbortSignal
}

type Gateway = Pick<ReturnType<typeof aiGateway>, 'stream'>
type Router = Pick<ReturnType<typeof aiRouter>, 'routesFor'>

const THREAD_LIMIT = 5

/**
 * Streams a reply draft for the last message of a thread. Only the user's
 * explicit request starts this; it produces text and nothing else: drafts are
 * saved or sent through other, user-driven steps. Cancelling (AbortSignal or
 * simply stopping iteration) closes the upstream request.
 */
export function draftGenerator(d: { db: Db; gateway: Gateway; router: Router; now?: () => Date }) {
  const now = d.now ?? (() => new Date())
  return {
    async *generate(r: DraftRequest): AsyncGenerator<DraftEvent, void, void> {
      const repos = forUser(d.db, r.userId)
      const row = await repos.mail.getMessage(r.messageId)
      if (!row) throw new AiStreamError({ kind: 'not_found' })
      const account = await repos.accounts.get(row.accountId)
      // An AI-excluded account's mail never reaches a model, drafts included.
      if (account?.aiExcluded) throw new AiStreamError({ kind: 'forbidden', code: 'ai_excluded' })

      const threadRows = row.threadId
        ? (await repos.mail.threadMessages(row.threadId)).slice(-THREAD_LIMIT)
        : [row]
      const thread = threadRows.map((t) => rowToMailMessage(t))
      const ctx = await buildUserContext(d.db, r.userId, now())
      const settings = await repos.settings.all()
      const built = new PromptBuilder(builderOptions(settings)).buildDraft(
        threadRows.map((t) => ({ messageId: t.id, message: rowToMailMessage(t) })),
        ctx,
        { tone: r.tone, intent: r.intent, instruction: r.instruction },
      )

      const routes: Route[] = await d.router.routesFor(r.userId, 'draft')
      if (!routes.length)
        throw new AiStreamError({ kind: 'validation', field: 'route', code: 'no_route' })

      let last: AppFailure = { kind: 'unknown' }
      for (const route of routes) {
        let started = false
        let text = ''
        try {
          for await (const ev of d.gateway.stream({
            userId: r.userId,
            providerId: route.providerId,
            task: 'draft',
            request: {
              model: route.model,
              system: draftPrompt.system,
              user: built.text,
              maxTokens: route.params.maxTokens ?? 1500,
              temperature: route.params.temperature ?? 0.5,
              signal: r.signal,
            },
          })) {
            if (r.signal?.aborted) return
            if (ev.type === 'delta') {
              started = true
              text += ev.text
              yield { type: 'delta', text: ev.text }
            } else if (ev.type === 'done') {
              const final = cleanDraft(text)
              const known = [
                ...thread.flatMap((m) => [
                  m.bodyText,
                  m.from.address,
                  m.subject,
                  ...m.to.map((a) => a.address),
                  ...m.cc.map((a) => a.address),
                ]),
                ctx.name,
                ctx.signOff ?? '',
                ...ctx.selfAddresses,
              ]
              const profile = (await repos.settings.get('profile.signature')) as string
              yield {
                type: 'done',
                text: final,
                placeholders: placeholders(final),
                foreign: scanForeignDetails(final, [...known, profile]),
                promptVersion: PROMPT_VERSIONS.draft,
                model: route.model,
              }
              return
            }
          }
          return
        } catch (e) {
          if (r.signal?.aborted) return
          if (!(e instanceof AiStreamError)) throw e
          last = e.failure
          // Fall back only while nothing has been shown to the user yet.
          if (started || !isRetryable(e.failure)) throw e
        }
      }
      throw new AiStreamError(last)
    },
  }
}
