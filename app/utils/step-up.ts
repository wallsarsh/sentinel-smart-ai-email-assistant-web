import type { WireFailure } from './failure-presenter'

type FetchError = { statusCode?: number; statusMessage?: string; data?: { error?: WireFailure } }

/** The server wants a recent second-factor check before it will do this. */
export const needsStepUp = (e: unknown) =>
  (e as FetchError).statusCode === 403 && (e as FetchError).statusMessage === 'step_up_required'

/** The failure the API returned, or a network failure when there was none. */
export const failureOf = (e: unknown): WireFailure =>
  (e as FetchError).data?.error ?? { kind: 'network' }
