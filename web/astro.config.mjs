import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  integrations: [tailwind()],
  site: 'https://your-username.github.io',
  base: '/ahub',
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
  vite: {
    server: {
      fs: {
        // Allow serving files from the monorepo root (for community/posts/)
        allow: [resolve(__dirname, '..'), resolve(__dirname, '../community')],
      },
    },
  },
});
