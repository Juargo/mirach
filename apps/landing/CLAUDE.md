# apps/landing — Notas técnicas (gotchas)

Landing en Astro 100 % estático, workspace propio desplegado como proyecto Vercel
independiente bajo el dominio raíz `moneydiary.cl` (ADR-025).

## Tailwind 4 (CSS-first)

- La utility `rounded` a secas lee el token `--radius`. El nombre `--radius-DEFAULT`
  **se ignora en silencio**: `rounded` cae al fallback de 4px sin error de build.
  Al tocar tokens de `@theme`, verificar el mapping en el CSS de `dist/`.
- El header sticky exige `scroll-mt-*` en los targets de anchors
  (`#como-funciona`, `#main`), o el título queda tapado al saltar.

## Tipografía

DM Sans (cuerpo) + Plus Jakarta Sans (títulos) con tinta `#022030`. Es una
**excepción scoped** documentada en `DESIGN.md` — `apps/web` y `apps/mobile`
siguen en Inter. No propagar esta tipografía a las apps.
