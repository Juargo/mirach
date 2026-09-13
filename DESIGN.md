# Design System: Clínico frío / Tinta cálida

## Overview
**Creative North Star: "Precisión legible"**
Un dashboard financiero denso y estructurado que se comporta como un instrumento de precisión, sin castigar la vista. Tiene dos identidades medidas y el usuario elige entre claro, oscuro o seguir al sistema (ADR-043).

| Identidad | Tema | Fondo | Tarjeta | Tinta | Acento |
|---|---|---|---|---|---|
| Clínico frío | claro (`:root`) | `#EDF0F5` | `#F9FAFC` | `#2A2F3A` | `#1D5FA8` |
| Tinta cálida | oscuro (`.dark`) | `#1A1917` | `#22211E` | `#D5D0C6` | `#6FB8BE` |

**Key Characteristics:**
- Ninguna de las dos identidades usa extremos: no hay tarjeta blanca pura ni tinta casi negra en claro, ni neón sobre negro en oscuro. Tinta cálida mantiene acentos de bajo croma.
- Todo color es un token con valor en `:root` y en `.dark`; ningún componente decide un color según el tema. Los valores y sus ratios viven en `openspec/changes/web-theme-switch/palette-measurements.md`.
- Contraste mínimo en ambos temas: WCAG 2.2 AA (texto 4.5:1, elementos no textuales 3:1), verificado por `apps/web/src/test/contraste-tokens.test.ts`.
- Tipografía dual: Inter (sans-serif) para lectura y etiquetas, y Geist Mono / JetBrains Mono (o `tabular-nums`) obligatoria para TODAS las cifras, fechas y montos.
- Bordes de 1px nítidos en lugar de contenedores flotantes, sin sombras (`shadow-none`).
- Radios de esquina: cuadrados o mínimos (`--radius: 0` o `2px`).

## Color semántico
- **Buckets (paleta Brote):** Necesidades azul acero (estructura), Deseos ciruela (placer), Ahorro jade (crecimiento, el bucket más saliente). Sin categoría es un neutro. Nunca se usan como texto.
- **Semáforo, ingreso y avisos:** relleno tenue + tinta del mismo matiz (verde saludable, ámbar atención, rojo peligro). La tinta nunca se usa como relleno de chip.
- **Error vs. destructivo:** el texto de error usa `error-foreground`; `destructive` es solo relleno o borde (con texto blanco encima).
- El jade de Ahorro y el verde de ingresos nunca van juntos dentro de un mismo conjunto de categorías.
- **El color nunca va solo:** en oscuro, Sin categoría y Deseos quedan en la banda de separación para daltonismo 6–8 ΔE (legal solo con codificación secundaria). Todo bucket lleva etiqueta o fila de leyenda; no quitar esa codificación sin volver a medir la paleta.
