# Architecture Decision Records (ADRs) — Mirach

Este directorio es la fuente de verdad de las decisiones de arquitectura de Mirach. Los
requisitos (qué debe hacer el producto y con qué calidad) viven en
[`docs/requisitos/`](../requisitos/README.md); aquí se registra **cómo** se cumplen y por qué.

## Convención

- Un archivo por decisión: `ADR-NNN-slug-en-kebab-case.md`.
- Estados: `Propuesto` → `Aceptado` → (`Supersedido por ADR-NNN` | `Obsoleto`).
- Un ADR aceptado no se reescribe. Para cambiar de rumbo se crea un ADR nuevo y el anterior
  pasa a `Supersedido por ADR-NNN`. Se permiten correcciones de redacción y enlaces.
- Cada ADR cita los requisitos que satisface (`RNF-SEC-002`, `IMP-05`, etc.), para que la
  trazabilidad vaya del requisito a la decisión y de la decisión al código.
- Las decisiones se revisan en el mismo PR que las implementa.

## Plantilla

```markdown
---
tipo: adr
proyecto: Mirach
estado: Propuesto
fecha: AAAA-MM-DD
requisitos: [RNF-..., IMP-...]
---

# ADR-NNN — Título

## Estado
## Contexto
## Decisión
## Alternativas consideradas
## Consecuencias
## Referencias
```

## Índice

| ADR | Título | Estado |
|-----|--------|--------|
| [ADR-001](ADR-001-estilo-de-arquitectura.md) | Estilo de arquitectura: monolito modular con Clean Architecture y clientes nativos delgados | Aceptado |
| [ADR-002](ADR-002-topologia-de-despliegue.md) | Topología de despliegue y ambientes | Aceptado |
| [ADR-003](ADR-003-mantenibilidad-y-escalabilidad.md) | Mantenibilidad y escalabilidad | Aceptado |
| [ADR-004](ADR-004-persistencia-postgresql-acid.md) | Persistencia: PostgreSQL relacional con transacciones ACID | Aceptado |
| [ADR-005](ADR-005-api-rest-contrato-openapi.md) | API REST con contrato OpenAPI, reutilizando el API de MoneyDiary | Aceptado |
| [ADR-006](ADR-006-autenticacion-y-autorizacion.md) | Autenticación y autorización | Aceptado |
| [ADR-007](ADR-007-stack-tecnologico.md) | Stack tecnológico | Aceptado |
| [ADR-008](ADR-008-ci-cd.md) | CI/CD, estrategia de ramas y releases | Aceptado |
| [ADR-009](ADR-009-seguridad-by-design-y-by-default.md) | Seguridad by design y by default | Aceptado |
| [ADR-010](ADR-010-estrategia-de-pruebas.md) | Pirámide de pruebas y criterios de aceptación | Aceptado |
| [ADR-011](ADR-011-observabilidad-kpis-y-logs.md) | Observabilidad: KPIs, logs, errores y métricas técnicas | Aceptado |
| [ADR-012](ADR-012-suscripciones-y-derechos-por-plan.md) | Suscripciones y derechos por plan | Aceptado |

El product owner los aceptó el 2026-10-25. Las partes que describen
lo que ya está construido y desplegado se marcan como **vigente** dentro de cada ADR; las
que agregan algo nuevo se marcan como **nuevo**.

## Relación con la serie anterior

La serie anterior (ADR-001 a ADR-054, heredada de MoneyDiary) se retiró en el commit
`0f33729`. Sigue disponible en el historial:

```bash
git show 0f33729^:docs/adr/ADR-013-cifrado-de-datos-en-reposo.md
```

La serie nueva consolida esas decisiones por tema. Los números **no** coinciden con los
antiguos: `CLAUDE.md`, `apps/api/CLAUDE.md`, comentarios del código y los requisitos
(por ejemplo PRI-03, que cita "ADR-013") deben actualizarse con esta tabla.

| ADR nuevo | Consolida los ADRs anteriores |
|-----------|-------------------------------|
| ADR-001 | 005 (monolito modular), 024 (clientes delgados), 046 D1 y D9 (apps nativas, sin KMP) |
| ADR-002 | 004 (hosting), 023 (topología), 029 (ambientes), 046 D2 (infraestructura propia) |
| ADR-003 | 005, 011, 053 (paridad visual), 054 (paridad funcional) |
| ADR-004 | 002 (base de datos), 036, 037, 042 (catálogo por usuario), 039, 040 (movimientos manuales) |
| ADR-005 | 001, 028 (Express), 011 (contrato OpenAPI), 026, 038, 044, 050 (alcance de escritura móvil) |
| ADR-006 | 034, 035, 041 (Google), 047 (auth de apps públicas), 049 (revocación Apple), 051 (cuenta de revisión) |
| ADR-007 | 006 (pnpm), 007 (ExcelJS), 009 (pdfjs), 016 (Vitest), 025 (Astro), 032 (tsx), 033 (Pino), 048 (iOS), 052 (Android) |
| ADR-008 | 020 (hooks), 021 (seguridad en el pipeline), 030 (releases), 031 (GitHub Flow) |
| ADR-009 | 013 (cifrado en reposo), 021, 047 D6 (`x-api-key`) |
| ADR-010 | 014, 015 (validación y verificación), 016, 018 (accesibilidad), 054 |
| ADR-011 | 019 (tracking y monitoring), 033 (logging) |
| ADR-012 | Nuevo |

Quedan fuera por no aplicar a Mirach: 003, 008, 010, 012, 017, 022, 043 (web y Expo) y
027 (iconos web).

## Decisiones tomadas en la revisión del 2026-10-24

| Tema | Decisión | ADR |
|------|----------|-----|
| Infraestructura | Seguir en planes gratis por ahora; pasar a pagado y crear staging al activarse un gatillo | ADR-002 |
| Sesión | Deslizante de 30 días de inactividad, tope de 180 días | ADR-006 |
| Suscripciones | RevenueCat | ADR-012 |
| Errores y crashes | Sentry en plan gratuito | ADR-011 |
| Eventos de producto | Tabla propia en PostgreSQL | ADR-011 |
| Clave de duplicados | Agregar saldo y orden dentro del archivo antes del lanzamiento | ADR-004 |

## Decisiones tomadas en la revisión del 2026-10-25

| Tema | Decisión | ADR |
|------|----------|-----|
| Tipografía | Solo Inter, con cifras tabulares; se retira Geist Mono | ADR-007 |
| Cobro | Los planes y el cobro entran en la v1.1; la v1.0 sale con Plus gratis para todos | ADR-012 |

## Pendientes

| Tema | ADR | Qué falta |
|------|-----|-----------|
| Proyecto Supabase `mirach` pausado | ADR-002 | Reactivarlo; revisar los avisos de seguridad (Data API) |
| Transferencia internacional de datos (servidores en EE. UU.) | ADR-002, ADR-009 | Revisión legal frente a la Ley 21.719 |
| Landing en Vercel Hobby (no permite uso comercial) | ADR-002 | Decidir al lanzar: Vercel Pro u otro hosting estático |
| Plus gratis en la v1.0 | ADR-012 | Definir cómo se otorgan los derechos de Plus a todas las cuentas mientras no hay cobro, y cómo se pasa a la prueba de 30 días en la v1.1 |
