import { sanitize as core } from './core.mjs'

export type SanitizeResult = { html: string; blockedImages: number }
export const sanitize = (
  html: string,
  opts: { allowRemoteImages?: boolean } = {},
): SanitizeResult => core(html, opts)
