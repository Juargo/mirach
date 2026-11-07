# Inicio y movimientos

Responder «¿mi mes está equilibrado?» en el Inicio, y ver y corregir los movimientos del mes: reclasificar, ver el detalle de un bloque y los ingresos.

## Pantallas

| N° | Pantalla | Figma | Requisitos | Alcance |
|---|---|---|---|---|
| 05 | Inicio | [`189:3751`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=189-3751) | VIS-01–VIS-05, VIS-10, VIS-11, MOV-05 | v1.0 |
| 05b | Inicio · gustos sobre por sin clasificar | [`196:3972`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=196-3972) | VIS-17, regla 14 | v1.0 |
| 05c | Cómo ordenar tu mes | [`194:3773`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=194-3773) | VIS-03, VIS-10 | v1.0 |
| 08 | Movimientos | [`89:196`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=89-196) | MOV-01, MOV-05, IMP-13 | v1.0 |
| 09 | Reclasificar movimiento | [`89:337`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=89-337) | MOV-03, CLA-03 | v1.0 |
| 10 | Detalle de bloque | [`90:232`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=90-232) | VIS-06 | v1.0 |
| 47 | Movimientos · ignorado y sobregiro | [`151:1803`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=151-1803) | MOV-04, regla 15 | v1.0 |
| 13 | Historial (año y comparación) | [`91:269`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=91-269) | VIS-13, VIS-08 | Después (D3, D6) |

Los ingresos del mes (VIS-10, MOV-11) se abren desde la línea «Ingresos del mes» del Inicio.

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/periodos` | Al abrir el Inicio y tras importar o registrar | 200 `{periodos}`, 401 |
| GET | `/api/resumen` | Al abrir el Inicio y al cambiar de mes | 200, 400, 401 |
| GET | `/api/movimientos` | Al abrir Movimientos y al cambiar de mes | 200, 400, 401 |
| GET | `/api/buckets/{bucket}/detalle` | Al abrir el detalle de un bloque y tras reclasificar | 200, 400, 401 |
| GET | `/api/ingresos/mes` | Al abrir los ingresos del mes | 200, 400, 401 |
| GET | `/api/categorias` | Al abrir la hoja de reclasificación por primera vez | 200, 401 |
| GET | `/api/transacciones/{id}/parecidos` | Al elegir una categoría en la hoja, antes de guardar (CLA-03) | 200, 400, 404, 503, 401 |
| PATCH | `/api/transacciones/{id}/categoria` | Al confirmar la categoría elegida | 200, 400, 403, 404, 503, 401 |
| POST | `/api/categorias` | Al crear una categoría desde la hoja | 201, 400, 409, 401 |

`{bucket}` es `Necesidades`, `Deseos` (se muestra «Gustos») o `Ahorro`; `Ingresos` responde 400. El detalle del semáforo heredado (`GET /api/resumen/semaforo`) no se usa: el estado del mes llega con #113.

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Abrir el Inicio | `GET /api/resumen` sin `periodo` | — | El API resuelve el último mes con movimientos; se muestra el `periodo` devuelto | Error con reintento |
| Cambiar de mes (flechas que recorren `GET /api/periodos`) | `GET /api/resumen?periodo=AAAA-MM` | — | Reemplaza el contenido; los meses fuera de la lista no tienen datos y las flechas los saltan | 400 se trata como error genérico (la app solo envía valores propios) |
| Tocar un bloque | `GET /api/buckets/{bucket}/detalle?periodo=…` | — | Abre el detalle (10): grupos por categoría ya ordenados por subtotal | Error con reintento |
| Ver los movimientos del mes | `GET /api/movimientos?periodo=…` | — | Lista con `fecha`, `descripcion`, `cargo`/`abono`, `bucket`, `categoria` y `banco` («Manual» para los registrados a mano); filtros por bloque y banco sobre los datos recibidos (MOV-01) | Error con reintento |
| Reclasificar un movimiento | `PATCH /api/transacciones/{id}/categoria` | `{"categoriaId": "<id elegido>"}` | 200 `{id, categoria, bucket, movidos: 0}`: se anuncia «Movido a {bloque} · {categoría}» y se recargan la lista y el resumen | 400 la categoría ya no existe: mensaje y se recarga el catálogo; 404 el movimiento ya no existe: se recarga la lista |
| Crear una categoría desde la hoja | `POST /api/categorias` | `{"nombre", "bucket", "icono"?}` | 201: queda elegida y se continúa con la reclasificación | 400 `NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `ICONO_INVALIDO`; 409 `NOMBRE_DUPLICADO` |
| Consultar parecidos | `GET /api/transacciones/{id}/parecidos?categoriaId=&periodo=` | — | 200 `{patron, total, existente}`: «Aplicar a “{patron}”» con «{total} movimientos más y los próximos que lleguen»; `patron: null` oculta la casilla (texto con menos de 3 letras o categoría interna) | 400 `PARAMETROS_INVALIDOS`, `PERIODO_INVALIDO`; 404 `TRANSACCION_NO_ENCONTRADA`, `CATEGORIA_NO_ENCONTRADA` |
| Aplicar a parecidos | `PATCH /api/transacciones/{id}/categoria` | `{"categoriaId", "aplicarAParecidos": {"periodo": "YYYY-MM"}}` | 200 `{id, categoria, bucket, movidos}`: en una sola transacción reclasifica el movimiento a mano, crea el patrón sugerido (o lo mueve aquí si vivía en otra categoría, CLA-17) y mueve los parecidos del mes | 400 igual que reclasificar, más `BODY_INVALIDO`, `PATRON_INVALIDO`, `PERIODO_INVALIDO`; 403 `CATEGORIA_INTERNA`; 404 igual que reclasificar; 503 `CATALOGO_NO_DISPONIBLE` |
| Ignorar un movimiento | Pendiente (brecha 22) | — | — | — |
| Ver los ingresos del mes | `GET /api/ingresos/mes?periodo=…` | — | Total, cantidad y lista con su origen (banco o «Manual»); la respuesta no trae `periodo`, así que la pantalla usa el mes desde el que se abrió | Error con reintento |

