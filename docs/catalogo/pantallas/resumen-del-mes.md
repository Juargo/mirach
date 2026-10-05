# Resumen del mes

## Propósito

Pantalla de inicio: muestra cómo se repartió el mes entre Necesidades, Deseos y Ahorro frente a la regla 50/30/20, el estado global del semáforo, el ingreso del mes y una vista del año completo para cambiar de mes.

> **Semáforo oculto en iPhone v1 (decisión de producto, 2026-10-05).** La app de iPhone no muestra el estado global ni el estado por bucket, aunque `estadoGlobal` y `estadoSemaforo` siguen llegando del API y la app los conserva en su modelo, de modo que volver a mostrarlos es solo un cambio de vista. Decisión abierta antes de mostrarlo de nuevo: la redacción de las etiquetas (este catálogo dice «Verde», «Amarillo», «Rojo»; el API y los tokens de diseño dicen «Muy Saludable», «Saludable», «En peligro»). Las filas y reglas del semáforo de abajo se conservan como definición original y están marcadas como *(oculto)*.

## Datos que muestra

Todo viene de `GET /api/resumen` (`ResumenMesResponse`) salvo el bloque anual.

| Dato | Origen | Formato |
|---|---|---|
| Mes mostrado | `periodo` | Nombre del mes y año; siempre el valor devuelto |
| *(oculto en iPhone v1)* Estado global del semáforo | `estadoGlobal` (`verde`, `amarillo`, `rojo` o `null`) | Etiqueta de texto («Verde», «Amarillo», «Rojo») más color; `null` se muestra como «Sin datos» |
| Ingreso del mes | `totalIngreso` | Dinero, con signo `+` |
| Por bucket (Necesidades, Deseos, Ahorro; siempre tres, en ese orden) | `buckets[].bucket`, `total`, `porcentajeBp`, `estadoSemaforo` | Nombre («Deseos»), dinero con signo `-`, porcentaje del ingreso (o «—»); *(oculto en iPhone v1)* estado con etiqueta y color |
| Meta de referencia por bucket | `targets.Necesidades`, `targets.Deseos`, `targets.Ahorro` | «Meta: 50%», «Meta: 30%», «Meta: 20%» |
| Gráfico de distribución del gasto | `buckets[].total` | Proporciones de los tres totales; cada porción rotulada con el nombre del bucket y su `total` (ver brecha 4) |
| Vista anual | `GET /api/resumen/anual` → `meses[]` (doce `ResumenMesResponse`, enero a diciembre) | Una celda por mes con su gráfico reducido y estado; los meses con `sinIngreso: true` aparecen inactivos |
| Año mostrado | `anio` | Número |

La app no calcula porcentajes, estados ni totales propios.

## Acciones

| Acción | Endpoint | Resultado |
|---|---|---|
| Abrir la pantalla | `GET /api/resumen` sin `periodo` | El API resuelve el último mes con movimientos; se muestra el `periodo` devuelto |
| Cambiar de mes (flechas anterior/siguiente, que recorren `periodos` de `GET /api/periodos`, o tocar una celda activa del bloque anual) | `GET /api/resumen?periodo=AAAA-MM` | Reemplaza el contenido; mientras carga no se muestran datos del mes anterior |
| Cambiar de año (flechas del bloque anual) | `GET /api/resumen/anual?anio=AAAA` | Reemplaza el bloque anual |
| Tocar un bucket (porción del gráfico o fila de la leyenda) | Ninguno | Abre [Detalle de bucket](detalle-de-bucket.md) con `bucket` y `periodo` |
| Tocar el ingreso | Ninguno | Abre [Ingresos del mes](ingresos-del-mes.md) con `periodo` |
| Tocar «Subir cartola» (estado vacío) | Ninguno | Abre [Subir cartola](subir-cartola.md) |
| Tirar para refrescar | `GET /api/resumen` y `GET /api/resumen/anual` | Repite las dos consultas con el período en pantalla |

`GET /api/periodos` devuelve los meses (`AAAA-MM`) con al menos un movimiento del usuario, del más reciente al más antiguo; cuenta cualquier movimiento (gasto o solo ingreso), con la misma regla y la misma derivación de mes (UTC) que el período por defecto de `GET /api/resumen`. Los meses fuera de la lista no tienen datos: las flechas del selector los saltan. Lista vacía = el usuario aún no sube nada.

Un `periodo` mal formado o un `anio` fuera de rango responde 400; la app solo envía valores que ella genera, así que un 400 se trata como error genérico.

## Endpoints

| Método | Ruta | Cuándo se llama | Códigos relevantes |
|---|---|---|---|
| GET | `/api/periodos` | Al abrir, y tras subir una cartola | 200 `{periodos}`, 401 |
| GET | `/api/resumen` | Al abrir y al cambiar de mes | 200, 400, 401 |
| GET | `/api/resumen/anual` | Al abrir (año del período resuelto) y al cambiar de año | 200, 400, 401 |

El detalle del semáforo (`GET /api/resumen/semaforo`) queda para «Después»: ver el [índice](../README.md#después).

## Estados

- **Cargando**: progreso; el bloque anual carga por separado y puede aparecer después.
- **Vacío** (`sinIngreso: true` en el mes): mensaje «Todavía no hay datos este mes» con la acción «Subir cartola». El selector de mes sigue disponible.
- **Vacío anual** (los doce meses con `sinIngreso: true`): «Todavía no hay datos este año» con «Subir cartola».
- **Error con reintento**: mensaje y «Reintentar» para la consulta que falló; un error del bloque anual no oculta el resumen del mes, ni al revés.
- **Éxito**: el contenido completo.
- *(Oculto en iPhone v1)* **Estado global `null`** con datos: se muestra «Sin datos» en lugar de color; los buckets con `estadoSemaforo` `null` muestran su etiqueta sin color de estado.

## Navegación

- Entrada: pestaña Resumen; arranque de la app con sesión válida; tras iniciar sesión; desde [Subir cartola](subir-cartola.md) al terminar una importación.
- Salida: [Detalle de bucket](detalle-de-bucket.md), [Ingresos del mes](ingresos-del-mes.md), [Subir cartola](subir-cartola.md), y las demás pestañas.

## Notas para iPhone

- Tirar para refrescar es el gesto natural de recarga.
- El gráfico no puede ser la única vía a los buckets: la leyenda en filas es el camino accesible para VoiceOver y se mantiene siempre.
- *(Oculto en iPhone v1)* El estado se transmite con texto y color a la vez, también en modo oscuro.
- El selector de mes se opera con flechas de al menos 44 pt; el bloque anual funciona como selector alternativo.
- Con Dynamic Type grande, las cifras no se truncan: la leyenda pasa a una columna.

## Referencia

- Expo: `apps/mobile/app/index.tsx`, `apps/mobile/src/components/ResumenScreen.tsx`, `SemaforoHeroCard.tsx`, `DistribucionPie.tsx`, `LeyendaGasto.tsx`, `ResumenAnual.tsx`, `SelectorPeriodoMes.tsx`.
- Web: `apps/web/src/routes/_authenticated/index.tsx`, `apps/web/src/components/ResumenPage.tsx`, `ResumenScreen.tsx`, `SemaforoHeroCard.tsx`, `ResumenAnual.tsx`, `apps/web/src/domain/resumen-view-model.ts`, `apps/web/src/domain/distribucion-gasto.ts` (cálculo que pasa a ser la brecha 4).
