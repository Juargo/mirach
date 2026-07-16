---
name: solid
description: Al diseñar límites de módulos, interfaces o jerarquías para arquitectura mantenible en MoneyDiary. Usar cuando se diga "cómo estructuro esto", "muy acoplado", "difícil de testear", "dependency injection", "single responsibility", "diseño de interfaz/port", o al crear un nuevo use case, port o adapter.
metadata:
  version: 1.0.0
---

# Principios SOLID — MoneyDiary

> Adaptado de [JordanCoin/codingskills](https://github.com/JordanCoin/codingskills) (MIT) al contexto de MoneyDiary: Clean Architecture (ADR-005), `Result<T,E>`, dominio en español.

## Contexto del proyecto

La regla de dependencias `domain ← application ← infrastructure` **ya materializa DIP y gran parte de SOLID**. Esta skill sirve para sostenerla al escribir código nuevo y para detectar violaciones en review.

---

### S — Responsabilidad Única (SRP)

**Un módulo debe tener una sola razón para cambiar.**

Cómo se ve en este repo:
- Cada use case hace **una** cosa: `detect-bank.use-case.ts` detecta, `validate-structure.use-case.ts` valida. La orquestación vive aparte (`process-ingesta.use-case.ts`).
- Cada VO encapsula una regla: `PeriodoMes` no sabe de HTTP; `PatronClasificacion.coincide()` no sabe de Prisma.

Violaciones a rechazar:
- Un use case que valida + persiste + formatea respuesta HTTP.
- Meter lógica de negocio en un controller o en un repositorio Prisma.
- Archivos "utils"/"helpers" que crecen sin dueño claro (lo transversal justificado va a `shared/`).

### O — Abierto/Cerrado (OCP)

**Extender sin modificar lo que ya funciona.**

Cómo se ve en este repo:
- **Agregar un banco nuevo = nueva strategy** en `infrastructure/excel/strategies/` que implementa `EstructuraBanco` + su patrón de detección. El detector y el pipeline **no se tocan**.
- Agregar un tipo de patrón de clasificación (`CONTAINS`/`STARTS_WITH`/`REGEX`) extiende el VO, no los consumidores.

Violación a rechazar: un `switch (banco)` creciente en el detector o el normalizador.

### L — Sustitución de Liskov (LSP)

**Toda implementación de un port debe ser intercambiable sin sorpresas.**

Cómo se ve en este repo:
- `MulterFileReader` (HTTP) y `FsFileReader` (CLI) implementan `IFileReader` y el use case no distingue cuál recibe.
- `NoOpCryptoService` es válido justamente porque cumple el contrato de `ICryptoService` (identidad) — el día que llegue el cifrado real (11.6), nada más cambia.

Violaciones a rechazar: `instanceof` sobre un port para decidir comportamiento; una strategy que lanza "no implementado" para parte de su contrato.

### I — Segregación de Interfaces (ISP)

**Ningún consumidor depende de métodos que no usa.**

Cómo se ve en este repo:
- Ports separados por rol: `IIngestaRepository`, `ITransaccionRepository`, `IAccountRepository`, `IMovimientosMesPort` — no un "IRepository" gigante.

Señal de alerta: si el mock de un test debe stubbear 10 métodos para ejercitar 2, el port es demasiado ancho — dividirlo.

### D — Inversión de Dependencias (DIP)

**La regla de oro del repo: `domain ← application ← infrastructure`, nunca al revés.**

- Los ports (interfaces) viven en `application/ports/`; los adapters (Prisma, ExcelJS, HTTP) en `infrastructure/`.
- El wiring se hace en el composition root (`IngestaModule`, tokens + `useFactory` tipados) — nunca `new PrismaClient()` dentro de un use case.
- Domain y application **no importan** de NestJS, Prisma ni ExcelJS. Si un test de dominio necesita levantar infraestructura, hay una violación.

---

## Límites (no sobre-aplicar)

- **SOLID son heurísticas, no leyes.** Scripts de seed, fixtures y CLI de apoyo no necesitan el tratamiento completo.
- **No sobre-abstraer** (tensión con `yagni`): un port se justifica cuando cruza el límite application/infrastructure o habilita testabilidad real — no crear interfaces "por si acaso" dentro de una misma capa.
- **Frontend/mobile:** la lógica pura de `apps/mobile/src/domain/` (view-model, formateo, geometría) sigue SRP/DIP sin necesitar ports formales — funciones puras bastan.

## Checklist de review (complementa el checklist de seguridad de ADR-015)

- [ ] ¿La regla de dependencias se respeta? (ningún import de infra en domain/application)
- [ ] ¿Cada use case/VO tiene una única responsabilidad nombrable?
- [ ] ¿Un banco/patrón/adapter nuevo entra sin modificar código existente que funciona?
- [ ] ¿Los ports son pequeños y por rol? ¿Los mocks de los tests son fáciles de escribir?
- [ ] ¿Podrías cambiar Prisma/ExcelJS/Render sin tocar domain ni application?
- [ ] ¿Errores vía `Result<T,E>` en domain/application (nunca throw)?

## Skills relacionadas

- **yagni**: para no sobre-aplicar SOLID con abstracciones prematuras
- **kiss**: cuando la indirección cuesta más que lo que aporta
- **dry**: para reglas de negocio con fuente única
