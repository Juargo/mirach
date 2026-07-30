---
tags:
  - adr
  - fase-diseño
  - proceso
  - infraestructura
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-28
fecha_actualizacion: 2026-07-28
---

# ADR-031 — Estrategia de Ramas: GitHub Flow (Trunk-Based)

## Estado

✅ **Decidido** (2026-07-28) — se adopta **GitHub Flow** (una variante de la familia *trunk-based*) como estrategia de ramas oficial del repositorio. Formaliza el modelo que ya se practicaba **de facto** —`main` como tronco único protegido, ramas efímeras `type/descripción`, todo por PR— y deja explícito por qué se descarta GitFlow. Cierra la brecha de proceso: la estrategia de ramas deja de ser una convención implícita para ser una decisión documentada, coherente con lo que ADR-030 Versionado y Automatización de Releases ya presupone.

---

## Contexto

MoneyDiary nunca decidió formalmente su estrategia de ramas. Sin embargo, la evidencia muestra un patrón consistente:

- Las ramas del repositorio son todas efímeras del tipo `feat/*` / `fix/*` / `chore/*`, cortadas de `main` y mergeadas de vuelta a `main`. **Nunca existió una rama `develop`** ni ninguna rama de integración de larga vida.
- Los sprints entregaron cadenas de PRs (feature-branch-chain / stacked-to-main) que siempre convergen a `main`.

Esa práctica de facto ya está **condicionada por decisiones previas**, que restringen el espacio de opciones:

