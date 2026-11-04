import withNuxt from './.nuxt/eslint.config.mjs'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'

export default withNuxt(
  { ignores: ['thunderbird/dist/**', 'tools/**', 'coverage/**'] },
  ...vueI18n.configs.recommended,
  {
    files: ['app/**/*.vue'],
    rules: {
      // No hard-coded UI strings: every visible text goes through $t().
      '@intlify/vue-i18n/no-raw-text': [
        'error',
        { ignoreNodes: ['v-icon', 'code'], ignorePattern: '^[-#:()&+=/\\s]+$' },
      ],
      '@intlify/vue-i18n/no-missing-keys': 'off',
      '@intlify/vue-i18n/no-unused-keys': 'off',
    },
  },
  {
    settings: {
      'vue-i18n': { localeDir: './i18n/locales/*.json', messageSyntaxVersion: '^11.0.0' },
    },
  },
  {
    files: ['thunderbird/**/*.js'],
    languageOptions: {
      globals: { browser: 'readonly', document: 'readonly', window: 'readonly', navigator: 'readonly', URL: 'readonly', Blob: 'readonly' },
    },
  },
)
