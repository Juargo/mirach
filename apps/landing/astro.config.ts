import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://moneydiary.cl',
  output: 'static',
  integrations: [sitemap()],
  vite: {
    plugins: tailwindcss() as any,
  },
});
