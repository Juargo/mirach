# @moneydiary/api

Backend NestJS de MoneyDiary. Arquitectura, convenciones y comandos generales: ver [CLAUDE.md](../../CLAUDE.md) en la raíz del repo.

## Modo mono-usuario (MVP)

El MVP opera **sin autenticación** con un usuario fijo (RF-AUT-001): toda ingesta se asocia server-side a `USER_ID_FIJO`, nunca a un dato del request.

- **Constantes**: `USER_ID_FIJO` y `ACCOUNT_ID_FIJO` viven en `src/infrastructure/persistence/constants.ts` (hardcodeadas a propósito — no son configuración por entorno).
- **Seed**: `prisma/seed.ts` crea el usuario fijo y una cuenta semilla. Es **idempotente** (upsert por id fijo): correrlo N veces produce exactamente un `User` y un `Account`.
- **Cuentas reales**: las cuentas por banco se crean en tiempo de ingesta vía `IAccountRepository.ensure` (upsert); la cuenta semilla solo garantiza un estado inicial consistente.
- **Migración futura**: al introducir autenticación multi-usuario, el punto de corte es el controller (`ingesta.controller.ts`), que hoy inyecta `USER_ID_FIJO`; el resto del pipeline ya recibe `userId` como parámetro.

```bash
# Sembrar el usuario/cuenta fijos (requiere opt-in destructivo, ver abajo)
ALLOW_DESTRUCTIVE_DB=1 pnpm api exec prisma db seed
```

## Seguridad de base de datos (`ALLOW_DESTRUCTIVE_DB`)

Las operaciones destructivas sobre la BD (seed, tests de integración y e2e, que borran filas) exigen el opt-in explícito `ALLOW_DESTRUCTIVE_DB=1` y **rechazan connection strings que parezcan de producción** (`db-safety.ts`). Los scripts `test:integration` y `test:e2e` ya setean el flag; nunca los apuntes a una BD compartida o productiva.

## Tests

```bash
pnpm api test              # unit (sin BD)
pnpm api test:integration  # integración contra BD real de dev
pnpm api test:e2e          # e2e HTTP contra BD real de dev
```
