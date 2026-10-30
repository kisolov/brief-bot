// Мок-адаптеры включаются при сборке или `nuxt dev` переменной NUXT_PUBLIC_EDITOR_MOCK=1.
// Флаг вшивается константой, поэтому в рабочей сборке мок и сид backend вырезаются.
const editorMock = process.env.NUXT_PUBLIC_EDITOR_MOCK === '1'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-30',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@pinia/nuxt'],
  css: ['~/assets/css/tokens.css', '@vue-flow/core/dist/style.css', '@vue-flow/core/dist/theme-default.css', '@vue-flow/minimap/dist/style.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Редактор бота',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&display=swap',
        },
      ],
    },
  },
  // Локально /api идёт на backend; в рабочей сборке его проксирует веб-сервер.
  nitro: { devProxy: { '/api': { target: 'http://localhost:8000/api', changeOrigin: true } } },
  vite: { define: { __EDITOR_MOCK__: JSON.stringify(editorMock) } },
})
