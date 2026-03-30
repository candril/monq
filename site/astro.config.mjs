import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://candril.github.io',
  base: '/monq',
  integrations: [
    starlight({
      title: 'monq',
      description: 'Terminal-based MongoDB browser and query tool. Keyboard-first, zero config.',
      logo: {
        src: './src/assets/logo.png',
      },
      favicon: '/logo.png',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/candril/monq',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/candril/monq/edit/main/site/',
      },
      sidebar: [
        {
          label: 'Guide',
          items: [
            { label: 'Installation', slug: 'guide/installation' },
            { label: 'Usage', slug: 'guide/usage' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Query Syntax', slug: 'reference/query-syntax' },
            { label: 'Key Bindings', slug: 'reference/key-bindings' },
            { label: 'Pipeline Editor', slug: 'reference/pipeline' },
            { label: 'Configuration', slug: 'reference/configuration' },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
})
