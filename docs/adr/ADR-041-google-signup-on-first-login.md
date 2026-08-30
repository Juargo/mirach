---
tags:
  - adr
  - fase-diseño
  - auth
  - backend
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-08-30
fecha_actualizacion: 2026-08-30
---

# ADR-041 — Login con Google crea la cuenta al primer ingreso (signup-on-first-login)

## Estado

✅ **Decidido** (2026-08-30, decisión de producto del owner tras observar rechazos `sin-match` reales en producción).

> [!info] Relación con ADR-034 y ADR-035
> Este ADR **supersede SOLO la regla "solo ingreso, sin registro" de ADR-034** (su
> Decisión, regla de vinculación por primera vez: "sin match ⇒ error genérico, no se
> crea usuario"). Todo lo demás de ADR-034 sigue vigente sin cambios: flujo OIDC
> Authorization Code + PKCE terminado en `apps/api`, gate duro de `email_verified`,
> vinculación por `emailBlindIndex`, guarda ★ anti-takeover (un email ya vinculado a
> OTRO `googleSub` jamás se re-vincula), emisión de la misma sesión `md_session`, gates
> de usuario demo y disciplina AUTH-15 de no-enumeración. ADR-035 (mobile token
> exchange) no se toca: su endpoint reutiliza el MISMO `LoginConGoogleUseCase`, por lo
> que mobile gana el signup automáticamente, sin cambio de código propio.
>
> Mismo patrón de enmienda que ADR-038 → ADR-026: el ADR viejo no se edita; la relación
> se declara acá y en el índice.

---

## Contexto

ADR-034 fijó el login con Google como **find-only**: una identidad Google verificada sin
usuario existente que matchee por `googleSub` ni por `emailBlindIndex` terminaba en
`/login?error=google` (`motivo: 'sin-match'`, solo server-side). Esa regla era coherente
con el topology mono-usuario de la época (ADR-023).

En producción (2026-08-30) se observaron rechazos `sin-match` de personas reales
intentando entrar con Google. La decisión de producto es abrir el ingreso: MoneyDiary
pasa a ser multi-usuario con onboarding vía Google.

## Decisión

1. **Signup-on-first-login**: en `LoginConGoogleUseCase`, la rama sin match por
   `googleSub` ni por email deja de fallar y **crea la cuenta**: fila `User` con email
   cifrado (AES-GCM, ADR-013) + `emailBlindIndex`, `googleSub` ya vinculado,
   `passwordHash` **NULL** (usuario passwordless: el login por contraseña ya colapsa
   NULL a credenciales inválidas sin enumeración), `nombre` derivado de la parte local
   del email normalizado (la identidad OIDC de este flujo no pide el claim `name` y NO
   se amplía el scope; el usuario puede corregirlo vía `PATCH /api/perfil`, ADR-038).
2. **Catálogo en la misma transacción** (invariante ADR-036): la creación materializa
   `Categoria` + `PatronClasificacion` desde `catalogo-template.ts` con la MISMA
   mecánica de `PrismaDemoRepository` (`copiarCatalogoTemplate` dentro del
   `$transaction`); si la copia falla, el rollback incluye al usuario. La `Session` va
   FUERA de la transacción (a diferencia del demo): un usuario creado sin sesión es
   benigno y auto-reparable — el siguiente intento resuelve por `googleSub`.
3. **Carrera de creación**: `P2002` (unicidad de `emailBlindIndex` o `googleSub`)
   resuelve a "carrera perdida" — se re-resuelve UNA vez por `googleSub` (doble submit
   de la misma identidad ⇒ sesión sobre la fila ganadora); cualquier otro resultado
   colapsa al error genérico (`motivo: 'creacion-perdio-la-carrera'`). El motivo
   `'sin-match'` se retira de la unión (rama inalcanzable).
4. **Gates intactos**: `email_verified` sigue siendo condición previa a crear; demo y
   guarda ★ no cambian; ninguna rama nueva altera el mensaje único de AUTH-15.
5. **Alcance**: web (callback OIDC) y mobile (`POST /api/auth/google/token`, ADR-035)
   — ambos comparten el use case. No hay registro por email+contraseña: la única
   puerta de autoregistro es Google.

## Consecuencias

- **El registro queda abierto**: cualquier cuenta Google verificada que alcance
  `app.moneydiary.cl` (o el endpoint mobile con `x-api-key`) crea una cuenta real con
  catálogo propio. Costo asumido conscientemente por el owner (free tier de Supabase,
  ADR-023); mitigable a futuro con allowlist o invitaciones si se abusa.
- Usuarios auto-creados no tienen contraseña: su único método de acceso es Google
  (el invariante "nunca sin método de acceso" de la desvinculación, US-041/VINC, ya
  protege contra quitarles el `googleSub`).
- `sin-match` deja de existir como motivo de log; los dashboards/queries que lo
  buscaban deben mirar `creacion-perdio-la-carrera` (rareza esperada: solo carreras).
- **Interacción con el rate limiter mobile (hallazgo CRITICAL de revisión, resuelto en el
  mismo change):** `POST /api/auth/google/token` reseteaba `googleTokenRateLimiter` en TODO
  éxito (mismo patrón que `/auth/login`, diseñado cuando "éxito" solo podía ser un login).
  Post-ADR-041 un signup también es un `Result.ok` — resetear igual habría permitido crear
  cuentas sin límite desde un único IP (cada alta reseteando su propio presupuesto).
  Resuelto extendiendo el resultado del use case con `esNuevoUsuario: boolean` (server-side
  únicamente, nunca serializado — AUTH-15 intacto): `POST /api/auth/google/token` solo
  resetea cuando `esNuevoUsuario === false` (login de un usuario pre-existente); un signup
  deja el `recordFailure` optimista contado, capando las creaciones al presupuesto del
  limiter por IP (paridad con el tope natural del flujo web, que nunca resetea). El
  callback web no se ve afectado — nunca reseteó ningún limiter.
