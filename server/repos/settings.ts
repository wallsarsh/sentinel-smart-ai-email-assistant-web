import { eq } from 'drizzle-orm'
import { settings } from '../db/schema'
import {
  defaultSettings,
  isSettingKey,
  settingsSchema,
  type SettingKey,
  type SettingValue,
} from '../../shared/settings'
import type { Scope } from './scope'

export const settingsRepo = (s: Scope) => {
  async function stored(): Promise<Record<string, unknown>> {
    const rows = await s.db.select().from(settings).where(eq(settings.userId, s.userId))
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  }
  return {
    /** All settings: stored values where valid, defaults elsewhere (corrupt rows fall back). */
    async all() {
      const out = defaultSettings() as Record<string, unknown>
      for (const [k, v] of Object.entries(await stored())) {
        if (!isSettingKey(k)) continue
        const r = settingsSchema[k].safeParse(v)
        if (r.success) out[k] = r.data
      }
      return out as ReturnType<typeof defaultSettings>
    },
    async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
      return (await this.all())[key] as SettingValue<K>
    },
    async setMany(values: Record<string, unknown>) {
      await s.db.transaction(async (tx) => {
        for (const [key, value] of Object.entries(values)) {
          await tx
            .insert(settings)
            .values({ userId: s.userId, key, value: value as never })
            .onConflictDoUpdate({
              target: [settings.userId, settings.key],
              set: { value: value as never },
            })
        }
      })
    },
  }
}
