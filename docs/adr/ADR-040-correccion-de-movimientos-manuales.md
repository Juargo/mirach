---
tags:
  - adr
  - fase-diseño
  - movimientos
  - producto
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-29
fecha_actualizacion: 2026-08-29
---

# ADR-040 — Corrección de movimientos: la proveniencia determina la mutabilidad

## Estado

✅ **Decidido** (2026-08-29, PR1 de `correccion-movimientos-manuales` — capacidad backend;
change SDD `correccion-movimientos-manuales`).

> [!info] Relación con ADR-039
> Este ADR **enmienda ADR-039** en una omisión de ciclo de vida: ADR-039 introdujo la
> `Transaccion` manual (`origen='Manual'`, cuenta centinela per-user, CHECK de paridad)
> pero no dijo nada sobre qué pasa con esa fila **después** de creada. US-058 convirtió ese
> silencio en una promesa de producto explícita en la UI: *"Un movimiento registrado no se
> puede editar ni eliminar después"*. Este ADR llena el silencio: el movimiento manual gana
> un ciclo de vida — su autor puede eliminarlo. Todo lo demás de ADR-039 (columna `origen`,
> semántica C-a, cuenta centinela, CHECK, inmunidad al borrado de ingesta) sigue **vigente
> sin cambios**.
>
> Se sigue el mismo patrón de enmienda que ADR-039 → ADR-026 y ADR-038 → ADR-026: el ADR
> viejo **no se edita**; la relación se declara acá y el índice agrega la nota.

