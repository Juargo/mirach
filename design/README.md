# Tokens de diseño

`tokens.json` es la fuente de color, tipografía, espaciado, radio y textos de bloque para las apps nativas de Mirach (iPhone y Android). Sus valores vienen de **Figma**: archivo [Mirach-UI](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=2-3), colección de variables «Mirach» (modos *Claro* y *Oscuro*) y sus estilos de texto de la app. Cada token dice en `$description` de qué variable de Figma sale.

**Regla.** Un cambio de color, espaciado o tipografía se hace primero en Figma y después aquí. Nunca al revés: si este archivo y Figma difieren, manda Figma.

## Formato y estructura

Formato W3C Design Tokens Community Group: cada hoja tiene `$value`, `$type` y `$description`. Claves JSON en inglés y `kebab-case`; los textos visibles (`copy`) están en español.

```text
color.light.<grupo>.<token>   modo Claro de Figma
color.dark.<grupo>.<token>    modo Oscuro de Figma
typography.font-family.sans, typography.figure-features, typography.text-style.*
spacing.{xs,s,m,l,xl}
radius.base
copy.bucket.*, copy.estado.*
```

Los dos temas definen exactamente los mismos nombres (lo verifica `pnpm design:check`).

## Roles de las apps y su variable de Figma

Las apps conservan sus nombres de rol; el valor de cada uno sale de esta variable (tabla aprobada el 26-10-2026):

| Rol en las apps | Variable de Figma |
|---|---|
| `base.background` | `color/fondo/base` |
| `base.card`, `base.accent` | `color/fondo/superficie` |
| `base.foreground`, `base.card-foreground`, `base.accent-foreground` | `color/texto/principal` |
| `base.muted-foreground` | `color/texto/secundario` |
| `base.primary` / `base.primary-foreground` | `color/accion/primario` / `color/accion/sobre-primario` |
| `base.destructive` | `color/estado/sobre` (el texto encima usa `primary-foreground`) |
| `base.border` / `base.input` | `color/borde/default` / `color/borde/fuerte` |
| `bucket.necesidades`, `bucket.gustos`, `bucket.ahorro` | `color/bloque/*` |
| `bucket.ahorro-text` | `color/texto/ahorro` |
| `estado.bien`, `estado.cerca`, `estado.sobre` | `color/estado/*` |
| `estado.bien-text`, `estado.cerca-text` | `color/texto/bien`, `color/texto/cerca` |
| `feedback.error-text` | `color/estado/sobre` |
| `feedback.success-text`, `ingreso.text` | `color/texto/bien` |
| `feedback.expense-text` | `color/texto/principal` (los gastos no van en rojo) |

## Cómo se actualiza

1. Cambiar la variable o el estilo en Figma, en los dos modos.
2. Copiar el valor nuevo a `tokens.json` (las variables se leen con la herramienta de Figma del agente o desde el panel de variables).
3. `pnpm design:check` (estructura y contraste).
4. Regenerar los recursos: `apps/ios/scripts/generate-tokens.sh` y `apps/android/scripts/generate-tokens.sh`. La CI falla si quedaron desactualizados.

## Cómo lo consumen las apps

Los generadores (`scripts/generate-ios-tokens.mjs`, `scripts/generate-android-tokens.mjs`) producen:

- iPhone: el catálogo de assets `Resources/Tokens.xcassets` (cada color con su variante oscura) y `Core/Design/GeneratedTokens.swift` (`Color.Mirach.*`, `MirachCopy`, `MirachFont`, `MirachRadius`, `MirachSpacing`).
- Android: `core/design/GeneratedTokens.kt` (`MirachPalettes.light` y `.dark`, `MirachCopy`, `MirachFont`, `MirachRadius`, `MirachSpacing`).

Las apps siguen el tema del sistema, claro u oscuro (VIS-16). No escriben colores ni etiquetas a mano: el texto de los bloques sale de `copy.bucket.*`. El API todavía nombra `Deseos` al bloque de Gustos; ese valor solo se usa para hablar con el API y como identificador de accesibilidad, nunca como texto visible.

La escala tipográfica (`typography.text-style.*`) todavía no se genera, y las apps usan la fuente del sistema hasta que se empaquete Inter (decisión D2).

## Reglas que los tokens no pueden expresar

- **El color nunca va solo.** Cada bloque lleva su nombre y cada estado su palabra y su marca cuadrada (VIS-02).
- **Los rellenos de bloque no son texto.** `bucket.*` se usa como relleno; el texto usa `foreground`, `muted-foreground` o los roles `*-text`.
- **Cifras tabulares.** Montos, fechas y conteos usan `figure-features` = `tnum` (`mirachFigures()` en las dos apps).
- **Esquinas cuadradas y sin sombras.**

## Contraste

`pnpm design:check` mide la razón de contraste WCAG 2.x de 41 pares por tema: 4,5:1 para texto y 3:1 para elementos gráficos (bordes de controles, rellenos de bloque y marcas de estado sobre las dos superficies).

Excepción conocida, reportada al dueño del diseño y sin cambiar aquí:

| Par | Tema | Razón | Mínimo |
|---|---|---|---|
| Etiqueta del gráfico (`base.background`) sobre `bucket.ahorro` | claro | 3,51 | 4,5 |

## Historia

Hasta el 26-10-2026 este archivo copiaba la paleta web de MoneyDiary («Clínico frío» y «Tinta cálida», con Geist Mono para las cifras). Se reemplazó por los valores de Figma (decisiones D2 y D7 en `odd/tasks/normalizacion-fuentes.md`).
