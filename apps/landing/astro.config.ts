import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
//
// Astro 7 — migrado desde 5.18.2 el 2026-09-04 (PR #569). Dos comportamientos
// del pipeline que NO fallan el build y conviene tener presentes al editar:
//
// 1. El compilador Rust normaliza `@supports A or B` y descarta la rama `or`;
//    el minificador de CSS después descarta la declaración sin prefijo. La
//    combinación puede dejar un guard sin prefijo con un cuerpo solo prefijado,
//    que Firefox atiende y luego ignora. Ver el comentario en
//    `src/components/Header.astro`: su regla va en DOS bloques `@supports`
//    separados justamente por esto, y no hay que reunirlos.
// 2. `compressHTML` cambió su default de `true` a `'jsx'`: el whitespace se
//    recorta con reglas JSX, no HTML.
export default defineConfig({
  site: 'https://moneydiary.cl',
  output: 'static',
  integrations: [sitemap()],
  vite: {
    plugins: tailwindcss() as any,
  },
});
