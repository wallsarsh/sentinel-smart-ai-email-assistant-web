import { lookup as dnsLookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'

/** True only for globally routable unicast addresses (not private, loopback, link-local, CGNAT, multicast, reserved). */
export function isPublicAddress(ip: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6
  try {
    addr = ipaddr.parse(ip)
  } catch {
    return false
  }
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6
    // IPv4-mapped (::ffff:a.b.c.d) is judged by its IPv4 part.
    if (v6.isIPv4MappedAddress()) return isPublicAddress(v6.toIPv4Address().toString())
    return v6.range() === 'unicast' && !isTeredoOr6to4(v6)
  }
  return (addr as ipaddr.IPv4).range() === 'unicast'
}

// 6to4 (2002::/16) and Teredo (2001::/32) embed IPv4 addresses; refuse them outright.
function isTeredoOr6to4(a: ipaddr.IPv6): boolean {
  const p = a.parts
  return p[0] === 0x2002 || (p[0] === 0x2001 && p[1] === 0)
}

export type Resolver = (host: string) => Promise<string[]>

export const systemResolver: Resolver = async (host) =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((r) => r.address)

export class SsrfError extends Error {
  constructor(readonly code: 'bad_scheme' | 'bad_host' | 'private_address' | 'too_many_redirects') {
    super(`blocked: ${code}`)
  }
}

export type UrlPolicy = { allowHttp?: boolean }

/**
 * Validates a user-supplied URL: https only (unless allowed), no credentials,
 * and every address the name resolves to must be public. Returns the checked
 * addresses so the caller connects to exactly those (no second lookup).
 */
export async function checkUrl(
  raw: string,
  policy: UrlPolicy = {},
  resolve: Resolver = systemResolver,
) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SsrfError('bad_host')
  }
  if (url.protocol !== 'https:' && !(policy.allowHttp && url.protocol === 'http:'))
    throw new SsrfError('bad_scheme')
  if (url.username || url.password) throw new SsrfError('bad_host')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local')
  )
    throw new SsrfError('private_address')
  const addrs = ipaddr.isValid(host) ? [host] : await resolve(host)
  if (addrs.length === 0 || !addrs.every(isPublicAddress)) throw new SsrfError('private_address')
  return { url, addresses: addrs }
}
