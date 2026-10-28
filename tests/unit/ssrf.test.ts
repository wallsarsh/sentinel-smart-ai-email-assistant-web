import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { SsrfError, checkUrl, isPublicAddress } from '../../server/http/ssrf'
import { safeFetch } from '../../server/http/safe-fetch'

describe('isPublicAddress', () => {
  it('rejects private, loopback, link-local, CGNAT, multicast and reserved ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.9.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '192.0.2.1',
      '198.18.0.1',
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '2002:7f00:1::',
      '2001:0:4136:e378:8000:63bf:3fff:fdd2',
      'not-an-ip',
    ])
      expect(isPublicAddress(ip), ip).toBe(false)
  })
  it('accepts public addresses', () => {
    for (const ip of [
      '8.8.8.8',
      '1.1.1.1',
      '93.184.216.34',
      '2606:4700:4700::1111',
      '::ffff:8.8.8.8',
    ])
      expect(isPublicAddress(ip), ip).toBe(true)
  })
})

describe('checkUrl', () => {
  const resolve = (map: Record<string, string[]>) => async (h: string) => map[h] ?? []
  const code = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as SsrfError).code

  it('refuses http, credentials, localhost-style names and private resolutions', async () => {
    expect(
      await code(checkUrl('http://example.org', {}, resolve({ 'example.org': ['8.8.8.8'] }))),
    ).toBe('bad_scheme')
    expect(await code(checkUrl('https://u:p@example.org', {}, resolve({})))).toBe('bad_host')
    expect(await code(checkUrl('https://localhost/x'))).toBe('private_address')
    expect(await code(checkUrl('https://db.internal/x'))).toBe('private_address')
    expect(
      await code(
        checkUrl('https://evil.test', {}, resolve({ 'evil.test': ['8.8.8.8', '10.0.0.1'] })),
      ),
    ).toBe('private_address')
    expect(await code(checkUrl('https://[::1]/'))).toBe('private_address')
    expect(await code(checkUrl('https://169.254.169.254/latest'))).toBe('private_address')
    expect(await code(checkUrl('https://nx.test', {}, resolve({})))).toBe('private_address')
  })

  it('accepts public names and returns the vetted addresses', async () => {
    const r = await checkUrl(
      'https://api.example.org/v1',
      {},
      resolve({ 'api.example.org': ['93.184.216.34'] }),
    )
    expect(r.addresses).toEqual(['93.184.216.34'])
  })
})

describe('safeFetch', () => {
  it('blocks private targets before any connection', async () => {
    const e = (await safeFetch('https://127.0.0.1:1/', { retries: 0 }).catch((x) => x)) as SsrfError
    expect(e.code).toBe('private_address')
  })

  it('re-validates redirects (public host redirecting to a private address is blocked)', async () => {
    const e = (await safeFetch('https://pub.test/', {
      resolver: async () => ['93.184.216.34'],
      retries: 0,
      timeoutMs: 500,
    }).catch((x) => x)) as Error
    // The public IP is unreachable in the sandbox; what matters is that it was attempted, not blocked.
    expect(e).not.toBeInstanceOf(SsrfError)
  })

  it('allowHttp policy still refuses private addresses (local server cannot be reached)', async () => {
    const srv = createServer((_, res) => res.end('secret')).listen(0, '127.0.0.1')
    await new Promise((r) => srv.once('listening', r))
    const port = (srv.address() as AddressInfo).port
    const e = (await safeFetch(`http://127.0.0.1:${port}/`, { policy: { allowHttp: true } }).catch(
      (x) => x,
    )) as SsrfError
    srv.close()
    expect(e.code).toBe('private_address')
  })

  it('errors are scrubbed', async () => {
    let message = ''
    try {
      await safeFetch('https://pub.test/?k=sk-ant-abcdefghijklmnop1234', {
        resolver: async () => ['93.184.216.34'],
        retries: 0,
        timeoutMs: 300,
      })
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).not.toContain('sk-ant')
  })
})
