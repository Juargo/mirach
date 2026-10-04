# Categorías

## Propósito

Mostrar el catálogo propio de categorías del usuario, agrupado por bucket, y crear categorías nuevas. Cada categoría pertenece a un bucket (Necesidades, Deseos o Ahorro) y puede tener patrones de auto-clasificación (se editan en [Detalle de categoría](detalle-de-categoria.md)).

## Datos que muestra

Todo viene de `GET /api/categorias` (`CatalogoResponse`).

| Dato | Origen | Formato |
|---|---|---|
| Grupos por bucket | `categorias[].bucket` | Una sección por bucket con su nombre («Deseos») y color; el orden de los buckets es Necesidades, Deseos, Ahorro |
| Nombre | `categorias[].nombre` | Texto; el API las entrega ordenadas por nombre |
| Ícono | `categorias[].icono` (puede ser `null`) | Ícono de la lista permitida (ver [íconos](detalle-de-categoria.md#íconos)) o un ícono genérico |
| Cantidad de movimientos | `categorias[].transaccionesCount` (historial completo del usuario) | «N movimientos» |
| Cantidad de patrones | Largo de `categorias[].patrones` | «N patrones» |

El agrupamiento por bucket es solo presentación de los datos recibidos.

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Abrir una categoría | Ninguno | — | Abre [Detalle de categoría](detalle-de-categoria.md) con su `id` | — |
| Crear una categoría | `POST /api/categorias` | `{"nombre": "<1 a 40 caracteres>", "bucket": "Necesidades"\|"Deseos"\|"Ahorro", "icono": "<de la lista>"\|null}`. `icono` es opcional. El campo `patrones` del contrato no se usa aquí | 201 `CategoriaResponse`: se cierra el formulario, la categoría aparece en su grupo y se anuncia «Categoría «{nombre}» creada» | 400 con `code`: `NOMBRE_INVALIDO` («El nombre debe tener entre 1 y 40 caracteres»), `BUCKET_NO_ASIGNABLE` («Elige un grupo: Necesidades, Deseos o Ahorro»), `ICONO_INVALIDO` («Elige un ícono válido de la lista»); 409 `NOMBRE_DUPLICADO` («Ya tienes una categoría con ese nombre»); el formulario conserva lo escrito |
| Tirar para refrescar | `GET /api/categorias` | — | Recarga | Error con reintento |

Campos del formulario de creación: nombre (obligatorio), grupo (obligatorio, sin valor por defecto, con la nota «Define cómo cuenta este gasto en tu 50/30/20; puedes cambiarlo después, pero afecta todos los meses»), ícono (opcional). La unicidad del nombre la decide el servidor (sin distinguir mayúsculas).

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/categorias` | Al abrir, al refrescar y al volver de un detalle | 200, 401 |
| POST | `/api/categorias` | Al enviar el formulario de creación | 201, 400, 409, 401 |

## Estados

- **Cargando**: «Cargando categorías…».
- **Vacío**: «Todavía no tienes categorías. Crea tu primera categoría para empezar a clasificar tus movimientos.» con la acción «Nueva categoría».
- **Error con reintento**: mensaje y «Reintentar»; si el error ocurre justo tras crear o eliminar, el mensaje aclara que el cambio sí se aplicó.
- **Éxito**: grupos con sus categorías.
- **Creando**: formulario abierto; el botón «Crear» se deshabilita con progreso mientras responde.
- **Error de creación**: mensaje bajo el formulario, que no se cierra.
- **Grupo sin categorías**: se muestra el grupo con «Sin categorías» (los tres buckets aparecen siempre).

## Navegación

- Entrada: pestaña Categorías.
- Salida: [Detalle de categoría](detalle-de-categoria.md).

## Notas para iPhone

- El formulario de creación es una hoja modal (sheet) con teclado de texto sin autocorrección para el nombre.
- Elegir el grupo es obligatorio y explícito: se usa un selector segmentado de tres opciones rotuladas, no color.
- Tirar para refrescar recarga el catálogo.
- Las tres categorías internas `Desconocido` (una por bucket) se muestran como cualquier otra, porque el API no las distingue (brecha 3); en el detalle se les negará editar y eliminar.

## Referencia

- Expo: `apps/mobile/app/configuracion.tsx` (sección de categorías), `apps/mobile/src/components/configuracion/`, `apps/mobile/src/api/categorias.ts`, `apps/mobile/src/domain/mensajes-catalogo.ts`.
- Web: `apps/web/src/routes/_authenticated/configuracion.categorias.tsx`, `apps/web/src/components/configuracion/categorias/CategoriasPanel.tsx`, `NuevaCategoriaForm.tsx`, `CategoriaFila.tsx`, `mensajes-catalogo.ts`.
