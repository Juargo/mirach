# Detalle de bucket

## Propósito

Mostrar los movimientos de un bucket (Necesidades, Deseos o Ahorro) en un mes, agrupados por categoría, y permitir reclasificar un movimiento a otra categoría, incluso creando la categoría en el momento.

## Datos que muestra

Todo viene de `GET /api/buckets/{bucket}/detalle` (`BucketDetalleMesResponse`).

| Dato | Origen | Formato |
|---|---|---|
| Bucket | `bucket` | Nombre («Deseos» para `Deseos`), con color y etiqueta |
| Mes | `periodo` | Nombre del mes y año; el devuelto |
| Total del bucket | `total` | Dinero |
| Porcentaje del ingreso | `porcentajeBp` | Porcentaje, o «—» si es `null` |
| Meta | `metaBp` | «Meta: N%»; se omite si es `null` |
| Cantidades | `totalTransacciones`, `totalCategorias` | Enteros |
| Grupos (ya ordenados por subtotal descendente, empates por nombre, «Sin categoría» al final) | `grupos[]` | Una sección por grupo |
| Cabecera de grupo | `grupos[].nombre`, `icono` (puede ser `null`), `subtotal`, `conteo` | Ícono de la lista permitida o un ícono genérico si es `null`; dinero |
| Movimiento | `grupos[].transacciones[]`: `descripcion`, `fecha`, `monto`, `origen` (banco o «Manual») | Texto, fecha corta, dinero, nombre del banco |
| Categorías disponibles para reclasificar | `GET /api/categorias` → `categorias[]` (`id`, `nombre`, `bucket`, `icono`) | Agrupadas por bucket |

El grupo con `categoriaId: null` es «Sin categoría»: sus movimientos se pueden reclasificar igual. La lista de movimientos llega completa, sin paginación.

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Cambiar de mes (el selector ofrece los meses de `GET /api/periodos`) | `GET /api/buckets/{bucket}/detalle?periodo=AAAA-MM` | — | Reemplaza el contenido | 400 error genérico; 401 ver reglas globales |
| Reclasificar un movimiento | `PATCH /api/transacciones/{id}/categoria` | `{"categoriaId": "<id de la categoría elegida>"}` | 200 `{id, categoria, bucket}`: se cierra la hoja, se anuncia «Movida a {bucket} · {categoría}» y se repite `GET /api/buckets/{bucket}/detalle` (el movimiento puede haber cambiado de grupo o de bucket) | 400 la categoría ya no existe o no es del usuario: mensaje y se recarga el catálogo; 404 el movimiento ya no existe: mensaje y se recarga el detalle |
| Crear una categoría desde la hoja de reclasificación | `POST /api/categorias` | `{"nombre": "...", "bucket": "Necesidades"\|"Deseos"\|"Ahorro", "icono": "<opcional>"}` | 201 `CategoriaResponse`: se agrega al catálogo en memoria, queda elegida y se continúa con la reclasificación de arriba | 400 con `code` `NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE` o `ICONO_INVALIDO`: mensaje en el formulario; 409 `NOMBRE_DUPLICADO`: «Ya tienes una categoría con ese nombre» |

Reglas de la reclasificación:

- La identidad de la categoría es siempre su `id`, nunca el nombre.
- Si la categoría elegida pertenece a **otro bucket**, antes de llamar al API se pide confirmación («Este movimiento pasará de {bucket actual} a {bucket nuevo} y cambiará el cálculo del mes»). Si es del mismo bucket, se aplica directo.
- La app no ofrece crear un patrón después de reclasificar (ver «Fuera» en el [índice](../README.md#fuera)).
- Los patrones opcionales que admite `POST /api/categorias` no se piden en esta hoja: se agregan después desde [Detalle de categoría](detalle-de-categoria.md).
- Si la hoja ofrece elegir ícono, solo puede usar la lista permitida de [Detalle de categoría](detalle-de-categoria.md#íconos); cualquier otro valor responde 400 `ICONO_INVALIDO`.

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/periodos` | Al abrir el selector de mes | 200 `{periodos}`, 401 |
| GET | `/api/buckets/{bucket}/detalle` | Al abrir, al cambiar de mes, tras reclasificar | 200, 400 (bucket o período inválido), 401 |
| GET | `/api/categorias` | Al abrir la hoja de reclasificación por primera vez | 200, 401 |
| PATCH | `/api/transacciones/{id}/categoria` | Al confirmar la categoría elegida | 200, 400, 404, 401 |
| POST | `/api/categorias` | Al crear una categoría desde la hoja | 201, 400, 409, 401 |

`{bucket}` es `Necesidades`, `Deseos` o `Ahorro`. `Ingresos` no es válido aquí (responde 400): los ingresos tienen su [propia pantalla](ingresos-del-mes.md).

## Estados

- **Cargando**: progreso con «Cargando movimientos…».
- **Vacío** (`grupos` vacío): «Sin movimientos en {mes}» y el selector de mes sigue disponible.
- **Error con reintento**: mensaje y «Reintentar» (repite `GET /api/buckets/{bucket}/detalle`).
- **Éxito**: lista agrupada.
- **Catálogo cargando**: la hoja de reclasificación muestra progreso; no se puede confirmar hasta tenerlo.
- **Error de catálogo**: mensaje y «Reintentar» dentro de la hoja; el resto de la pantalla sigue usable.
- **Reclasificando**: el movimiento muestra progreso y no admite otra acción hasta terminar.
- **Confirmación de cambio de bucket**: paso intermedio con «Cancelar» (revierte la selección) y «Confirmar».
- **Error al reclasificar**: el movimiento conserva su categoría anterior y se muestra el mensaje.

## Navegación

- Entrada: [Resumen del mes](resumen-del-mes.md) (porción del gráfico o fila de la leyenda), con `bucket` y `periodo`.
- Salida: volver al Resumen conservando el mes. No navega a otras pantallas.

## Notas para iPhone

- La reclasificación se hace con una hoja modal (sheet) que lista las categorías agrupadas por bucket, con el bucket siempre rotulado; es más cómoda que un selector desplegable.
- Deslizar sobre una fila para reclasificar es un atajo posible, pero la acción debe existir también como botón accesible.
- Tirar para refrescar repite `GET /api/buckets/{bucket}/detalle`.
- VoiceOver anuncia el resultado de reclasificar («Movida a Deseos · Ropa») en una región de estado.
- Como el API no indica cuáles categorías son internas (brecha 3), `Desconocido` aparece como cualquier otra opción de destino.

## Referencia

- Expo: `apps/mobile/app/bucket/[bucket].tsx`, `apps/mobile/src/components/detalle/` (filas, hoja de reclasificación), `apps/mobile/src/api/categorias.ts`.
- Web: `apps/web/src/routes/_authenticated/buckets.$bucket.tsx`, `apps/web/src/components/BucketDetalleMesPage.tsx`, `ReclasificarCategoriaControl.tsx`, `AgregarCategoriaControl.tsx`, `apps/web/src/domain/detalle-bucket-mes-view-model.ts`.
- Fuera de la v1 en esas pantallas: `OfrecerPatronControl.tsx`, `ReevaluarPatronesControl.tsx` y el borrado de movimientos manuales.
