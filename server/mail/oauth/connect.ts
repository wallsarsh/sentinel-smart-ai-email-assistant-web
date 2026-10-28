import type { Db } from '../../db/client'
import { forUser } from '../../repos'
import { secretStoreFor, type KekRing } from '../../security/secret-store'
import { oauthSecretName, type GoogleProfile, type OAuthTokens } from './google'
import type { MsProfile } from './microsoft'

/**
 * Creates (or re-activates) the Gmail account for a completed OAuth grant. The
 * token bundle goes only to the secret store; the accounts row holds none.
 */
export const saveGoogleAccount = (
  db: Db,
  ring: KekRing,
  userId: string,
  profile: GoogleProfile,
  tokens: OAuthTokens,
) => saveOAuthAccount(db, ring, userId, 'gmail', profile, tokens)

export const saveMicrosoftAccount = (
  db: Db,
  ring: KekRing,
  userId: string,
  profile: MsProfile,
  tokens: OAuthTokens,
) => saveOAuthAccount(db, ring, userId, 'microsoft_graph', profile, tokens)

async function saveOAuthAccount(
  db: Db,
  ring: KekRing,
  userId: string,
  type: 'gmail' | 'microsoft_graph',
  profile: { email: string; name: string },
  tokens: OAuthTokens,
) {
  const repos = forUser(db, userId)
  const existing = (await repos.accounts.list()).find((a) => a.email === profile.email)
  const account =
    existing ??
    (await repos.accounts.create({
      type,
      email: profile.email,
      displayName: profile.name || profile.email,
      color: type === 'gmail' ? 0xdb4437 : 0x0078d4,
    }))
  if (existing && existing.type !== type) throw new Error('account_type_mismatch')
  await secretStoreFor(db, userId, ring).put(oauthSecretName(account.id), JSON.stringify(tokens))
  if (existing) await repos.accounts.update(existing.id, { status: 'active' })
  return { account, created: !existing }
}

export async function loadTokens(
  db: Db,
  ring: KekRing,
  userId: string,
  accountId: string,
): Promise<OAuthTokens | null> {
  const raw = await secretStoreFor(db, userId, ring).get(oauthSecretName(accountId))
  return raw ? (JSON.parse(raw) as OAuthTokens) : null
}
