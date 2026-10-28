export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss', '@nuxt/eslint', '@nuxtjs/i18n', 'nuxt-security'],
  security: {
    nonce: true,
    rateLimiter: false, // own limiter (server/middleware) so limits are per user and testable
    csrf: false, // own double-submit check (server/middleware)
    headers: {
      contentSecurityPolicy: {
        'default-src': ["'none'"],
        'script-src': ["'self'", "'nonce-{{nonce}}'", "'strict-dynamic'"],
        'style-src': ["'self'", "'unsafe-inline'"], // Tailwind/Vue inline styles; no script
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'manifest-src': ["'self'"],
        'worker-src': ["'self'"],
        'frame-src': ["'self'"], // sandboxed message iframe (T065)
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'base-uri': ["'none'"],
        'object-src': ["'none'"],
        'upgrade-insecure-requests': true,
      },
      strictTransportSecurity: { maxAge: 63072000, includeSubdomains: true, preload: true },
      xFrameOptions: 'DENY',
      referrerPolicy: 'same-origin',
      permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    },
  },
  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    langDir: 'locales',
    locales: [
      { code: 'en', language: 'en', file: 'en.json' },
      { code: 'en-XA', language: 'en', file: 'en-XA.json' },
    ],
    detectBrowserLanguage: false,
  },
  typescript: { strict: true, typeCheck: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Sentinel',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'theme-color', content: '#3949ab' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Sentinel' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ],
    },
  },
})
