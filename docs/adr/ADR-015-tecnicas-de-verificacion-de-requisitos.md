---
tags:
  - adr
  - fase-diseño
  - calidad
  - testing
  - verificacion
  - seguridad
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-09
fecha_actualizacion: 2026-07-09
---

# ADR-015 — Técnicas de Verificación de Requisitos

## Estado

✅ **Decidido**

Define las técnicas de **verificación** (*¿lo construimos correctamente?*) del plan de pruebas de MoneyDiary. Es el par complementario de ADR-014 Técnicas de Validación de Requisitos y se apoya en la testabilidad provista por ADR-005 Monolito-Modular-Clean-Architecture.

---

## Contexto

Mientras la validación comprueba que se construye el producto correcto, la **verificación** comprueba que cada artefacto se ajusta a los requisitos y al diseño acordados. En MoneyDiary la verificación adquiere un peso superior al de un proyecto convencional por dos motivos:

- **Se manipula dinero:** el cálculo del semáforo 50/30/20 (RF-VIS-001/008) suma montos y agrupa por mes, bucket y comercio. Un error de redondeo, de decimales o de signo (ingreso/gasto) corrompe la propuesta de valor.
- **Se manejan datos sensibles:** el aislamiento por `user_id` (RNF-SEC-006) y el cifrado a nivel de aplicación (ADR-013 Cifrado de Datos en Reposo) deben verificarse; un fallo de control de acceso expone datos personales.

La Clean Architecture (ADR-005 Monolito-Modular-Clean-Architecture) habilita una verificación por capas: dominio puro testeable sin infraestructura, puertos verificables con dobles, e infraestructura verificable con tests de integración contra los adaptadores reales.

### Tensión de diseño

No todas las técnicas rinden igual en cada capa ni todas caben en el tiempo de un TFM. El riesgo no está distribuido de forma uniforme: se concentra en la **lógica monetaria** (dominio) y en el **control de acceso** (infraestructura/seguridad). La decisión debe **concentrar el esfuerzo de verificación donde el defecto es más caro**, en lugar de perseguir una cobertura homogénea y superficial.

---

## Opciones Evaluadas

### Opción A — Sólo pruebas manuales / UAT al final

Verificar el sistema probándolo manualmente contra los criterios de aceptación antes de la entrega.

✅ Bajo coste inicial, sin infraestructura de testing
❌ No es repetible ni regresivo: cada cambio obliga a reprobar todo a mano
❌ Insuficiente para la lógica de dinero y el control de acceso, donde se necesita evidencia sistemática
❌ Detecta los defectos tarde y caros

### Opción B — Cobertura homogénea máxima (alto % en todas las capas)

Perseguir una cobertura alta y uniforme en dominio, aplicación e infraestructura.

✅ Métrica de cobertura vistosa
❌ Coste desproporcionado para un solo desarrollador en un TFM
❌ Gasta esfuerzo en código trivial (getters, mapeos) con el mismo peso que la lógica crítica
❌ La cobertura como objetivo incentiva tests de bajo valor

### Opción C — Verificación por capas con énfasis en dinero y seguridad ✅ (elegida)

Combinar varias técnicas, priorizando la lógica monetaria (tests unitarios) y el control de acceso (tests de integración), con criterios ejecutables como puente a los requisitos, y revisión/UAT como refuerzo.

✅ Concentra el esfuerzo donde el defecto es más caro
✅ Aprovecha la testabilidad de la Clean Architecture (dominio puro)
✅ Aporta trazabilidad requisito → prueba (BDD)
✅ La revisión de código es de las técnicas más coste-efectivas para hallar vulnerabilidades
❌ Requiere montar infraestructura de testing (frameworks, dobles, pipeline)
❌ Exige disciplina para mantener los tests vivos a medida que evoluciona el dominio

---

## Decisión

**Se adopta la Opción C: verificación por capas con énfasis en la lógica de dinero y en el control de acceso.** Se combinan cinco técnicas con distinto peso.

### Técnicas, foco y ubicación en la arquitectura

| Técnica | Foco prioritario | Capa / ubicación |
|---------|------------------|------------------|
| **Tests unitarios** | Lógica de dinero: sumas de balance, redondeos, decimales, signo ingreso/gasto, cálculo 50/30/20 | Dominio (value objects, domain services) |
| **Tests de integración** | API, persistencia, autenticación y **control de acceso a nivel de dato** (un usuario no accede a transacciones de otro) | Infraestructura (persistence, http) |
| **Criterios de aceptación ejecutables (BDD)** | Traducir requisitos del PO en pruebas automáticas; trazabilidad requisito → prueba | Aplicación / E2E |
| **Revisiones formales / peer review** | Vulnerabilidades: inyección, gestión de secretos, validación de entrada, no commitear claves (RNF-SEC-005) | Transversal, con checklist de seguridad |
| **Pruebas de aceptación de usuario (UAT)** | Confirmación final contra criterios de aceptación antes de dar por válido | Pre-entrega |

### Reglas de énfasis

- El dinero se modela con tipos exactos (nunca `float`); los tests unitarios cubren explícitamente redondeo y decimales.
- Todo endpoint que devuelve datos de usuario tiene un test de integración que verifica el aislamiento por `user_id` (RNF-SEC-006).
- El `CryptoService` (ADR-013 Cifrado de Datos en Reposo) se verifica de forma aislada (cifra/descifra correctamente; la clave vive fuera de la BD).
- La revisión de código usa un checklist de seguridad fijo antes de integrar.

---

## Consecuencias

**Positivas:**
- El riesgo técnico se cubre donde más duele: cálculo monetario y control de acceso.
- Trazabilidad requisito → prueba mediante BDD, muy defendible ante el tribunal.
- La verificación regresiva permite refactorizar el dominio con red de seguridad, coherente con la mantenibilidad buscada en ADR-005 Monolito-Modular-Clean-Architecture.
- El peer review con checklist detecta vulnerabilidades de forma temprana y barata.

**A tener en cuenta:**
- **Infraestructura de testing:** definir frameworks, dobles (in-memory/fakes para puertos) y pipeline de ejecución.
- **Mantenimiento de tests:** con requisitos poco consolidados, los tests de capas altas pueden requerir refactor; preferir tests de dominio estables.
- **Cobertura como guía, no como meta:** medir cobertura para detectar huecos en la lógica crítica, sin convertir el porcentaje en objetivo.
- **UAT y validación:** la UAT cierra la verificación, pero no sustituye a la validación con usuarios (ADR-014 Técnicas de Validación de Requisitos).

---

## Referencias

- Martin, R.C. — *Clean Architecture* (2017) — testabilidad por capas
- North, D. — *Introducing BDD* (2006)
- OWASP — *Code Review Guide* / *ASVS* (checklist de seguridad)
- ADR-005 Monolito-Modular-Clean-Architecture
- ADR-013 Cifrado de Datos en Reposo
- ADR-014 Técnicas de Validación de Requisitos
- Requisito no Funcional — RNF-SEC-005, RNF-SEC-006
- Requisito Funcional — RF-VIS-001/008

---

*Fecha de decisión: 2026-07-09 · Última actualización: 2026-07-09*
