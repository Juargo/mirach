---
tags:
  - adr
  - fase-diseño
  - calidad
  - testing
  - validacion
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-09
fecha_actualizacion: 2026-07-09
---

# ADR-014 — Técnicas de Validación de Requisitos

## Estado

✅ **Decidido**

Define las técnicas de **validación** (*¿construimos el producto correcto?*) del plan de pruebas de MoneyDiary. Complementa a la **verificación** (*¿lo construimos correctamente?*), definida en ADR-015 Técnicas de Verificación de Requisitos. Se apoya en la testabilidad provista por ADR-005 Monolito-Modular-Clean-Architecture.

---

## Contexto

MoneyDiary es una aplicación de finanzas personales (backend + móvil) desarrollada como Trabajo Fin de Máster, con foco explícito en **seguridad y buenas prácticas**. Dentro del plan de pruebas hay que decidir **qué técnicas de validación** aplicar y justificarlas: la validación comprueba que el sistema resuelve la necesidad real del usuario (propuesta de valor basada en **privacidad y confianza**, RN-DIF-003/004), no que cumpla la especificación técnica.

Dos factores condicionan la decisión:

- **Naturaleza del producto:** maneja dinero y datos sensibles (transacciones, montos, glosas, datos del titular). Los errores de cálculo del semáforo 50/30/20 (RF-VIS-001/008) o de exposición de datos dañan directamente la propuesta de valor. Esto empuja el esfuerzo hacia una **verificación** rigurosa y reduce el margen para validación puramente cuantitativa.
- **Contexto de TFM:** un solo desarrollador, número reducido de usuarios reales y tiempo acotado. Esto limita la viabilidad de técnicas de validación que dependen de la **escala**.

### Tensión de diseño

El marco teórico habitual ordena las técnicas de validación por **madurez del producto**: demos → usabilidad → piloto → métricas de negocio → test A/B. Las dos últimas etapas (métricas y A/B) sólo producen evidencia fiable con un volumen de usuarios que un TFM no alcanza. Aplicarlas igualmente daría conclusiones estadísticamente débiles y consumiría esfuerzo que rinde más en las técnicas cualitativas tempranas. La decisión debe, por tanto, **seleccionar el subconjunto de la escalera de madurez que es viable y aporta evidencia defendible** ante el tribunal.

---

## Opciones Evaluadas

### Opción A — Sólo demos frecuentes

Validar el producto exclusivamente mostrando el incremento al cierre de cada sprint y recogiendo opinión.

✅ Coste mínimo, cadencia natural con el desarrollo por sprints
✅ Cierra el bucle de feedback antes de invertir en código
❌ Recoge **opinión**, no observa al usuario ejecutando tareas reales
❌ No expone los casos límite financieros que sólo afloran con uso real (importes grandes, decimales, cambio de mes, cartolas atípicas)

### Opción B — Escalera de madurez completa (demos → usabilidad → piloto → métricas → A/B)

Aplicar las cinco técnicas del marco teórico.

✅ Cobertura teórica máxima de la validación
❌ **Test A/B** requiere volumen de tráfico para significancia estadística; con pocos usuarios los resultados no son fiables
❌ **Métricas de negocio** (retención, MAU) con N reducida ofrecen señales poco fiables para decidir
❌ Alto coste de instrumentación para un retorno marginal en el contexto de TFM

### Opción C — Subconjunto de tres técnicas cualitativas de bajo coste ✅ (elegida)

Aplicar sólo las tres primeras etapas de la escalera —demos, usabilidad y piloto— con distinto protagonismo a lo largo del proyecto, dejando métricas y A/B como trabajo futuro.

✅ Alta relación valor/esfuerzo: cubre usabilidad diaria y casos límite financieros con medios realistas
✅ Genera evidencia empírica y documentable (actas de demo, hojas de usabilidad, informe de piloto) citable en la memoria
✅ Coherente con el foco en seguridad: el piloto expone fallos de control de acceso y manejo de importes
❌ No obtiene datos de comportamiento a escala durante el TFM
❌ La validación cuantitativa fuerte queda diferida (conclusiones mayoritariamente cualitativas)
❌ Exige disciplina de registro constante para no perder la evidencia

---

## Decisión

**Se adopta la Opción C: tres técnicas de validación cualitativas de bajo coste**, aplicadas con distinto protagonismo. Se implementan las tres primeras etapas de la escalera de madurez (**demos → usabilidad → piloto**) y se dejan **métricas de negocio y test A/B como trabajo futuro** para una eventual fase de producción/escalado.

### Técnicas, aplicación y evidencia

| Técnica | Protagonismo / cadencia | Cómo se aplica | Evidencia |
|---------|-------------------------|----------------|-----------|
| **Demos frecuentes** | Continua, cierre de cada sprint | Demo de 20–30 min sobre datos de ejemplo; feedback y decisiones de backlog | Acta de demo; nº de ajustes de backlog por sesión |
| **Pruebas de usabilidad** | 1–2 rondas sobre pantallas navegables | 5 usuarios (regla de Nielsen), 3–5 tareas guiadas, *think aloud*, sin intervenir | Tasa de éxito, tiempo en tarea, nº de errores, puntuación SUS |
| **Prueba piloto** | Final, versión estable | 5–10 usuarios con datos reales durante 2–4 semanas, logging + canal de incidencias | Informe de piloto; incidencias, casos límite y encuesta de cierre |

### Tareas de usabilidad de referencia

Alineadas con el núcleo funcional: registrar un gasto con categoría, consultar el gasto acumulado del mes, crear categoría y asignar transacción, editar el importe de la última transacción y consultar el semáforo/balance del periodo (RF-VIS-001/008).

---

## Consecuencias

**Positivas:**
- Alta relación valor/esfuerzo: se cubre el riesgo de usabilidad y los casos límite financieros con medios realistas para un TFM.
- Evidencia empírica y documentable, fácilmente citable en la memoria y trazable a los requisitos.
- Coherencia con el foco en seguridad: el piloto y la verificación exponen fallos de control de acceso (RNF-SEC-006) y de manejo de importes.

**A tener en cuenta:**
- **Disciplina de registro:** si no se documenta cada demo/sesión/piloto, se pierde la evidencia; usar plantillas fijas por cada ejecución.
- **Validación cuantitativa diferida:** las conclusiones son mayoritariamente cualitativas; métricas de negocio y A/B quedan como trabajo futuro, no como aval del producto en el TFM.
- **Piloto en entorno realista:** debe desplegarse en un entorno tipo producción (no localhost) para que los hallazgos sean representativos (ADR-004 Hosting).
- **Casos límite financieros:** el guion de piloto debe forzar importes grandes, decimales, cambio de mes, categorías faltantes y comportamiento offline.

---

## Referencias

- Nielsen, J. — *Why You Only Need to Test with 5 Users* (Nielsen Norman Group)
- Brooke, J. — *SUS: A Quick and Dirty Usability Scale* (1996)
- ADR-005 Monolito-Modular-Clean-Architecture — testabilidad que habilita la verificación
- ADR-004 Hosting — entorno de despliegue para el piloto
- Requisito Funcional — RF-VIS-001/008
- Requisito no Funcional — RNF-SEC-006
- Plantillas de ejecución: `Plantillas_Validacion_MoneyDiary.docx`

---

*Fecha de decisión: 2026-07-09 · Última actualización: 2026-07-09*
