import * as T from './texts.generated'

export type PromptSpec = {
  /** Stored with every AI result (prompt_version). Bump when the text or schema changes. */
  version: string
  /** Static system prompt: no per-user or per-email text ever goes in here. */
  system: string
  schema?: { name: string; schema: Record<string, unknown> }
}

const json = (s: string) => JSON.parse(s) as Record<string, unknown>

export const triagePrompt: PromptSpec = {
  version: 'triage.v1',
  system: T.triageSystem.trim(),
  schema: { name: 'triage_v1', schema: json(T.triageSchemaJson) },
}
export const briefPrompt: PromptSpec = {
  version: 'brief.v1',
  system: T.briefSystem.trim(),
  schema: { name: 'brief_v1', schema: json(T.briefSchemaJson) },
}
export const draftPrompt: PromptSpec = { version: 'draft.v1', system: T.draftSystem.trim() }
export const repairTemplate = T.repairTemplate.trim()
export const repairVersion = 'repair.v1'

/** Versions of every prompt, for logging and evaluation (never contains prompt text). */
export const PROMPT_VERSIONS = {
  triage: triagePrompt.version,
  brief: briefPrompt.version,
  draft: draftPrompt.version,
  repair: repairVersion,
} as const
