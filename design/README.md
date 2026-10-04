# Tokens de diseño

`tokens.json` es la fuente única de color, tipografía, radio y textos de bucket para las apps nativas de Mirach (iPhone primero, Android después). Los valores se copiaron tal cual de la paleta web de MoneyDiary (`apps/web/src/index.css` y `DESIGN.md`), que es la fuente decidida (ver [`odd/tasks/contrato-referencia.md`](../odd/tasks/contrato-referencia.md)). Cada token trae en `$description` el archivo y la variable de origen.

## Formato y estructura

Formato W3C Design Tokens Community Group: cada hoja tiene `$value`, `$type` y `$description`. Convención de nombres: claves JSON en inglés y `kebab-case`; los textos visibles (`copy`) están en español.

```text
color.light.<grupo>.<token>   Clínico frío (web :root)
color.dark.<grupo>.<token>    Tinta cálida (web .dark)
typography.font-family.{sans,mono}, typography.figure-features
radius.{base,max-allowed}
copy.bucket.*, copy.semaforo.*
```

Los dos temas definen exactamente los mismos nombres (lo verifica el script). Grupos de color:

| Grupo | Contenido | Tokens por tema |
|---|---|---|
| `base` | background, foreground, card, popover, primary, secondary, muted, accent (cada uno con su `-foreground` cuando existe), destructive, border, input, ring | 18 |
| `bucket` | necesidades, deseos, ahorro, exceso, sin-categoria (solo relleno) | 5 |
| `pie` | etiquetas sobre cada cuña y separador | 5 |
| `ingreso` | `fill` y `text` | 2 |
| `semaforo` | verde, amarillo, rojo: `-fill`, `-ink`, `-band`; más `sin-datos-ink` | 10 |
| `feedback` | aviso (warning), éxito, cargo, error, vínculo activo | 9 |

Total: 111 hojas (49 por tema, 13 comunes). `deseos` es el nombre del token; la variable web se llama `--color-gustos`.

Reglas de nombre: `fill` es relleno, `ink` es el texto que va sobre ese relleno, `band` es una marca no textual (banda de zona), `text` es texto que va directo sobre la tarjeta.

## Qué no tiene valor web

- **Sin datos.** La web no define colores propios: reutiliza `muted-foreground` como tinta y un velo del 15 % de esa misma tinta como relleno y filete (`apps/web/src/lib/semaforo-estilos.ts`, `SIN_DATOS`). Solo existe `semaforo.sin-datos-ink` (igual a `muted-foreground`); no se inventó relleno ni banda. Las apps derivan el velo.
- **Escala tipográfica.** Ni `DESIGN.md` ni `index.css` definen tamaños; la web usa las utilidades por defecto de Tailwind. No hay tokens de tamaño.
- **Espaciado.** No hay tokens de espaciado propios (Tailwind por defecto), así que no se incluyen.
- **Radio.** `radius.base` es `0px`, el valor de la web. `DESIGN.md` permite hasta 2px (`radius.max-allowed`, solo como límite).
- **Texto sobre `destructive`.** La web no tiene token `destructive-foreground`: usa blanco (`#ffffff`), que el script comprueba como literal.

## Cómo lo consumirán las apps

En la fase 7 del plan se generarán, a partir de este archivo, un catálogo de assets de Xcode y constantes Swift para iOS, y recursos (`colors.xml`, y tema de Compose) para Android. Hoy no se genera nada: este directorio solo fija la fuente y su validación. Las apps no deben escribir colores ni etiquetas a mano; el texto de los buckets sale de `copy.bucket.*` para no repetir «Gustos».

## Reglas que los tokens no pueden expresar

Vienen de [`DESIGN.md`](../DESIGN.md):