> [!info] Relación con ADR-038 — **reafirmación, no enmienda**
> ADR-038 regla 2 fija la frontera de escritura **de mobile** ("lo propio del usuario y cómo
> se lee su dinero entra; las transacciones no"), y su regla 6 lo dice sin ambigüedad:
> *"una escritura **mobile** que no encaje en la regla 2 exige un ADR propio"*. La capacidad
> que decide este ADR es **solo web**, así que no cruza esa frontera. La decisión de dejar
> mobile afuera (ver Decisión, regla 5) **reafirma** ADR-038 y no lo supersede. Se deja
> escrito para que el próximo lector no tenga que re-derivarlo.

---

## Contexto

US-058 (ADR-039) habilitó registrar un movimiento a mano, sin cartola. El diseño resolvió
la **creación** con cuidado — validación de monto exacto, fecha ≤ hoy, membresía de
categoría, CHECK de paridad en la BD — y resolvió el riesgo de error del usuario por
**prevención**: un diálogo de confirmación antes de comprometer.

Lo que no resolvió es la **recuperación**. Y como el equipo fue honesto, lo dijo en la UI.
`RegistrarMovimientoForm.tsx:55-56` fija esta constante, renderizada en dos lugares (nota
siempre visible + cuerpo del diálogo):

> *"Un movimiento registrado no se puede editar ni eliminar después; su categoría sí puede
> reclasificarse desde el dashboard."*

Esa frase describe correctamente lo que se construyó, y por eso mismo es el mejor enunciado
del defecto. El usuario que tipea `450000` en vez de `45000` no tiene vuelta atrás: el
número equivocado queda dentro del semáforo 50/30/20, del resumen mensual y de la grilla
anual, para siempre. Prevención sin recuperación es media solución, y la mitad que falta es
la que importa cuando el error ya ocurrió.

La corrección venía difiriéndose desde las rondas r8/r9 de la crítica Impeccable (P2), cada
vez con la misma nota: *"US futura, con su propio ADR"*. Este es ese ADR.

Tres hechos verificables en el repo hacen que el momento sea ahora y el costo bajo:

1. **La identidad del origen ya es dato durable.** ADR-039 dejó `origen='Manual'` en la
   fila y el CHECK `Transaccion_origen_ingesta_consistency` garantizando la paridad con
   `ingestaId`. Distinguir una fila corregible de una intocable **no requiere migración
   alguna**: ya está en la BD.
2. **`Transaccion` es una hoja.** No hay `onDelete: Cascade` saliendo de ella. Borrar una
   fila tiene radio de explosión uno.
3. **No hay caché ni desnormalización.** Los cinco readers consultan `Transaccion` fresco
   por request. La corrección se ve en la lectura siguiente, sin lógica de invalidación y
   **sin tocar ningún reader** — la misma propiedad que ADR-039 defendió en CA-05/D-07.

La pregunta de diseño no es entonces *"¿podemos borrar una fila?"* — eso es trivial. Es
**"¿cuál es la regla que dice qué dato financiero es corregible y cuál no?"**. Sin esa
regla, la próxima solicitud ("¿y editar el monto?", "¿y borrar un movimiento del banco?",
"¿y desde el teléfono?") se resuelve por conveniencia y la frontera se erosiona — que es
exactamente el problema que ADR-038 resolvió reemplazando una lista de excepciones por un
criterio enunciable.

---

## Decisión

**La proveniencia determina la mutabilidad: lo que el usuario tipeó, el usuario lo puede
deshacer; lo que produjo una cartola pertenece al registro del banco y no se edita ni se
borra individualmente. En su primera entrega, la corrección es eliminación (no edición),
sin ventana de tiempo, y solo en web.**

Reglas que fija esta decisión:

1. **Corregible ⟺ `origen='Manual'`.** Un usuario puede eliminar una `Transaccion` propia
   con `origen='Manual'` vía `DELETE /api/movimientos/:id`. El gate vive en el WHERE de
   persistencia (`{ id, origen: 'Manual', account: { userId } }`), no en una validación de
   aplicación: el CHECK de paridad de ADR-039 hace que esa cláusula sea estanca contra
   filas nacidas de ingesta, por construcción y no por disciplina.

2. **Las filas nacidas de cartola no se tocan de a una.** Su fuente de verdad es el archivo
   del banco. El camino de corrección existente y suficiente es borrar la ingesta completa
   y volver a subirla (`DELETE /api/ingestas/:id`, US-018). Un endpoint de borrado por fila
   sobre datos bancarios crearía divergencia silenciosa entre lo que muestra MoneyDiary y
   lo que muestra el banco — precisamente la confianza que la app existe para construir.

3. **Corrección = eliminar y volver a registrar, no editar.** La edición de
   `monto`/`fecha`/`descripcion` queda **fuera** de esta entrega (ver Alternativas, Opción
   C). Sería la primera mutación post-persistencia de un campo de dinero en todo el
   codebase, y bajo ADR-024 y el plan de pruebas exige rigor de nivel-creación. Se difiere
   con gatillo registrado, no se abandona.

4. **Sin ventana de tiempo, sin borrado lógico, sin bitácora.** La eliminación no expira.
   No hay concepto de período contable cerrado en MoneyDiary, no hay fuente externa contra
   la cual reconciliar una fila manual, y no hay obligación de auditoría (mono-usuario,
   ADR-023). La fricción necesaria ya la aporta el diálogo de confirmación obligatorio.

5. **Solo web.** Mobile sigue mostrando los movimientos manuales sin afordancia de
   corrección. Mobile **no tiene formulario de registro** de movimientos: darle borrado sin
   creación dejaría al usuario pudiendo **destruir** en el teléfono lo que solo puede
   **rehacer** en el escritorio. Se difiere hasta que mobile gane registro, y ahí se decide
   crear + corregir como una sola superficie coherente (ADR-038 regla 6).

6. **La UI no puede seguir prometiendo permanencia.** `MENSAJE_PERMANENCIA` es falso desde
   el momento en que el endpoint existe, y se renderiza en **dos** sitios. Reescribir ambos
   es parte de esta decisión, no pulido posterior: enviar la capacidad sin el copy deja a la
   app mintiendo justo cuando le pide al usuario que confirme.

7. **La frontera se amplía por ADR, nunca por PR** (regla 6 de ADR-038, conservada). Una
   corrección que no encaje en la regla 1 — editar montos, borrar filas de cartola, borrar
   desde mobile, borrado masivo — exige su propio ADR, igual que exigió éste.

---

## Alternativas consideradas

### Opción A — No hacer nada: la permanencia es la política ✅ honesta, ❌ insostenible

Mantener el estado actual y la copy de permanencia. La prevención (diálogo de confirmación)
es la única defensa; el usuario que se equivoca convive con el dato malo.

✅ Cero superficie nueva, cero riesgo, la copy actual ya es honesta.
✅ Defendible mientras el registro manual era una capacidad nueva sin uso probado.
❌ **Deja un dato financiero incorrecto sin remedio**, contradiciendo la razón de ser del
producto: mostrar el dinero **exacto** (ADR-024). Un semáforo calculado sobre un monto que
el usuario sabe que está mal es peor que no tener semáforo.
❌ La copy convierte el defecto en promesa: cada vez que el usuario abre el formulario, la
app le enseña a desconfiar de él.
❌ Ya se difirió tres veces (r8/r9 P2). Un cuarto diferimiento sin evidencia nueva deja de
ser una decisión y pasa a ser un defecto sin dueño.

### Opción B — Ventana de deshacer post-commit (temporizador o expiración server-side)

Permitir eliminar solo dentro de N minutos/horas del registro, por temporizador de cliente
o por estado de expiración en el servidor.

✅ Acota la superficie destructiva a un intervalo conocido.
❌ **No es un enfoque distinto:** la variante de cliente es esta misma decisión más un
temporizador; la variante de servidor agrega estado y expiración (columna o tabla + barrido)
para nada que la confirmación ya no logre.
❌ **No existe una regla de negocio que la justifique.** No hay período contable que cerrar,
no hay fuente externa contra la cual reconciliar, no hay obligación de auditoría. Sería
inventar una restricción para un requisito hipotético (`yagni`).
❌ **Daña el caso más frecuente:** el error se descubre típicamente *después*, mirando el
semáforo al día siguiente. Ese es exactamente el usuario que la ventana deja varado.
❌ **Inconsistente con lo ya enviado:** `DELETE /api/ingestas/:id` destruye cientos de filas
sin ventana ni bitácora. Poner un cerrojo a la operación de una fila, hecha por su propio
autor, sería más estricto con lo menos destructivo.

### Opción C — Edición completa (`PATCH` de monto/fecha/descripción) en esta entrega

Arreglar el dedo gordo en el lugar, sin borrar y volver a tipear.

✅ **El mayor valor de producto de las tres** — es literalmente lo que el usuario quiere hacer.
✅ Preserva la identidad de la fila (id, fecha de creación, cualquier referencia futura).
❌ **Primera mutación post-persistencia de un campo de dinero en el repo.** Bajo ADR-024 y el
plan de pruebas ("dinero con tipos exactos, nunca `float`"; redondeo, decimales y signo
cubiertos explícitamente) exige rigor de nivel-creación, no un toque liviano.
❌ Reabre **toda** la superficie de validación de la creación
(`MovimientoManualInvalidoError`, `CategoriaFueraDeCatalogoError`,
`BucketCategoriaNoConcuerdaError`) más un esquema de actualización parcial y un DTO de
respuesta nuevo.
❌ **Eliminar ya recupera el 100 % de la capacidad**: borrar y volver a registrar produce
exactamente el mismo estado final. La edición compra ergonomía, no capacidad — y al mayor
costo de riesgo del backlog.
⚠️ Se difiere con gatillo explícito (ver Consecuencias), no se descarta.

### Opción D — Eliminación con alcance `origen='Manual'`, sin ventana, solo web ✅ (elegida)

✅ **Espejo casi literal de un patrón ya endurecido** (`EliminarIngesta`): gate demo antes
del writer, `deleteMany` cuyo conteo **es** el gate de propiedad (anti-enumeración),
aislamiento estructural por `userId` en el WHERE.
✅ **Alcance estanco por construcción**: la cláusula `origen: 'Manual'` no puede convertirse
en una puerta trasera a datos de cartola mientras el CHECK de ADR-039 exista.
✅ **Sin migración, sin cambios de schema, sin cambios en readers, sin invalidación de
caché** — hoja + cómputo por request.
✅ Devuelve la exactitud del dinero, que es el compromiso central del producto.
✅ Sustituye la promesa de permanencia por una **regla enunciable** (proveniencia →
mutabilidad) contra la cual responder las próximas cuatro solicitudes con fundamento.
⚠️ Obliga a reescribir copy ya enviada en dos sitios (regla 6) — trabajo pequeño pero de
cumplimiento obligatorio.
⚠️ Deja la brecha de ergonomía de la edición abierta a propósito, y la brecha de paridad con
mobile explícita.

---

## Seguridad

- **Aislamiento por `userId` estructural** (RNF-SEC-006): el `userId` sale de la sesión,
  nunca del path ni del body, y entra en el WHERE de persistencia —  nunca en un filtro en
  memoria.
- **Anti-enumeración por conteo**: `deleteMany` con `count === 0` → 404. Inexistente, ajena
  y **no-manual** colapsan en la **misma** respuesta. Un error distinguible del tipo "esta
  fila no es manual" sería un oráculo de proveniencia sobre datos de otro usuario; no
  existe.
- **Gate demo antes del writer**, igual que `EliminarIngestaUseCase` y
  `EliminarCategoriaUseCase`: una sesión demo corta antes de tocar persistencia, no se
  intenta el borrado. El demo es de solo lectura y sigue siéndolo.
- **Sin credencial, endpoint de auth ni PII nuevos.** No se agregan campos ni columnas; el
  `descripcion` cifrado (ADR-013) desaparece con la fila.
- **Confirmación obligatoria antes de una acción destructiva** (patrón ADR-038): el diálogo
  nombra el movimiento; el error queda en el diálogo para reintentar.
- **Sin montos en logs ni en mensajes de error** (ADR-013/ADR-033): el log de resultado
  registra id de fila y outcome, como hace `EliminarIngestaUseCase`.

---

## Consecuencias

**Positivas:**

- **La app deja de mentir.** La única promesa de la UI que era falsa-por-diseño desaparece,
  y la copy pasa a describir una capacidad real.
- **Dinero exacto recuperable.** El compromiso de ADR-024 deja de depender de que el usuario
  nunca se equivoque al tipear.
- **Una regla en vez de una lista de excepciones.** "La proveniencia determina la
  mutabilidad" responde por adelantado a editar montos, borrar filas de cartola, borrar
  desde mobile y borrado masivo — con un motivo, no con un juicio caso a caso.
- **Costo estructural nulo:** sin migración, sin schema, sin readers, sin caché, sin
  contrato nuevo más allá de una ruta. Rollback = revertir commits; ningún dato queda
  inaccesible.

**A tener en cuenta:**

- **La edición queda como deuda registrada, con gatillo:** enviarla cuando (i) se reporte
  fricción real de "borrar y volver a tipear" como flujo dominante, o (ii) un movimiento
  gane un artefacto dependiente (adjunto, nota, división) que haga que eliminar pierda
  información en vez de solo incomodar. Hasta entonces, eliminar + re-registrar es la
  respuesta sancionada.
- **Brecha de paridad con mobile, explícita:** el usuario ve el movimiento manual en el
  teléfono y no puede corregirlo ahí. Es la contraparte aceptada de no darle destrucción sin
  creación. Gatillo: mobile gana registro de movimientos.
- **Presión de scope futura:** habilitar el borrado va a invitar a pedir "¿y editar?" y "¿y
  borrar el del banco?". Las reglas 2 y 3 existen para poder responder con fundamento.
- **Sin bitácora:** una eliminación no deja rastro. Aceptado bajo mono-usuario (ADR-023); si
  MoneyDiary pasa a multi-usuario con datos compartidos o aparece una obligación contable,
  borrado lógico + bitácora vuelven a la mesa como decisión propia.
- **Copy duplicada web ↔ (futuro) mobile:** se mitiga fijando el string en un test unitario,
  igual que ADR-038, para que una divergencia sea intencional y revisable.

---

## No incluido en este ADR

- **Editar monto, fecha o descripción de un movimiento manual** — diferido con gatillo
  (Opción C).
- **Eliminar o editar transacciones nacidas de cartola, de a una** — fuera por la regla 2;
  el camino es borrar la ingesta completa (US-018).
- **Eliminar movimientos desde mobile** — fuera por la regla 5, hasta que mobile gane
  registro.
- **Ventana de deshacer, borrado lógico o bitácora de auditoría** — fuera por la regla 4.
- **Borrado masivo de movimientos manuales** — sin evidencia de volumen; el confirm por fila
  es el default seguro.
- **Exponer `origen` como campo de contrato en todos los readers** — ADR-039 lo dejó como
  proveniencia de BD deliberadamente; solo entra si el diseño lo necesita para la superficie
  de gastos.

---

## Referencias

- ADR-039 — Movimientos manuales: `origen` y cuenta centinela (este ADR **enmienda** su
  omisión de ciclo de vida; el resto sigue vigente)
- ADR-038 — Alcance de escritura de mobile: frontera **reafirmada**, no enmendada (regla 5)
- ADR-026 — Ingesta desde mobile: `DELETE /api/ingestas/:id` como camino de corrección para
  datos de cartola
- ADR-024 — Arquitectura de clientes: dinero exacto en el backend; el cliente solo renderiza
- ADR-023 — Topología de despliegue: mono-usuario, sin obligación de auditoría hoy
- ADR-013 — Cifrado en reposo: `descripcion` cifrada; sin montos en logs
- ADR-011 — Contrato-first: la ruta nueva exige esquema Zod + `openapi:emit` en el mismo PR
- ADR-015 — Verificación por capas: aislamiento por `userId` y anti-enumeración con test de
  integración
- US-018 — Eliminar ingesta: patrón HTTP y de persistencia espejado acá
- US-058 — Registro manual: historia que creó la promesa de permanencia que este ADR retira

---

*Fecha de decisión: 2026-08-29 — change SDD `correccion-movimientos-manuales`, PR1
(capacidad backend: `DELETE /api/movimientos/:id`). El affordance web (PR3) y el plumbing de
`origen` en el lado gasto (PR2) completan la entrega bajo la misma decisión.*
