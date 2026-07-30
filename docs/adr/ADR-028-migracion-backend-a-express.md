---
tags:
  - adr
  - fase-diseño
  - backend
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-23
fecha_actualizacion: 2026-07-23
supersede: ADR-001
---

# ADR-028 — Migración del Backend de NestJS a Express

## Estado

✅ **Decidido** — **supersede a ADR-001 Backend Framework** en cuanto al framework. El lenguaje (TypeScript sobre Node.js) y la arquitectura (ADR-005 Monolito-Modular-Clean-Architecture) se mantienen sin cambios. El ORM (ADR-002 Base de Datos, Prisma) queda **fuera de alcance**: esta decisión cambia el framework HTTP, no la persistencia.

✅ **Implementado** — migración completa (10 slices TDD) mergeada a `main` y deployada en prod vía Render (PR #109, 2026-07-24). `domain`/`application` sin cambios (el aislamiento de ADR-005 Monolito-Modular-Clean-Architecture lo permitió).

---

## Contexto

ADR-001 Backend Framework eligió NestJS con un argumento explícito y honesto: **valor pedagógico**. La cita textual de ese ADR: *"NestJS se elige conscientemente por su valor de aprendizaje: sus patrones (módulos, servicios, controladores, DTOs) son los que se estudian formalmente en ingeniería de software"*. El propio ADR-001 reconoció el riesgo en su nota de sobreingeniería: *"Puede sentirse como sobreingeniería para un proyecto personal"*.

Ese riesgo se materializó. Después de 9 sprints, el balance pedagógico se invirtió:

- La **inyección de dependencias mágica** de Nest (providers, tokens, `useFactory`, `@Injectable`) esconde lo que debería enseñar. El grafo de dependencias no se lee en un lugar: está disuelto en 7 módulos `@Module`. El desarrollador cablea el sistema sin ver cómo se cablea.
- Los **decoradores y la metadata por reflexión** obligaron a peaje de tooling ajeno al aprendizaje: ADR-016 Testing Framework Vitest tuvo que meter SWC (`unplugin-swc`, `oxc:false`) *solo* para que Vitest entendiera la metadata de decoradores de Nest. Se configura infraestructura para servir al framework, no al proyecto.
- Nest resuelve por vos cosas que —para aprender— conviene resolver a mano: routing, middleware, manejo de errores, ciclo de vida. Cada "batería incluida" es un fundamento que no se practica.

**La meta primaria del proyecto es el aprendizaje de ingeniería de software** (declarada en ADR-001 y en el `CLAUDE.md` del repo). Cuando el framework elegido *para aprender* pasa a *tapar* los fundamentos, la premisa de ADR-001 deja de sostenerse. Esta es una decisión de aprendizaje, tomada de forma deliberada **independientemente del esfuerzo de migración**.

**Habilitador arquitectónico (dato clave):** la migración es viable y de bajo riesgo estructural porque ADR-005 Monolito-Modular-Clean-Architecture ya aisló el framework. Auditoría del código al momento de esta decisión:

| Chequeo | Resultado |
|---|---|
| Imports de `@nestjs`/`@prisma` en `domain/` | **0** |
| Imports de `@nestjs`/`@prisma` en `application/` | **0** |
| Tipos de Prisma (`Prisma.*`, `Decimal`) en el core | **0** |
| `@Injectable`/`@Inject` en use cases | **0** — clases planas, instanciadas con `new` vía `useFactory` |
| Ports que devuelven formas de framework | **0** — devuelven `Result<T,E>`, entidades de dominio y rows planos |

NestJS solo vive en `infrastructure/http/` (controllers + módulos) y en el cableado. El dominio y la application **no se enteran de que existe**. Esto es exactamente lo que Clean Architecture promete, y esta migración es su cobro.

---

## Opciones evaluadas

### Opción A — Quedarse en NestJS
✅ Cero trabajo de migración. Patrones "de equipo real".
❌ Perpetúa el problema pedagógico que motiva este ADR: la magia sigue tapando fundamentos.
❌ Mantiene el peaje de SWC para decoradores y el wiring disuelto en módulos.

### Opción B — Fastify
✅ Más liviano que Nest, TypeScript first-class.
❌ Sigue siendo un framework con su propio sistema de plugins/hooks que abstrae el ciclo de request. No maximiza la exposición a fundamentos.
❌ Ecosistema más chico; menos material de aprendizaje que Express.

### Opción C — Express + TypeScript ✅ (elegida)
Framework minimalista. El desarrollador escribe el routing, el middleware, el manejo de errores y el **composition root manual** con sus propias manos.
✅ Máxima exposición a fundamentos: request/response, middleware chain, DI a mano, mapeo error→HTTP explícito.
✅ La Clean Architecture se vuelve **más visible**, no menos: sin la DI de Nest, el `container.ts` pasa a ser un composition root real y legible de un vistazo.
✅ TypeScript en modo estricto aporta la seguridad de tipos que en ADR-001 se le atribuía a Nest — sin acoplar el dominio a un framework.
✅ Ecosistema enorme, material de aprendizaje abundante.
❌ Hay que reimplementar a mano lo que Nest daba gratis (ver Consecuencias). Se acepta: ese trabajo **es** el aprendizaje.

> [!note] Reencuadre respecto a ADR-001
> ADR-001 descartó Express con el argumento *"total libertad = responsabilidad total de definir la arquitectura… fácil de crear código desorganizado sin experiencia en backend"*. Ese argumento **ya no aplica**: la arquitectura ya está definida y probada (ADR-005, 9 sprints). La estructura la da la Clean Architecture, no el framework. Express aporta libertad sobre el *transporte HTTP*, no sobre la organización del sistema — que permanece.

---

## Decisión

**Reemplazar NestJS por Express + TypeScript (modo estricto) en `apps/api`.**

Alcance de la migración, confinado a `infrastructure/` y a la raíz de composición:

- **Controllers Nest → handlers Express.** Cada `@Controller`/`@Get` pasa a ser una función `(req, res)` que extrae params, delega en el use case y traduce `Result<T,E>` a HTTP. La lógica de traducción ya existe; cambia el envoltorio.
- **Módulos `@Module` → composition root real.** El `composition/container.ts` (hoy un placeholder `export {}`) pasa a ensamblar el grafo completo con `new`, framework-agnóstico. Un solo archivo describe cómo se arma el sistema. Los 7 módulos Nest desaparecen.
- **Guards Nest → middleware Express.** `ApiKeyGuard` (global, fail-closed) y `SessionGuard` (por-usuario, ISO-01/02) se reescriben como middleware. El `userId` derivado de la sesión se adjunta al `req` en vez de resolverse vía `@CurrentUser()`.
- **`ExceptionFilter`/`HttpException` → error-handling middleware.** El mapeo error de dominio → status HTTP (400 scrub, 401, 500) se centraliza en un handler de errores de Express.
- **Ciclo de vida de Prisma → el container.** `PrismaService` deja de depender de `OnModuleInit`/`OnModuleDestroy`; el `$connect`/`$disconnect` los maneja el composition root y los invoca el arranque/apagado del server.

Lo que **NO** cambia (y esa es la prueba de la decisión):

- `domain/` — **0 cambios**.
- `application/` (use cases + ports) — **0 cambios**.
- Prisma como ORM (ADR-002 Base de Datos) — se mantiene.
- El esquema HTTP externo (rutas, DTOs, contrato) — idéntico; los clientes web/mobile no se enteran (ADR-024 Arquitectura de Clientes, contract-first).

---

## Consecuencias

**Positivas:**
- **Los fundamentos quedan expuestos**: routing, middleware, DI manual, ciclo de vida y mapeo error→HTTP se practican a mano. Ese era el objetivo original de ADR-001, ahora cumplido de verdad.
- **La Clean Architecture se hace legible**: el composition root real convierte "¿cómo se arma esto?" de imposible a un archivo. La migración *demuestra* el valor de ADR-005 — que domain/application no se toquen es la evidencia de que el aislamiento funcionó.
- **Se elimina el peaje de SWC-por-decoradores**: sin metadata de decoradores, la config de test de la API se simplifica (ADR-016 Testing Framework Vitest se puede aligerar en el lado backend).
- **TypeScript estricto** sigue dando la seguridad de tipos en la app financiera, sin acoplar el dominio a un framework.

**A tener en cuenta:**
- **Hay que reimplementar las "baterías" de Nest**: validación de entrada, guards (auth), inyección, lifecycle, filtros de excepción. Es trabajo real y es el punto de mayor riesgo de regresión — sobre todo **`ApiKeyGuard` + `SessionGuard`** (superficie de seguridad, RNF-SEC-006, ISO-01/02). El checklist de verificación (aislamiento por `user_id` por integración, control de acceso) debe re-correrse completo tras la migración.
- **Los tests e2e/integración de HTTP se reescriben** (hoy usan `@nestjs/testing`). Los tests de dominio/application **no se tocan** — corren igual.
- **Migración grande de una sola superficie**: aunque confinada a `infrastructure/http` + composición, toca todos los endpoints. Conviene planificarla como su propio change SDD, endpoint por endpoint, con review de contexto fresco por slice (patrón ya usado en Sprints 6/8/9).
- **Prisma bajo revisión futura, no ahora**: si más adelante se decide reemplazar el ORM, será un ADR aparte; los ports de persistencia ya lo permiten sin tocar el core.
- **Despliegue en Render** (ADR-004 Hosting): el build pasa de `dist/main.js` de Nest a un entrypoint Express; el `render.yaml`/start command se ajusta. Sin cambio de plataforma.

---

## Referencias

- ADR-001 Backend Framework — **superseída por este ADR** en cuanto al framework; su premisa de "Nest por aprendizaje" se reevalúa
- ADR-005 Monolito-Modular-Clean-Architecture — el aislamiento que hace esta migración viable; permanece intacta
- ADR-002 Base de Datos — Prisma se mantiene; fuera de alcance de este ADR
- ADR-004 Hosting — Render; ajuste de entrypoint/build, sin cambio de plataforma
- ADR-015 Técnicas de Verificación de Requisitos — el checklist de acceso/aislamiento se re-corre tras migrar guards a middleware
- ADR-016 Testing Framework Vitest — se aligera al desaparecer la metadata de decoradores
- ADR-024 Arquitectura de Clientes — contract-first: los clientes no se enteran del cambio de framework

---

*Fecha de decisión: 2026-07-23*
