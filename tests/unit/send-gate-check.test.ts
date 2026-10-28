import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
// @ts-expect-error plain JS tool
import { check } from '../../tools/send-gate-check.mjs'

function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'gate-'))
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true })
    writeFileSync(join(root, p), c)
  }
  return root
}

describe('send-gate check', () => {
  it('passes a clean project and sends only inside the send module', () => {
    const root = project({
      'server/mail/send/smtp.ts': "import nodemailer from 'nodemailer'\nawait t.sendMail(x)",
      'server/api/send/confirm.post.ts':
        "import { gate } from '../../mail/send/send-gate'\nexport default 1",
      'server/container.ts': "import { x } from './mail/send/senders'",
      'server/ai/router.ts': 'export const a = 1',
    })
    expect(check(root)).toEqual([])
  })

  it('flags send primitives outside the send module', () => {
    const root = project({
      'server/mail/gmail/x.ts': "fetch('/gmail/v1/users/me/drafts/send')",
      'server/api/y.ts': 'await transport.sendMail(m)',
      'app/z.ts': "const s = 'MAIL FROM:<a@b>'",
    })
    const files = new Set(check(root).map((v: string) => v.split(' -> ')[1].split(':')[0]))
    expect(files.size).toBe(3)
  })

  it('flags imports of the send module from other places', () => {
    const root = project({
      'server/api/inbox/list.get.ts': "import { send } from '../../mail/send/senders'",
    })
    expect(check(root)[0]).toMatch(/forbidden place/)
  })

  it('flags send types in AI, jobs, worker, triage, brief, sync and push code', () => {
    const root = project({
      'server/ai/a.ts': 'type X = MailSender',
      'worker/c.ts': 'const g: SendGate = 1',
      'server/jobs/j.ts': 'SendAuthorization',
      'server/push/p.ts': 'MailSender',
    })
    expect(check(root)).toHaveLength(4)
  })

  it('honours the allowlist by exact line', () => {
    const root = project({ 'server/ai/a.ts': 'type X = MailSender' })
    const [v] = check(root)
    const hit = v.split(' -> ')[1]
    expect(check(root, [hit])).toEqual([])
  })

  it('the real repository passes', () => {
    expect(check('.')).toEqual([])
  })
})
