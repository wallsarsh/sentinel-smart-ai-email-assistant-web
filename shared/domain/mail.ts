import { z } from 'zod'

export const emailAddress = z.object({ address: z.email(), name: z.string().optional() })
export type EmailAddress = z.infer<typeof emailAddress>

export const accountType = z.enum(['gmail', 'microsoft_graph', 'imap'])
export type AccountType = z.infer<typeof accountType>

export const accountStatus = z.enum(['active', 'needs_reauth', 'disabled'])
export type AccountStatus = z.infer<typeof accountStatus>

export const mailAccount = z.object({
  id: z.string(),
  type: accountType,
  email: z.email(),
  displayName: z.string(),
  status: accountStatus,
  aiExcluded: z.boolean().default(false),
})
export type MailAccount = z.infer<typeof mailAccount>

export const tlsMode = z.enum(['implicit_tls', 'start_tls'])
export const imapSettings = z.object({
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65535),
  imapSecurity: tlsMode,
  username: z.string().min(1),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecurity: tlsMode,
  smtpUsername: z.string().optional(),
  draftsFolder: z.string().optional(),
  sentFolder: z.string().optional(),
  serverSavesSent: z.boolean().default(false),
})
export type ImapSettings = z.infer<typeof imapSettings>

export const folderRole = z.enum(['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive', 'other'])
export type FolderRole = z.infer<typeof folderRole>
export const mailFolder = z.object({
  providerId: z.string(),
  name: z.string(),
  role: folderRole,
  processed: z.boolean().default(false),
})
export type MailFolder = z.infer<typeof mailFolder>

export const mailMessage = z.object({
  providerMessageId: z.string(),
  providerThreadId: z.string().nullable(),
  internetMessageId: z.string(),
  from: emailAddress,
  to: z.array(emailAddress),
  cc: z.array(emailAddress).default([]),
  subject: z.string(),
  sentAt: z.coerce.date(),
  receivedAt: z.coerce.date(),
  isRead: z.boolean(),
  bodyText: z.string().default(''),
  bodyHtml: z.string().nullable().default(null),
  attachmentNames: z.array(z.string()).default([]),
  references: z.array(z.string()).default([]),
  listUnsubscribe: z.string().nullable().default(null),
})
export type MailMessage = z.infer<typeof mailMessage>

/** Opaque per-provider sync cursor. */
export const syncCursor = z.record(z.string(), z.unknown())
export type SyncCursor = z.infer<typeof syncCursor>

export const changeSet = z.object({
  newOrUpdatedIds: z.array(z.string()),
  removedIds: z.array(z.string()),
  nextCursor: syncCursor,
  hasMore: z.boolean(),
})
export type ChangeSet = z.infer<typeof changeSet>