Reglas de contrato:

- La identidad de la categoría es siempre su `id`, nunca el nombre (ADR-004).
- Si la categoría elegida es de **otro bloque**, se pide confirmación antes de llamar al API («Este movimiento pasará de {bloque actual} a {bloque nuevo} y cambiará el cálculo del mes»).
- Monto, fecha y descripción no se editan (MOV-03). Los movimientos registrados a mano se borran desde su detalle ([Registrar a mano](registro-a-mano.md)).
- La app no calcula porcentajes, estados ni totales: todo sale del API (ADR-001).

## Estados

- **Inicio vacío** (`sinIngreso: true`): pantalla 11 del [primer uso](primer-uso.md), con «Subir cartola»; el selector de mes sigue disponible.
- **Cargando un mes**: no se muestran datos del mes anterior.
- **Detalle vacío** (`grupos` vacío): «Sin movimientos en {mes}».
- **Reclasificando**: el movimiento muestra progreso y no admite otra acción.
- **Confirmación de cambio de bloque**: «Cancelar» revierte la selección.
- **Error al reclasificar**: el movimiento conserva su categoría anterior.

## Navegación

- Entrada: pestaña Inicio (y arranque con sesión válida); pestaña Movimientos; desde [Subir una cartola](subir-cartola.md) al terminar.
- Salida: detalle de bloque (10), ingresos del mes, detalle de un movimiento manual (44), «Cómo ordenar tu mes» (05c), [Subir una cartola](subir-cartola.md) desde el estado vacío.

## Pendiente en el API

- Brecha 14 (#142): sobregiros marcados y fuera del cálculo (pantalla 47).
- Brecha 15 (#136): «Datos hasta el …», frase del mes, «sin gastar» y cantidad en Desconocido.
- Brecha 22 (#158): marcar un movimiento como ignorado (MOV-04).

## Notas por plataforma

- El gráfico no es la única vía a los bloques: las filas de la leyenda son el camino accesible y se mantienen siempre.
- La reclasificación usa una hoja modal con las categorías agrupadas por bloque, con el bloque siempre rotulado.
- Con fuente grande, las cifras no se truncan: la leyenda pasa a una columna.
