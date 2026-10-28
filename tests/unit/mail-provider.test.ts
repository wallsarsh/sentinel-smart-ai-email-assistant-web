import { describe, expect, it } from 'vitest'
import { FakeMailProvider } from '../helpers/fake-mail-provider'
import { runMailProviderContract } from '../contract/mail-provider-contract'
import { FORBIDDEN_PROVIDER_METHODS } from '../../server/mail/provider'
import { readFileSync } from 'node:fs'

runMailProviderContract('in-memory reference', async () => {
  const provider = new FakeMailProvider()
  return {
    provider,
    seed: async (m) => void provider.messages.set(m.providerMessageId, m),
    breakNetwork: () => void (provider.failNext = { kind: 'network' }),
  }
})

describe('provider port', () => {
  it('declares no send capability (type level and by name)', () => {
    const src = readFileSync('server/mail/provider.ts', 'utf8')
    const iface = src.slice(
      src.indexOf('export interface MailProvider'),
      src.indexOf('/** Method names'),
    )
    for (const bad of FORBIDDEN_PROVIDER_METHODS)
      expect(iface).not.toMatch(new RegExp(`\\b${bad}\\s*\\(`))
    // @ts-expect-error a MailProvider has no `send`
    const probe = (p: import('../../server/mail/provider').MailProvider) => p.send
    expect(probe).toBeTypeOf('function')
  })
})
