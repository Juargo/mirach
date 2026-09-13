---
tags:
  - adr
  - fase-diseño
  - frontend
  - accesibilidad
  - ux
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-09-12
fecha_actualizacion: 2026-09-12
---

# ADR-043 — Tema claro/oscuro en `apps/web`: Clínico frío / Tinta cálida

## Estado

✅ **Decidido** (change SDD `web-theme-switch`, 11 PRs encadenados en Feature Branch
Chain). Este documento cubre la decisión completa; PR1 entrega únicamente este ADR y
los índices — el mecanismo (`:root`/`.dark`, store, script de pre-pintado) y los
valores medidos de cada identidad llegan en PR2-PR11.

---

## Contexto

`apps/web` tenía una única identidad visual fija, "Tecno-Analítico", declarada como
oscura por defecto en `apps/web/src/index.css` (docstring: *"dark is the ONLY
theme"*). No existía forma de elegir claro, ni de seguir el esquema del sistema
operativo. El tema es un asunto de presentación, no de dato de dominio (ADR-024), así
que no requiere cambio de API ni de `User`.

`web-theme-switch` reemplaza esa identidad única por dos identidades medidas y
nombradas — **Clínico frío** (`:root`, claro) y **Tinta cálida** (`.dark`, oscuro) —
y agrega un selector tri-estado (`light`/`dark`/`system`) con persistencia local y
sincronización entre pestañas. "Tecno-Analítico" y "Serene Finance" (la identidad
clara anterior, pineada en `web-app` DCR-04/05) quedan retiradas; ningún nombre de
identidad anterior sobrevive a este ADR.

## Decisión

### Mecanismo: una clase en `<html>`, cero lectura de tema en componentes

Cada color que pinta `apps/web` es un token CSS con un valor en `:root` (Clínico
frío) y otro en `.dark` (Tinta cálida). Cambiar de tema es alternar una clase en
`<html>`; ningún componente lee el estado del tema para elegir un color, incluidos
los rellenos de bucket, las etiquetas sobre las porciones del pie y el separador de
las porciones (D3).

### D1 — Los tokens de `--color-*` se quedan en `@theme`, con el valor claro por defecto

Los tokens `--color-*` de dominio (buckets, semáforo, ingreso, etc.) permanecen
declarados en `@theme`, con el valor de **Clínico frío** como default. Las variables
crudas de shadcn se quedan en `:root` detrás de `@theme inline`. Un único bloque
`.dark {}` sin capa (`@layer`) sobreescribe ambas familias. `@theme` conserva las
fuentes; `--radius` se queda invariante por tema en `:root`.

**Alternativas descartadas:** mover cada token a `:root` detrás de `@theme inline`
(hubiera movido ~160 líneas de tokens ya documentados sin necesidad); un atributo
`data-theme`.

**Razón:** las utilidades de Tailwind 4 para tokens de `@theme` ya emiten
`var(--color-x)`, así que una sobreescritura en runtime funciona sin mover el bloque
completo. `.dark` ya coincide con el `@custom-variant` declarado.

### D2 — `color-scheme` por tema, reforzado en runtime

`color-scheme: light` en `:root`, `color-scheme: dark` en `.dark`. El script de
pre-pintado y el controlador de tema también fijan `documentElement.style.colorScheme`
para que la UA aplique el tema antes del primer pintado (WT-04). La regla de
`select`/`option` no cambia: lee `var(--card)`, así que se ajusta sola.

### D3 — Etiquetas del pie y separador como tokens CSS, no como función parametrizada por tema

Las etiquetas sobre las porciones del pie y el separador se convierten en **tokens
CSS**, no en la función `colorEtiquetaPie(bucket, theme)` que proponía `proposal.md`.
Los consumidores usan mapas de clases estáticos (`fill-ahorro`, `bg-ahorro`,
`fill-pie-etiqueta-ahorro`, `stroke-pie-separador`).

**Alternativa descartada:** la función parametrizada por tema del proposal;
`style={{ fill: 'var(...)' }}` inline.

**Razón — desviación explícita respecto al proposal, registrada aquí:** con tokens,
el relleno, la etiqueta y el trazo cambian juntos en el mismo bloque CSS, así que una
paleta a medio aplicar no puede existir, y los componentes de pie se quedan
agnósticos de tema. El argumento original de "deben ser literales" asumía rellenos
que nunca seguían el tema; un token dedicado por tema no es un alias de `--card`. Las
aserciones de clase funcionan en jsdom; `var()` dentro de un `style` inline no es
confiable ahí.

### D4 — Store externo con `useSyncExternalStore`, no Zustand

Una factory `crearControladorTema(entorno)`, una instancia global, y un contexto de
React cuyo **valor por defecto** es esa instancia. No hace falta montar un provider;
los tests inyectan un fake.

**Alternativas descartadas:** Zustand; un provider obligatorio; `matchMedia` por
componente.

**Razón:** el store debe seguir al sistema operativo incluso sin ningún toggle
montado (p. ej. `/login`). Una factory con `storage`/`matchMedia`/`document`
inyectados es completamente testeable en jsdom.

### D5 — Script inline clásico en `<head>`, no un archivo externo

Un `<script>` clásico (no de módulo) inline en `<head>` de `index.html`, que espeja
`lib/tema.ts`; un test de paridad extrae el script del HTML y lo corre contra el
módulo.

**Alternativas descartadas:** script externo en `public/`; un plugin de Vite que
genere el script.

**Razón:** no existe CSP hoy (`vercel.json` no tiene `headers`; no hay CSP en ningún
lugar de `apps/web`). Inline no agrega una request adicional que bloquee el
renderizado.

**Disparador a futuro:** si alguna vez se agrega una CSP, el script debe permitirse
por su hash `sha256` — no reescribirlo como archivo externo salvo que la CSP lo
exija explícitamente.

### D6 — El texto de error se separa del relleno `--destructive`

Nuevo token `--color-error-foreground`; los 34 usos de `text-destructive` (19
archivos) más `BucketDetalleMesPage.tsx:156` (`text-red-600`) migran a él.
`--destructive` se queda como token de relleno/borde únicamente, con texto blanco
encima.

**Alternativas descartadas:** un solo token destructivo; redefinir `--destructive`
como el color de texto.

**Razón:** en oscuro, ningún valor único sirve para ambos roles. El texto blanco
sobre el relleno necesita luminancia L≤0.183; el texto sobre la tarjeta necesita
L≥0.244. Aritmética de diseño: `#E11D48` sobre `#22211E` da 3.43:1 y `#BE4E43` da
~3.34:1, ambos bajo 4.5:1 — esta falla AA ya existe hoy (≈3.95:1 sobre la tarjeta
actual). Mantiene el significado de `destructive` de shadcn; espeja el patrón ya
existente de `exito-foreground`.

### D7 — Se retiran las variantes `dark:` de `button.tsx` y `badge.tsx`

Se conserva la declaración de `@custom-variant dark`, pero se eliminan las
variantes `dark:` de `ui/button.tsx` y `ui/badge.tsx`.

**Alternativas descartadas:** conservarlas; re-medir sus mezclas alfa.

**Razón:** codificaban ajustes de la paleta slate de shadcn (`bg-destructive/60`,
`bg-input/30`) que nadie había medido. Quitarlas conserva lo que hoy renderiza
oscuro, y mantiene las clases de los componentes idénticas entre temas (`web-app`
DCR-07).

### D8 — Un único componente `SelectorTema` con radios nativos

`SelectorTema` se construye con radios nativos (`fieldset` + `legend`). Tiene una
variante `compacto`: tres radios de icono de 32px (Sol/Luna/Monitor, etiquetas
visualmente ocultas). Cada instancia toma su `name` de `useId()`.

**Alternativas descartadas:** un botón cíclico (el siguiente estado es opaco); un
menú de Radix.

**Razón:** los radios nativos dan navegación por flechas y anuncio de
estado-marcado gratis (WT-06, ADR-018). Un `name` por instancia evita que el grupo
del Sidebar y el de Perfil se fusionen en uno solo en escritorio.

### D9 — `Apariencia` es su propio bloque en Perfil

En Perfil, `Apariencia` es su **propio** `SeccionConfig`, en el orden: Editar perfil
→ Cuenta de Google → **Apariencia** → Sesión. Descripción: "Se aplica al instante en
este dispositivo."

**Alternativa descartada:** ponerlo dentro de `PerfilForm`.

**Razón:** el tema se aplica al instante y no lo envía `Guardar cambios`. Las
secciones con alcance de cuenta van primero; las de alcance de dispositivo
(Apariencia, Sesión) cierran la página.

### D10 — El atajo del Sidebar se inyecta por el slot existente

El atajo del Sidebar se inyecta a través del `sidebarFooter` ya existente en
`_authenticated.tsx`. `Sidebar.tsx` no se toca.

**Alternativa descartada:** cambiar las props de `Sidebar`.

**Razón:** sigue el precedente que ya sentaron `ApiVersionBadge` y el botón de
logout.

### Tri-estado, default de sistema y persistencia solo local

- Preferencia tri-estado: `light` / `dark` / `system`. Primera visita = `system`;
  los cambios de OS en vivo se siguen mientras la preferencia sea `system`.
- Persistencia en `localStorage` únicamente — sin columna en `User`, sin cambio de
  API. Sincronización entre pestañas vía el evento `storage`.
- **Sincronización entre dispositivos queda fuera de alcance** (deuda diferida,
  ver más abajo).

## Alcanza (Supersedes) — exactamente las cláusulas listadas, nada más

Siguiendo el patrón de scoped-supersede de ADR-038/039/040/042 (el ADR viejo no se
edita; la relación se declara acá):

- **`web-app` DCR-04.** La cláusula que pineaba `--background` al literal exacto
  `#e8f0fa` ("Serene Finance") se enmienda: el valor de `:root` pasa a ser el de
  Clínico frío, medido en fase de diseño. La obligación de que `--background` venga
  del bloque de tema (no de un literal hardcodeado) sigue vigente sin cambios.
- **`web-app` DCR-05.** Misma enmienda para `--primary`: el literal `#2260b2` se
  reemplaza por el valor de Clínico frío. La obligación de que los componentes lo
  reflejen sin cambios a nivel de componente sigue vigente.
- **`web-app` DCR-06.** Las tres razones fijas (6.78:1, 6.21:1, 5.40:1) contra la
  única identidad clara anterior se generalizan a una obligación de umbral por tema:
  todo par de color debe cumplir AA (texto ≥4.5:1, no-texto ≥3:1) evaluado contra
  las superficies propias de cada tema.
- **`web-app` DCR-07.** La afirmación "solo cambian los tokens de `:root` en modo
  claro" / "el tema `.dark` debe seguir renderizando sin regresión" se enmienda:
  oscuro deja de ser una identidad no tocada y pasa a ser, él mismo, la identidad
  que cambia (Tecno-Analítico → Tinta cálida).

**No enmienda** (para que el próximo lector no tenga que re-derivarlo): ADR-005 (el
dominio y la aplicación siguen sin conocer color ni tema); ADR-008 (la elección de
Tailwind/shadcn no cambia, solo cómo se declaran sus tokens); ADR-024 (el tema sigue
siendo presentación, no dato de dominio — cero cambio de API); ADR-018 (esta
decisión implementa, no reemplaza, la pila de accesibilidad por capas — `SelectorTema`
se verifica con `vitest-axe` en ambas variantes, como exige esa ADR).

## Consecuencias

- **Dos nombres de identidad nuevos, dos retirados.** "Clínico frío" (claro) y
  "Tinta cálida" (oscuro) reemplazan a "Tecno-Analítico" (única identidad, oscura
  por defecto) y a "Serene Finance" (identidad clara previa, nunca implementada más
  allá de dos tokens pineados en `web-app`). `DESIGN.md` se reescribe para
  documentar ambas identidades (PR8, S5).
- **`resumen-view-model` se queda libre de color** (WT-09): ningún import de
  `bucket-colors`, `pie-colors` ni del hook de tema desde ese módulo — verificado
  por un test dedicado de imports.
- **34 usos de `text-destructive` (19 archivos) más `BucketDetalleMesPage.tsx:156`
  migran a `text-error-foreground`** (D6, PR5) — el relleno/borde `--destructive`
  no cambia de significado.
- **Se retiran las variantes `dark:` de `button.tsx`/`badge.tsx`** (D7, PR6) — sin
  cambio de clases entre temas.
- **Ningún dato de tema cruza al backend** (ADR-024): la preferencia vive solo en
  `localStorage` del navegador; `apps/api` no gana columna, endpoint ni cambio de
  contrato.

### Deuda diferida explícita

- **Sincronización entre dispositivos.** Hoy la preferencia es puramente local
  (`localStorage`, sin `User.tema` ni endpoint). **Disparador:** si un usuario pide
  que su elección de tema viaje entre sus dispositivos, esto requiere una columna en
  `User`, un endpoint de escritura y su propio ADR — no se resuelve implícitamente
  agregando una llamada a la API sobre este mecanismo.
- **CSP para el script de pre-pintado.** No existe CSP hoy en `apps/web` (D5).
  **Disparador:** si se agrega una CSP en el futuro, el script inline debe
  permitirse por su hash `sha256`, calculado sobre el contenido exacto del
  `<script>` en `index.html` — nunca aflojando la CSP con `unsafe-inline`.

## No incluido en este ADR

- **Los valores medidos de cada identidad** (Token Table completa, ratios de
  contraste) — viven en `openspec/changes/web-theme-switch/design.md` y
  `palette-measurements.md`, y se aplican en PR6 (Tinta cálida) y PR7 (Clínico
  frío) de la cadena.
- **El store en runtime, el script de pre-pintado y `SelectorTema`** — PR9-PR11
  (S6-S7b), incluida la ventana en la que el tema queda forzado a oscuro
  (`TEMA_FORZADO='dark'`) mientras el mecanismo se construye sin exponer un
  selector inconsistente.

## Referencias

- ADR-024 — Arquitectura de clientes: el tema es presentación, nunca dato de
  dominio; cero cambio de API
- ADR-005 — Clean Architecture: `resumen-view-model` se queda sin importar color
  ni tema (WT-09)
- ADR-008 — Frontend Stack: Tailwind 4 + shadcn/ui; esta decisión cambia dónde
  viven los tokens, no la elección de stack
- ADR-018 — Testing de accesibilidad: `SelectorTema` se verifica con
  `vitest-axe` en ambas variantes; los radios nativos dan navegación por teclado
  y anuncio de estado sin código adicional
- ADR-038/039/040/042 — precedente de scoped-supersede seguido acá (el ADR viejo
  no se edita)
- `web-app` DCR-04/05/06/07 — las cláusulas enmendadas por este ADR
- `web-theme` (nueva capability, WT-01..09) — especificación completa del
  comportamiento de tema

---

*Fecha de decisión: 2026-09-12 — change SDD `web-theme-switch`, PR1 (este ADR + índices).
PR2-PR4 migran los tokens de bucket/pie a clases sin cambio visual; PR5 separa
`error-foreground`; PR6 aplica Tinta cálida en `.dark`; PR7 aplica Clínico frío en
`:root`; PR8 reescribe `DESIGN.md`; PR9 agrega el store y el script de pre-pintado
(tema forzado a oscuro); PR10-PR11 exponen `SelectorTema` y desbloquean el
selector.*
