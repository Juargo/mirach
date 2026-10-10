---
tags:
  - adr
  - fase-diseño
  - auth
  - ios
proyecto: Mirach
estado: ✅ Decidido
fecha_creacion: 2026-10-09
fecha_actualizacion: 2026-10-09
---

# ADR-051 — Cuenta de App Review: login por contraseña solo para un email allowlisted

## Estado

✅ **Decidido** (2026-10-09, product owner). **Enmienda la decisión D1 de ADR-047** ("solo Apple y Google;
el login con contraseña queda dormido"): el login por contraseña deja de estar dormido para todos y pasa a
estar habilitado para **un único email**, configurado por entorno y apagable. El resto de ADR-047 sigue
vigente.

## Contexto

App Review de Apple exige credenciales de demostración para una app con inicio de sesión. La app de
iPhone solo ofrece Sign in with Apple y el revisor no puede usar el Apple ID de otra persona. Una cuenta
creada por el revisor con su propio Apple ID nacería vacía: no vería Resumen, semáforo ni movimientos, y
App Review suele rechazar una app que no puede evaluar.

`POST /api/auth/login` (email y contraseña) sigue existiendo y montado en producción sin flag. ADR-047 D1 lo
dejó dormido porque ningún usuario tiene contraseña; la app de iPhone no tiene formulario para ello.

## Decisión

Opción A: **una única cuenta de revisión con email y contraseña, allowlisted por entorno**.

1. Variable de entorno opcional `REVIEW_LOGIN_EMAIL` (validada como email, `sync: false` en `render.yaml`).
2. `LoginUseCase` recibe el email allowlisted (o `null`) por constructor. El login por contraseña tiene
   éxito **solo** si el email de la petición, normalizado (trim + minúsculas), es igual al allowlisted.
   Con la variable ausente se rechaza todo login por contraseña.
3. Un rechazo por allowlist es indistinguible de las credenciales inválidas de hoy: mismo `401`,
   mismo `code` y mismo mensaje. Sigue exactamente la rama "email desconocido" (misma búsqueda en la base y
   `verificar` contra `HASH_DUMMY_PARA_TIMING`), de modo que no hay oráculo de tiempo ni de respuesta para
   descubrir cuál es el email permitido. El rate limiter por IP y email no cambia.
4. `GET /api/auth/capabilities` agrega `passwordLoginEnabled` (`true` sii `REVIEW_LOGIN_EMAIL` está
   seteada). La app muestra el formulario de contraseña solo cuando es `true`; el valor del email nunca se
   expone.
5. Un script manual de un solo uso (`apps/api/prisma/crear-usuario-revision.ts`) crea o actualiza ese usuario
   con el catálogo y datos de ejemplo cargados por la ingesta real. La contraseña se lee del entorno y nunca
   se registra ni se versiona.
6. Tras la aprobación se apaga quitando `REVIEW_LOGIN_EMAIL` de Render: no hace falta un deploy de código.

## Consecuencias

- El login por contraseña existe en producción para una cuenta, mientras la variable esté puesta. La
  superficie nueva es el endpoint ya existente, con rate limiting, hash argon2 y respuesta uniforme.
- La contraseña de la cuenta de revisión vive en el entorno del dueño y en las notas de App Store Connect,
  nunca en el repositorio ni en los logs.
- La cuenta de revisión es un usuario real de producción con datos ficticios: no debe contarse en métricas.
- ADR-047 D1 queda enmendado: "dormido para todos" pasa a "allowlisted para uno, apagable".

## Alternativas consideradas

- **Apple ID propio con una cuenta vacía.** Descartada: el revisor no puede usar el Apple ID del dueño, y
  una cuenta sin datos no permite evaluar la app.
- **Endpoint oculto con un código de revisión** (que cree o abra una sesión sin contraseña). Descartada:
  agrega una puerta de autenticación nueva, con su propio secreto y su propio código que mantener y
  auditar, en vez de reutilizar el login ya probado.
- **Abrir el login por contraseña a cualquier usuario con contraseña.** Descartada: contradice ADR-047
  (sin registro con contraseña) y amplía la superficie sin necesidad.
