# Ingresos del mes

## Propósito

Listar los ingresos de un mes con su total y su origen (banco). Es de solo lectura: los ingresos no participan del 50/30/20 como gasto y no tienen meta ni semáforo.

## Datos que muestra

Todo viene de `GET /api/ingresos/mes` (`IngresosMesResponse`).

| Dato | Origen | Formato |
|---|---|---|
| Mes | Parámetro `periodo` enviado, o el período resuelto por el API cuando se omite | Nombre del mes y año |
| Total del mes | `total` | Dinero |
| Cantidad de movimientos | `conteo` | Entero |
| Cada ingreso | `transacciones[]`: `descripcion`, `fecha`, `monto`, `origen` | Texto, fecha corta, dinero, nombre del banco (o «Manual») |

La respuesta no trae el campo `periodo`: la pantalla recibe el mes desde la navegación. Si se entra sin mes, hay que usar el mes del [Resumen](resumen-del-mes.md) del que se vino. La lista llega completa, sin paginación.

## Acciones

| Acción | Endpoint | Resultado |
|---|---|---|
| Cambiar de mes | `GET /api/ingresos/mes?periodo=AAAA-MM` | Reemplaza el contenido |
| Tirar para refrescar | `GET /api/ingresos/mes` con el mismo período | Recarga |

No hay acciones de escritura: el borrado de movimientos manuales y el ingreso manual están fuera de la v1.

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/ingresos/mes` | Al abrir y al cambiar de mes | 200, 400 (período mal formado), 401 |

## Estados

- **Cargando**: «Cargando ingresos…».
- **Vacío** (`transacciones` vacío): «Sin ingresos en {mes}. No hay ingresos registrados para este período.»
- **Error con reintento**: mensaje y «Reintentar».
- **Éxito**: cabecera con total y cantidad, y la lista.

## Navegación

- Entrada: [Resumen del mes](resumen-del-mes.md) (fila de ingreso de la leyenda).
- Salida: volver al Resumen conservando el mes.

## Notas para iPhone

- Pantalla de lista simple con tirar para refrescar.
- Los montos y fechas usan dígitos tabulares y no se truncan con Dynamic Type grande: la descripción puede ocupar varias líneas.
- La cabecera con total puede quedar fija al desplazar.

## Referencia

- Expo: `apps/mobile/app/ingresos.tsx`, `apps/mobile/src/components/IngresoCard.tsx`.
- Web: `apps/web/src/routes/_authenticated/ingresos.tsx`, `apps/web/src/components/IngresosMesPage.tsx`, `IngresosMesTable.tsx`, `apps/web/src/domain/ingresos-mes-view-model.ts`.
