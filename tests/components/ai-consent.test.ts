import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'

// The page renders these keys; this guards the plain-language promises it makes.
describe('consent copy', () => {
  it('states what is sent, what is not, and that nothing is sent automatically', () => {
    const c = en.ai.consent
    expect(c.where).toContain('{host}')
    expect(c.sent2).toMatch(/never the files/)
    expect(c.not3).toMatch(/before you allow it/)
    expect(c.control).toMatch(/never sends email/i)
  })
})
