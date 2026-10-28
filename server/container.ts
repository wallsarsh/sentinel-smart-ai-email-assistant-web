// DI root: wires services from configuration. One of the two places (with
// server/api/send/) allowed to import the send module.
import { authService } from './auth/service'
import { useConfig } from './config'
import { createDb, type Db } from './db/client'
import { createSystemMailer } from './mail/send/system-mailer'

let db: Db | undefined
let auth: ReturnType<typeof authService> | undefined

export function useDb(): Db {
  return (db ??= createDb(useConfig().databaseUrl).db)
}

export function useAuth() {
  const c = useConfig()
  return (auth ??= authService({
    db: useDb(),
    baseUrl: c.baseUrl,
    mailer: createSystemMailer({ smtpUrl: c.systemMail.smtpUrl, from: c.systemMail.from }),
  }))
}