- **El color nunca va solo.** Cada bucket lleva etiqueta o fila de leyenda; el semáforo lleva palabra o glifo. En oscuro, `sin-categoria` y `deseos` quedan en la banda de separación para daltonismo (6–8 ΔE), legal solo con codificación secundaria.
- **Los rellenos de bucket no son texto.** Solo se usan como relleno, punto o cuña. El texto usa los tonos `foreground`, `ink` o `text`.
- **«Precisión de Terminal».** Toda cifra, fecha y monto va en `typography.font-family.mono` con números tabulares (`typography.figure-features` = `tnum`). El token elige la familia, no alinea por sí solo.
- **Claro y oscuro.** Ningún componente decide un color según el tema: cada token tiene valor en ambos. El usuario elige claro, oscuro o sistema.
- **Sin sombras, bordes de 1px nítidos, radio cuadrado.**
- **Error y destructivo.** El texto de error usa `feedback.error-text`; `base.destructive` es solo relleno o borde, con texto blanco encima.
- **Terminología.** El bucket del 30 % es «Deseos».

## Contraste

`pnpm design:check` calcula la razón de contraste WCAG 2.x de 66 pares (33 por tema). Umbral: 4,5:1 para texto; 3:1 para pares gráficos según `DESIGN.md` (trazo de `input`, anillo `ring`, bandas del semáforo y rellenos de bucket contra la tarjeta). `border` es decorativo y no se mide.

Pares más bajos (valores medidos):

| Par | Tema | Razón | Mínimo |
|---|---|---|---|
| `sin-datos-ink` sobre velo 15 % sobre `card` | oscuro | 4,24 | 4,5 (excepción conocida) |
| `sin-datos-ink` sobre velo 15 % sobre `background` | claro | 4,42 | 4,5 (excepción conocida) |
| `pie.label-deseos` sobre `bucket.deseos` | oscuro | 4,61 | 4,5 |
| `pie.label-sin-categoria` sobre `bucket.sin-categoria` | oscuro | 4,61 | 4,5 |
| `semaforo.sin-datos-ink` sobre velo 15 % sobre `card` | claro | 4,78 | 4,5 |
| `#ffffff` sobre `destructive` | oscuro | 4,82 | 4,5 |
| `bucket.sin-categoria` sobre `card` (gráfico) | oscuro | 3,01 | 3 |
| `bucket.ahorro` sobre `card` (gráfico) | claro | 3,41 | 3 |
| `base.input` sobre `card` (gráfico) | oscuro / claro | 3,42 / 3,48 | 3 |

### Hallazgo: dos excepciones conocidas en la paleta web

Los dos pares «Sin datos» (tinta `muted-foreground` sobre su velo del 15 %) quedan bajo 4,5:1 en la combinación indicada: 4,24 en oscuro sobre la tarjeta y 4,42 en claro sobre el fondo. Los valores de la web no se cambiaron. El script los lista como excepciones explícitas (`KNOWN_EXCEPTIONS`) para seguir en verde; al decidir la paleta nativa conviene resolverlos (por ejemplo, un velo más tenue o una tinta más oscura solo para este chip). El velo del 15 % es el de la web; la comprobación sobre `background` y `card` cubre las dos superficies donde puede caer el chip.

## Diferencias con la paleta antigua de Expo

La paleta de `apps/mobile/src/theme/colors.ts` no se usa. Diferencias relevantes:

- Los buckets cambian: Expo tenía Necesidades `#464B69`, Gustos `#E7E1BF` (crema), Ahorro `#3E9B52`; la web usa azul acero, ciruela y jade (paleta «Brote»).
- Expo solo tenía un tema; aquí hay claro y oscuro.
- Expo definía colores propios para «Sin datos» (`#8A8F9C` sobre `#ECECEF`); la web no, ver arriba.
- Solo en Expo, sin equivalente web (no se migraron): `heading`, `muted`/`mutedDeep`, `hairline` y `canvas` (la web los cubre con `foreground`, `muted-foreground`, `border` y `background`), y los colores de icono del semáforo (`semaforo*Icon`), porque la web usa tinta y banda, no icono coloreado.
- Expo mostraba «Gustos»; las apps nativas dicen «Deseos».
- El bucket `sin-categoria` y `exceso` existen en la web; Expo ya había retirado «Sin categoría» (#778). Se conservan como tokens porque la web los define, pero el catálogo no los usa en el gráfico.
