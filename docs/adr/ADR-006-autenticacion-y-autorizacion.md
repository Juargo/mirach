---
tipo: adr
proyecto: Mirach
estado: Propuesto
fecha: 2026-10-24
requisitos: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, RNF-SEC-002, RNF-PRV-001, IMP-24, PLA-01, ADM-02]
---

# ADR-006 — Autenticación y autorización

## Estado

Propuesto (2026-10-24). Inicio de sesión con Apple y Google, sesión opaca, borrado de cuenta
y aislamiento por usuario están desplegados (**vigente**). La sesión renovable, el cierre en
todos los dispositivos, los derechos por plan y el modelo de soporte son **nuevos**.

## Contexto

- AUTH-01 y AUTH-02 piden entrar con Apple o Google, sin contraseña.
- La guía 4.8 de App Store exige Sign in with Apple si se ofrece Google como login
  principal. App Store y Google Play exigen borrar la cuenta desde la app, y Apple exige
  revocar sus tokens al borrarla.
- El usuario principal tiene nivel tecnológico bajo: pedirle iniciar sesión cada semana es
  una causa probable de abandono.
- La v1 tiene dos roles: usuario y administrador interno. Hogares compartidos y asesores
  quedan fuera.
- El plan gratis tiene límites (2 bancos, solo el mes actual, sin perfiles propios).

## Decisión

### Autenticación

1. **Proveedores (vigente).** Sign in with Apple en iPhone y Google en iPhone y Android.
   En Android no se ofrece Apple en la v1 (requeriría un flujo web); esto resuelve la
   decisión pendiente 4 de los requisitos.
2. **Flujo nativo por ID token (vigente).** La app obtiene el ID token con el SDK nativo
   (AuthenticationServices en iOS, Credential Manager en Android) y lo envía a
   `POST /api/auth/apple/token` o `POST /api/auth/google/token`. El API verifica firma
   contra el JWKS del proveedor, `iss`, `aud`, `exp` y, en Apple, el hash del nonce. Toda
   falla de credencial responde el mismo `401` genérico.
3. **Identidad por `sub` (vigente).** La cuenta se identifica por `appleSub` o `googleSub`,
   nunca solo por email. Un email del proveedor se vincula a una cuenta existente solo si
   está verificado y no es un relay privado de Apple, con un guardia que impide tomar una
   cuenta ajena. AUTH-07 (unir Apple y Google por email) queda cubierto por esta regla.
4. **Alta en el primer inicio de sesión (ajuste).** La cuenta se crea al primer login, con
   el catálogo copiado de la plantilla, en la misma transacción. **Nuevo:** la app muestra
   términos y privacidad antes del login y envía la versión aceptada; el API guarda el
   consentimiento en la misma transacción y no crea la cuenta sin él (AUTH-03).
5. **Sesión opaca (vigente).** El API emite un token aleatorio de 256 bits. En la base se
   guarda solo su SHA-256. La app lo envía como `Authorization: Bearer` y lo guarda en el
   Keychain (iOS, accesible solo en este dispositivo tras el primer desbloqueo) o cifrado
   con una llave del Android Keystore.
6. **Duración de la sesión (nuevo, decidido por el product owner el 2026-10-24).** Hoy la
   sesión dura 7 días fijos. Pasa a una **sesión deslizante de 30 días de inactividad con tope absoluto de 180
   días**: cada uso renueva el vencimiento, como máximo una vez al día para no escribir en
   cada petición. Al vencer, la app vuelve a la bienvenida con un toque para entrar.
7. **Cerrar sesión (vigente) y cerrar en todos los dispositivos (nuevo, AUTH-06).**
   `POST /api/auth/logout` borra la sesión actual; `DELETE /api/sesiones` borra todas las
   del usuario.
8. **Borrar la cuenta (vigente).** `DELETE /api/cuenta` con `{"confirmacion":"ELIMINAR"}`
   borra todo en una transacción. Antes intenta revocar el token de Apple con un timeout de
   5 segundos; si falla, el borrado sigue.
9. **Cuenta de revisión de tiendas (vigente).** El login con contraseña existe solo para el
   email de `REVIEW_LOGIN_EMAIL`. Sin esa variable rechaza a todos con el mismo error y el
   mismo tiempo de respuesta.
10. **`x-api-key` no es autenticación (vigente).** Viaja dentro de las apps, así que se
    trata como pública: filtra tráfico casual y permite cerrar el API rotándola. Ningún
    endpoint la usa para identificar a un usuario.

