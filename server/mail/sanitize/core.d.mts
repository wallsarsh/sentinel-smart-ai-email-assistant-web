export function cleanStyle(style: string): string
export function sanitize(
  html: string,
  opts?: { allowRemoteImages?: boolean },
): { html: string; blockedImages: number }
