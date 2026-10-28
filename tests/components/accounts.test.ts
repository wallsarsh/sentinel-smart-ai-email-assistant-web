// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ImapWizard from '../../app/components/accounts/ImapWizard.vue'
import FolderPicker from '../../app/components/accounts/FolderPicker.vue'
import AdminConsentHelp from '../../app/components/accounts/AdminConsentHelp.vue'
import FailureBanner from '../../app/components/FailureBanner.vue'
import en from '../../i18n/locales/en.json'

const t = (key: string, p: Record<string, unknown> = {}) =>
  (
    (key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en) as string) ??
    key
  ).replace(/\{(\w+)\}/g, (_m, k) => String(p[k]))
const mountIt = (c: object, props: object = {}) =>
  mount(c as never, { props, global: { mocks: { $t: t }, components: { FailureBanner } } })

afterEach(() => vi.unstubAllGlobals())

describe('ImapWizard', () => {
  const settings = {
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecurity: 'implicit_tls',
    username: 'me@icloud.com',
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecurity: 'start_tls',
  }

  it('walks email → autodiscovery → test → save, with labelled fields', async () => {
    const calls: string[] = []
    vi.stubGlobal('$fetch', async (url: string, o?: { method?: string }) => {
      calls.push(`${o?.method ?? 'GET'} ${url}`)
      return url.includes('discover') ? { settings, appPassword: true } : { ok: true }
    })
    const w = mountIt(ImapWizard)
    await w.find('#imap-email').setValue('me@icloud.com')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect((w.find('#imap-host').element as HTMLInputElement).value).toBe('imap.mail.me.com')
    expect(w.text()).toContain('app-specific password')
    // every input has a label
    for (const input of w.findAll('input, select'))
      expect(w.find(`label[for="${input.attributes('id')}"]`).exists()).toBe(true)
    await w.find('#imap-password').setValue('pw')
    await w
      .findAll('button')
      .find((b) => b.text() === 'Test connection')!
      .trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Connection works.')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.emitted('added')).toBeTruthy()
    expect(calls).toEqual([
      'GET /api/accounts/discover',
      'POST /api/accounts/imap/test',
      'POST /api/accounts/imap',
    ])
  })

  it('shows a localized failure and keeps the password out of the DOM text', async () => {
    vi.stubGlobal('$fetch', async (url: string) => {
      if (url.includes('discover')) return { settings }
      throw { data: { error: { kind: 'auth', detail: { problem: 'invalid_credentials' } } } }
    })
    const w = mountIt(ImapWizard)
    await w.find('#imap-email').setValue('me@icloud.com')
    await w.find('form').trigger('submit')
    await flushPromises()
    await w.find('#imap-password').setValue('super-secret')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('not accepted')
    expect(w.html()).not.toContain('super-secret')
    expect(w.emitted('added')).toBeFalsy()
  })
})

describe('FolderPicker', () => {
  it('loads folders, preselects processed ones and saves the choice', async () => {
    const put = vi.fn()
    vi.stubGlobal('$fetch', async (_u: string, o?: { method?: string; body?: unknown }) => {
      if (o?.method === 'PUT') return put(o.body)
      return {
        folders: [
          { providerId: 'INBOX', name: 'Inbox', role: 'inbox', processed: true },
          { providerId: 'A', name: 'Archive', role: 'archive', processed: false },
        ],
      }
    })
    const w = mountIt(FolderPicker, { accountId: 'a1' })
    await flushPromises()
    const boxes = w.findAll('input[type=checkbox]')
    expect((boxes[0]!.element as HTMLInputElement).checked).toBe(true)
    await boxes[1]!.setValue(true)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(put).toHaveBeenCalledWith({ processed: ['INBOX', 'A'] })
    expect(w.emitted('saved')).toBeTruthy()
  })
})

describe('AdminConsentHelp', () => {
  it('explains the steps', () => {
    expect(mountIt(AdminConsentHelp).findAll('li')).toHaveLength(3)
  })
})
