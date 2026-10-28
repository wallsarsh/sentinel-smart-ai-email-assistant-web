import { describe, expect, it } from 'vitest'
import { isHttps, nativeDraftLink } from '../../app/utils/native-link'

describe('native draft links', () => {
  it('Gmail and Outlook links are https and carry the encoded draft id', () => {
    const g = nativeDraftLink('gmail', {
      providerDraftId: 'r-123/abc',
      accountEmail: 'me@gmail.com',
    })
    expect(g).toEqual({
      kind: 'link',
      url: 'https://mail.google.com/mail/?authuser=me%40gmail.com#drafts?compose=r-123%2Fabc',
    })
    const o = nativeDraftLink('microsoft_graph', { providerDraftId: 'AAMk=' })
    expect(o).toEqual({
      kind: 'link',
      url: 'https://outlook.office.com/mail/deeplink/compose/AAMk%3D',
    })
  })
  it('IMAP and unsaved drafts have no link: the user is told to open their Drafts folder', () => {
    expect(nativeDraftLink('imap', { providerDraftId: 'Drafts:1:5' })).toEqual({ kind: 'manual' })
    expect(nativeDraftLink('gmail', { providerDraftId: null })).toEqual({ kind: 'manual' })
  })
  it('every produced URL is https, whatever the input', () => {
    for (const id of ['x', 'javascript:alert(1)', '"><script>', 'http://evil', '\n']) {
      for (const type of ['gmail', 'microsoft_graph'] as const) {
        const l = nativeDraftLink(type, { providerDraftId: id, accountEmail: 'a@b.test' })
        expect(l.kind === 'manual' || isHttps(l.url)).toBe(true)
        if (l.kind === 'link')
          expect(new URL(l.url).hostname).toMatch(/^(mail\.google\.com|outlook\.office\.com)$/)
      }
    }
    expect(isHttps('http://x.test')).toBe(false)
    expect(isHttps('nonsense')).toBe(false)
  })
})