| Restricción | Origen | Efecto sobre el modelo de ramas |
|---|---|---|
| `main` exige PR + checks para mergear (`enforce_admins=true`) | Protección de rama activada 2026-07-28 (ítem C.7 de ADR-030 Versionado y Automatización de Releases) | El *trunk-based puro* (commit directo al tronco) queda **imposibilitado**: todo entra por PR |
| release-please abre un "release PR por paquete" **en cada push a `main`** | ADR-030 Versionado y Automatización de Releases (Decisión #2) | El versionado y el changelog se derivan de `main`; una rama de integración paralela pelearía con este mecanismo |
| Render y Vercel auto-deployan **al push a `main`**; los tags `<paquete>-v*` disparan el CD por parte | ADR-030 Versionado y Automatización de Releases · ADR-004 Hosting | El despliegue está cableado a `main` como tronco único |
| Un solo desarrollador | Naturaleza del proyecto | La coordinación multi-rama de GitFlow no aporta valor; solo agrega ceremonia |

En otras palabras: la infraestructura ya **presupone** un modelo de tronco único con `main` como punto de integración y despliegue. Falta la decisión explícita que lo nombre y lo justifique.

La motivación primaria del proyecto es **aprender ingeniería de software** (ADR-001 Backend Framework); una estrategia de ramas explícita es un fundamento de proceso que hoy está ausente y merece una decisión registrada, aunque solo formalice lo que ya se hace.

---

## Opciones evaluadas

La pregunta real no es "trunk-based vs GitFlow" a secas, sino **qué variante de la familia trunk-based** adoptar dado que la infraestructura ya cierra parte del espacio.

### Opción A — GitHub Flow (ramas cortas + PR obligatorio a `main`) ✅ (propuesta)

Un único tronco de larga vida (`main`). El trabajo ocurre en ramas efímeras (`type/descripción`) que salen de `main`, se integran por PR con checks verdes y se borran al mergear. Releases y deploys derivan de `main`.

- ✅ Encaja **exacto** con ADR-030 Versionado y Automatización de Releases: release-please y el CD por webhook/tag operan sobre `main` sin fricción.
- ✅ Compatible con la protección de rama ya activa (PR obligatorio).
- ✅ Ceremonia mínima, apropiada para un solo desarrollador.
- ✅ Es exactamente lo que el repositorio ya practica: formalizarlo no introduce cambios operativos.
- ⚠️ Requiere disciplina de ramas efímeras (no dejar ramas largas divergiendo de `main`) y de no mezclar workspaces en un commit (ya exigido por ADR-030 Versionado y Automatización de Releases).

> Nota de precisión terminológica: *GitHub Flow* es el nombre específico del patrón "ramas cortas + PR obligatorio + deploy desde el tronco". Es un miembro de la familia *trunk-based development*. El término genérico "trunk-based" a veces se reserva para el commit-directo-al-tronco con feature flags (ver Opción C); aquí se adopta la variante con PR.

### Opción B — GitFlow (`develop` + `main` + `release/*` + `hotfix/*`)

Múltiples ramas de larga vida: `develop` como integración, `main` para releases, más ramas `release/*` y `hotfix/*` dedicadas.

- ❌ **Pelea de frente con ADR-030 Versionado y Automatización de Releases**: release-please y los deploys de plataforma están cableados a `main`; introducir `develop` obliga a reconfigurar todo el CD para no ganar nada.
- ❌ GitFlow resuelve problemas de **equipos grandes** con releases versionadas a mano y soporte simultáneo de versiones viejas — ninguno aplica a un mono-desarrollador con deploy continuo.
- ❌ La ceremonia (dos ramas largas, merges por lote, ramas de release/hotfix) es sobrecosto puro aquí.
- **Descartada.**

### Opción C — Trunk-based puro (commit directo a `main` + feature flags)

Sin ramas: se commitea directo al tronco y las features incompletas se ocultan con feature flags.

- ❌ **Imposibilitado por la protección de rama** activada en C.7: `main` exige PR, no admite push directo.
- ❌ Las feature flags serían over-engineering (YAGNI) para la escala actual.
- **Descartada.**

---

## Decisión

1. **Adoptar GitHub Flow** como estrategia de ramas oficial: `main` es el único tronco protegido y punto de integración/despliegue.
2. **Ramas efímeras** con el formato `type/descripción` (los mismos tipos que Conventional Commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`), una por unidad de trabajo, borradas al mergear.
3. **Todo cambio entra por PR** con checks verdes; sin push directo a `main` (ya forzado por la protección de rama de ADR-030 Versionado y Automatización de Releases).
4. **Releases y deploys derivan de `main`** vía release-please + CD por tag (ADR-030 Versionado y Automatización de Releases).
5. **Hotfix = otra rama corta** (`fix/*`) hacia `main`, sin ceremonia dedicada de GitFlow.
6. Para cambios grandes, se admite **PRs encadenados** (feature-branch-chain o stacked-to-main) como ya se practica, sin que ello constituya una rama de integración de larga vida.

---

## Consecuencias

**Positivas:**
- **Cierra una brecha de proceso** sin cambiar la operación: documenta lo que ya se hace y le da justificación.
- **Coherencia total con ADR-030 Versionado y Automatización de Releases**: el modelo de ramas y el de releases quedan alineados por diseño, no por casualidad.
- **Fundamento de aprendizaje explícito**: la estrategia de ramas deja de ser tácita.

**A tener en cuenta:**
- **Disciplina de ramas efímeras.** El modelo depende de que las ramas no diverjan de `main` por mucho tiempo; ramas largas reintroducen los problemas que GitFlow tiene y este modelo evita.
- **Revisión en solitario.** Con un solo desarrollador, el PR obligatorio no aporta revisión de pares humana; su valor es el gate de checks automáticos + historial + reversibilidad. La revisión de contexto fresco (agentes) cubre parcialmente el rol de revisor.
- **Trabajo concurrente.** Si se opera más de un flujo de trabajo en paralelo sobre el mismo repositorio (p. ej. dos agentes de IA), el modelo de tronco único requiere aislar cada flujo en su propia rama o *worktree* para evitar colisiones en el árbol de trabajo. (Tema de proceso a decidir por separado.)
- **Si el proyecto pasara a multi-desarrollador** (ADR-023 Topología de Despliegue), conviene revisitar este ADR: GitHub Flow escala a equipos pequeños, pero equipos grandes con releases de soporte prolongado podrían justificar reglas adicionales (aún así, rara vez GitFlow completo).

---

## Referencias

- ADR-030 Versionado y Automatización de Releases — release-please + CD sobre `main` + protección de rama (C.7); la infraestructura que presupone el tronco único
- ADR-020 Git Hooks Husky Monorepo — Conventional Commits; los tipos de commit que nombran también las ramas
- ADR-008 Frontend Stack — monorepo pnpm workspaces; el contexto donde vive el tronco compartido
- ADR-004 Hosting — Render / Vercel / EAS; el CD que despliega desde `main`
- ADR-023 Topología de Despliegue — evolución mono-usuario → multi-cliente; disparador para revisitar esta decisión si el equipo crece

---

*Fecha de propuesta: 2026-07-28*
