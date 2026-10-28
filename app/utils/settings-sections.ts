export type SettingsSection = { to: string; key: string }

/** The settings hub, in the order shown. Every `to` is a page (checked by a test). */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { to: '/settings/accounts', key: 'accounts' },
  { to: '/settings/profile', key: 'profile' },
  { to: '/settings/ai', key: 'ai' },
  { to: '/settings/usage', key: 'usage' },
  { to: '/settings/senders', key: 'senders' },
  { to: '/settings/sending', key: 'sending' },
  { to: '/settings/background', key: 'background' },
  { to: '/settings/privacy', key: 'privacy' },
]
