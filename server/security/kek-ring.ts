import type { AppConfig } from '../config'
import type { KekRing } from './secret-store'

/** The key ring from configuration: the current key plus any older ones still needed to unwrap data keys. */
export const kekRing = (c: Pick<AppConfig, 'kek' | 'kekVersion' | 'kekPrevious'>): KekRing => ({
  current: { version: c.kekVersion, key: c.kek },
  previous: c.kekPrevious,
})
