// Transactional mail the service itself sends (password reset, security
// notices) over the operator's SMTP. It lives in the send module because it
// uses an SMTP transport, but it cannot send a user's mail: it has a fixed
// sender, takes no mailbox credentials, and offers only these methods.
import nodemailer from 'nodemailer'
import type { Mailer } from '../../auth/service'

export function createSystemMailer(opts: { smtpUrl: string; from: string }): Mailer {
  const transport = nodemailer.createTransport(opts.smtpUrl)
  return {
    async sendPasswordReset(to, link) {
      await transport.sendMail({
        from: opts.from,
        to,
        subject: 'Reset your Sentinel password',
        text: `Use this link within one hour to choose a new password:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
      })
    },
  }
}
