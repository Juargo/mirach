# Ingreso, perfil y mes financiero

Cambiar desde Ajustes el ingreso mensual, el perfil de porcentajes, el día en que empieza el mes y el nombre (PER-02, PER-06, PER-08, PER-09).

## Pantallas

| N° | Pantalla | Figma | Requisitos | Alcance |
|---|---|---|---|---|
| 14 | Ajustes | [`91:368`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=91-368) | AUTH-04, PRI-01, SOP-01 | v1.0 |
| 48 | Ingreso mensual (Ajustes) | [`154:1610`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=154-1610) | PER-02 | v1.0 |
| 49 | Perfil (Ajustes) | [`154:1640`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=154-1640) | PER-03, PER-04, PER-06 | v1.0, sin la opción «Personalizado» |
| 51 | Inicio del mes | [`154:1753`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=154-1753) | PER-08 | v1.0 |
| 50 | Perfil personalizado | [`154:1703`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=154-1703) | PER-05 | v1.1 (#156) |

Ajustes (14) también da acceso a Categorías, Historial de importaciones, privacidad y cuenta, ayuda y soporte: ver [Categorías y patrones](categorias-y-patrones.md) e [Importaciones, privacidad y cuenta](importaciones-y-cuenta.md).

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/auth/me` | Al abrir Ajustes (nombre y correo) | 200, 401 |
| PATCH | `/api/perfil` | Al guardar el nombre | 200, 400, 401 |
| GET | `/api/perfil/presupuesto` | Al abrir Perfil (49): perfil guardado, metas, día de corte e ingreso declarado | 200, 401 |
| PUT | `/api/perfil/presupuesto` | Al guardar el perfil | 200, 400, 401 |

El ingreso declarado, el perfil de porcentajes y el día de inicio del mes comparten el recurso `/api/perfil/presupuesto` (ADR-005 §7). En el `PUT`, un campo omitido no cambia; las apps solo tienen por ahora la pantalla de perfil (49), y las de ingreso (48) e inicio del mes (51) siguen pendientes (#141).

## Acciones

| Acción | Endpoint | Cuerpo | Éxito | Fallo |
|---|---|---|---|---|
| Guardar el nombre | `PATCH /api/perfil` | `{"nombre": "<1 a 80 caracteres>"}`; nunca `email` ni `passwordActual` | 200 `AuthMeResponse`: se reemplaza la copia local y se anuncia «Perfil guardado» | 400 `NOMBRE_INVALIDO`; lo escrito se conserva |
| Cambiar el ingreso | `PUT /api/perfil/presupuesto` | Pantalla pendiente (#141) | Las metas y porcentajes del Inicio se recalculan en el API | — |
| Cambiar de perfil | `PUT /api/perfil/presupuesto` | `{"perfil": "50_30_20" \| "65_20_15" \| "80_10_10" \| "90_5_5"}`; sin `diaCorte` ni `ingresoDeclarado`, que así no cambian | 200 `PerfilPresupuestoResponse`: se vuelve a la pantalla anterior y el Inicio se recarga. Se aplica a todos los meses, también los pasados (PER-06) | 400 `PerfilErrorResponse`; la pantalla sigue abierta y conserva la selección |
| Cambiar el día de inicio del mes | `PUT /api/perfil/presupuesto` | Pantalla pendiente (#141) | Días 1 a 28; se recalculan todos los meses (PER-08) | — |

El correo llega de Apple o Google y no se edita (PER-09); puede ser `null` en el contrato o un reenvío privado de Apple: se oculta si es `null`.

## Estados

- **Guardando**: botón deshabilitado con progreso; sin cambios, el botón está deshabilitado.
- **Confirmación de recálculo**: cambiar perfil o día de inicio avisa que cambia todos los meses. En Perfil (49) el aviso es el texto fijo bajo el título, sin diálogo adicional.
- **Perfil (49)**: se marca el perfil guardado; si el guardado es `personalizado`, ninguna tarjeta queda marcada. La opción «Personalizado» no se muestra hasta la v1.1 (#156).

## Navegación

- Entrada: pestaña Ajustes. Mientras las apps no tengan esa pestaña, Perfil (49) se abre desde la fila «Perfil de porcentajes» de la pestaña Perfil.
- Salida: volver a Ajustes; el Inicio se recarga al volver.

## Notas por plataforma

- El día de inicio se elige con un selector de 1 a 28, y cada período se muestra con sus fechas («25 sep – 24 oct»), que entrega el API.