**Por qué sesión opaca y no JWT:** la sesión se revoca en el acto (logout, cerrar en todos
los dispositivos, borrar cuenta) sin listas negras, no hay llaves de firma que rotar, y una
búsqueda por índice único por petición es barata con esta carga.

### Autorización

1. **Propiedad del recurso (vigente).** Todo recurso pertenece a un usuario. Los
   repositorios reciben el `userId` de la sesión y lo incluyen en cada consulta; nunca se
   trae de más para filtrar en memoria (RNF-SEC-002). Un recurso de otro usuario responde
   `404`, para no revelar que existe. Cada endpoint con datos de usuario tiene un test de
   integración de aislamiento.
2. **Derechos por plan (nuevo).** Gratis, prueba y Plus se verifican **en el caso de uso
   del servidor**, nunca solo en la interfaz:

   | Derecho | Gratis | Prueba / Plus |
   |---------|--------|---------------|
   | Bancos distintos con cartolas | 2 (IMP-24) | 4 |
   | Meses visibles | Mes actual | Historial |
   | Perfiles | Predefinidos | Predefinidos y propio |
   | Crear y editar categorías y patrones desde Ajustes | No (CLA-09) | Sí |
   | Reclasificar, registro manual, exportar | Sí | Sí |

   El plan sale de la tabla `Suscripcion`, sincronizada por webhook (ADR-012). Al vencer el
   plan no se borra nada; solo se aplican los límites (PLA-07). Los límites viven en
   configuración servida por `GET /api/config` (PLA-08).
3. **Administrador interno (nuevo).** En la v1 no hay endpoints de administración en el API
   público ni panel web:
   - Las métricas agregadas (ADM-01) salen de vistas SQL sobre eventos y conteos, sin datos
     individuales (ADR-011).
   - El soporte de una cuenta (ADM-02) usa un script con acceso de solo lectura que muestra
     plan, última ingesta y errores, nunca movimientos. El script no descifra campos y
     registra cada uso en `AccesoSoporte`.
   - Si aparece un panel web, se crea un rol `admin` con autenticación propia y un ADR nuevo;
     las piezas web dormidas del API son el punto de partida.
4. **Roles futuros.** Hogar compartido (titular y miembro) y asesor o empleador quedan fuera.
   Cuando entren, el recurso "presupuesto" pasará a tener membresías y este ADR se
   reemplaza.

### Límites de tasa

| Ruta | Límite |
|------|--------|
| Login con contraseña de revisión | 5 por email y 20 por IP cada 15 minutos (vigente) |
| Rutas de token nativo | Por IP (nuevo) |
| Vista previa de cartola | 20 por usuario por hora (nuevo) |
| Resto de `/api` | Límite general por usuario (nuevo) |

## Alternativas consideradas

| Alternativa | Por qué no |
|-------------|------------|
| Supabase Auth, Auth0, Clerk o Firebase Auth | Otro proveedor con datos personales y otra dependencia; el flujo nativo por ID token ya está construido y probado. |
| Email y contraseña | Exige verificación y recuperación por correo; AUTH-01 y AUTH-02 piden entrar sin contraseña. |
| JWT de acceso con refresh token | Revocar exige listas negras o vidas cortas con refresh; la sesión opaca resuelve lo mismo con menos piezas. |
| Sesión fija de 7 días | Obliga a un usuario de nivel tecnológico bajo a entrar cada semana. |
| Apple también en Android | Requiere flujo web y configuración extra para pocos usuarios en la v1. |
| Panel de administración web en la v1 | Superficie de ataque y trabajo que no aporta a validar el producto. |

## Consecuencias

- La renovación deslizante agrega una escritura diaria por usuario activo; es despreciable.
- Un teléfono robado y desbloqueado mantiene la sesión hasta 30 días sin uso; el usuario
  puede cortarla con "cerrar sesión en todos los dispositivos" desde otro equipo. Un
  bloqueo con Face ID o huella queda como mejora posterior.
- Rotar `x-api-key` obliga a publicar versiones nuevas de las apps.
- Los derechos por plan se prueban como reglas de negocio, con tests de dominio y de
  integración.

## Referencias

- ADR-004 Persistencia
- ADR-009 Seguridad
- ADR-012 Suscripciones
- App Store Review Guidelines 4.8 y 5.1.1(v); política de borrado de cuentas de Google Play
- Serie anterior: ADR-034, ADR-035, ADR-041, ADR-047, ADR-049, ADR-051, ADR-052
