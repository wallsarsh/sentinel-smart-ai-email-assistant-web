export const STEPS = ['welcome', 'privacy', 'accounts', 'ai', 'brief'] as const
export type Step = (typeof STEPS)[number]

export const stepIndex = (s: Step) => STEPS.indexOf(s)
/** The step after [s], or null at the end. */
export const nextStep = (s: Step): Step | null => STEPS[stepIndex(s) + 1] ?? null
/** The step before [s], or null at the start. */
export const prevStep = (s: Step): Step | null =>
  stepIndex(s) > 0 ? STEPS[stepIndex(s) - 1]! : null
/** The stored step index as a step (anything out of range starts over). */
export const asStep = (v: unknown): Step =>
  typeof v === 'number' && Number.isInteger(v) && STEPS[v] ? STEPS[v]! : 'welcome'
