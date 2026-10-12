---
tags:
  - adr
  - fase-diseño
  - mobile
  - ios
  - android
proyecto: Mirach
estado: ✅ Decidido
fecha_creacion: 2026-10-12
fecha_actualizacion: 2026-10-12
---

# ADR-053 — Paridad visual entre iOS y Android

## Estado

✅ **Decidido** (2026-10-12, product owner). Elegido el nivel B ("paridad de marca") entre tres niveles de
paridad visual. Pendiente de implementar en ambas apps.

## Contexto

Al probar la primera versión de Android en un teléfono real, el dueño del producto notó que se ve distinta
de la app de iPhone. Las dos apps comparten hoy `design/tokens.json`, que genera para cada plataforma los
colores (claro y oscuro), el radio de las esquinas (sistema cuadrado, 0 px), los nombres de las familias
tipográficas y los textos. Las diferencias vienen de lo que **no** se comparte:

- **Tipografía.** Los tokens nombran Inter (lectura) y Geist Mono (todas las cifras, fechas y montos,
  DESIGN.md), pero ninguna app las empaqueta (`GeneratedTokens.swift`: "Fonts are not bundled yet"). iOS
  cae en SF Pro y Android en Roboto, con métricas y anchos distintos.
- **Escala tipográfica.** iOS usa los estilos de texto del sistema (`.headline`, `.footnote`, etc.) y
  Android la escala de Material 3. Los tokens no definen tamaños ni pesos.
- **Espaciado.** No está en los tokens; cada app fija sus propios márgenes y separaciones.
- **Componentes.** iOS usa componentes nativos de SwiftUI y Android usa Material 3 (ADR-052, D1), con
  formas cuadradas por los tokens pero con alturas, rellenos y estados propios de cada sistema.

Se consideraron tres niveles de paridad:

| Nivel | Qué queda igual | Costo |
|---|---|---|
| A. Solo tokens (situación actual) | colores, radios, textos | ninguno |
| B. Paridad de marca | A + tipografía empaquetada, escala y espaciado en tokens, componentes propios para lo que identifica a Mirach | moderado e incremental |
| C. Paridad de píxel | todo | alto: rehacer cada componente nativo o migrar iOS a una UI compartida |

## Decisión

1. **Paridad de marca (nivel B).** Lo que identifica a Mirach se ve igual en ambas plataformas; el
   *chrome* del sistema sigue siendo nativo.
2. **Tipografía empaquetada.** Ambas apps incluyen Inter y Geist Mono (licencia SIL Open Font License 1.1)
   como recursos, en lugar de caer en la fuente del sistema. Las cifras usan siempre números tabulares
   (`figure-features: tnum`, ya en los tokens). Se respeta el tamaño de texto que elige la persona
   (Dynamic Type en iOS, escala de fuente en Android).
3. **Escala tipográfica y espaciado en `design/tokens.json`.** Se agregan una escala con nombre (por
   ejemplo `title`, `body`, `caption`, `figure-lg`) con tamaño, peso e interlineado, y una escala de
   espaciado. Los generadores de cada plataforma las emiten igual que los colores, y CI falla si el código
   generado queda desactualizado (mismo control que hoy).
4. **Componentes de marca compartidos por especificación.** Los elementos que definen la identidad se
   implementan como componentes propios en cada app, con la misma anatomía y los mismos tokens:
   - montos y cifras (formato `es-CL`, mono tabular, color por signo);
   - tarjeta de bucket con su barra 50/30/20;
   - filas de movimientos y de cartolas;
   - botones primario y secundario;
   - estados vacío, de carga y de error.

   La anatomía de cada uno (partes, tokens que usa, estados) se describe una sola vez en `DESIGN.md`, y
   ambas implementaciones la siguen.
5. **Chrome nativo.** Barra superior, navegación inferior, gesto o botón atrás, hojas modales, diálogos
   del sistema, selectores de fecha y menús siguen las convenciones de cada plataforma (SwiftUI en iOS,
   Material 3 en Android), tematizados con los tokens.
6. **Material 3 se mantiene como base en Android** (ADR-052, D1). Esta decisión la acota: los componentes
   de marca no usan los de Material tal cual y los demás se tematizan con los tokens.

## Consecuencias

- Las dos apps se reconocen como el mismo producto: misma tipografía, mismas cifras, mismas tarjetas y
  barras, mismos colores. Una persona de Android sigue encontrando el comportamiento que espera de su
  sistema.
- Las apps crecen en tamaño por las fuentes empaquetadas (del orden de cientos de KB por familia variable).
- Agregar un componente de marca nuevo exige describirlo en `DESIGN.md` e implementarlo en ambas apps.
- La escala tipográfica y el espaciado dejan de decidirse pantalla por pantalla, y las pantallas
  existentes de iOS deben migrar a esos tokens. Esa migración también toca la app que ya está en revisión,
  por lo que se hace en una versión posterior y no bloquea la primera publicación de ninguna de las dos.
- La paridad visual exacta (nivel C) queda descartada: capturas lado a lado mostrarán diferencias en el
  chrome, y son esperadas.

## Alternativas consideradas

- **Nivel A, quedarse como está.** Cero costo, pero las apps se ven como productos "primos": la tipografía
  sola cambia el carácter de la interfaz, y DESIGN.md exige mono tabular para las cifras.
- **Nivel C con componentes propios en ambas plataformas.** Exige rehacer a mano navegación, hojas,
  selectores y accesibilidad que el sistema ya resuelve, y pelea con las convenciones de cada plataforma.
- **Nivel C con una UI compartida (Compose Multiplatform, Flutter o React Native).** Daría un solo
  código de interfaz, pero obliga a reescribir la app de iPhone que ya está en revisión y contradice la
  decisión de apps nativas (ADR-046, D1 y D8).
