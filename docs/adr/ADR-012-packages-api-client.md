---
tags:
  - adr
  - fase-diseño
  - contrato
  - frontend
  - toolchain
proyecto: MoneyDiary
estado: ✅ Decidido (mecánica de origen desactualizada, ver nota 2026-08-02)
fecha_creacion: 2026-07-02
fecha_actualizacion: 2026-08-02
---

# ADR-012 — `packages/api-client`: cliente HTTP agnóstico de plataforma

## Estado

✅ **Decidido**

Reemplaza parcialmente a ADR-008 Frontend Stack (decisión *"no se crea un `packages/shared` ni equivalente"*). Este ADR introduce el primer —y deliberadamente único— paquete compartido del monorepo. Depende de ADR-011 Contrato-first OpenAPI.

> **Nota 2026-08-02:** ADR-028 eliminó NestJS (migración a Express), por lo que la mecánica de origen del `openapi.json` que este ADR asume — emitido vía `@nestjs/swagger` — está **desactualizada**. ADR-011 Contrato-first OpenAPI fue enmendado el mismo día para documentar el mecanismo vigente (Zod + `zod-openapi@5.4.2`, OpenAPI 3.1.0). La **decisión central de este ADR-012 no cambia** (`packages/api-client` sigue siendo el diseño previsto para el consumo agnóstico de plataforma), pero **`packages/api-client` sigue SIN construirse** — es deuda técnica pendiente rastreada, no bloqueada por nada distinto a priorización. Cuando se construya, debe alimentarse del `apps/api/openapi.json` que emite el mecanismo Zod, no del mecanismo NestJS descrito abajo.

---

## Contexto

ADR-011 Contrato-first OpenAPI establece que el contrato HTTP se emite como `openapi.json` desde el backend. Falta decidir **cómo consumen ese contrato** los frontends. El ADR-010 App Mobile agrega una segunda plataforma (React Native), así que la pregunta es: ¿cada frontend genera y envuelve sus propios tipos y cliente HTTP, o existe una capa compartida?

El ADR-008 Frontend Stack había decidido explícitamente **no** tener `packages/shared`, con una razón sólida: compartir las *entities del dominio* rompería la dirección de dependencias de ADR-005 Monolito-Modular-Clean-Architecture. Esa razón **sigue siendo válida** — pero no aplica a lo que se comparte aquí. Lo que se comparte no es el dominio: es el **contrato HTTP** (tipos generados + cliente + manejo de errores), que es precisamente el borde neutro entre backend y frontends. El dominio backend nunca cruza esta frontera.

El desafío técnico central: web (React 19 + Vite, entorno DOM) y mobile (React Native + Expo, sin DOM) **no comparten APIs de plataforma**. En particular, el **almacenamiento del token de sesión** es distinto:

- Web → `localStorage` / cookies
- Mobile → `expo-secure-store` (almacenamiento cifrado del dispositivo)

Si el cliente HTTP importara `localStorage` directamente, sería inutilizable en React Native. Necesita ser **agnóstico de plataforma**: no puede importar nada específico de DOM ni de RN.

**Principio rector:** el `api-client` recibe sus dependencias de plataforma por **inyección de dependencias**, no las importa. Es el mismo patrón que el dominio del backend, que no conoce a Prisma sino que recibe un puerto. Coherencia arquitectónica de punta a punta.

---

## Opciones Evaluadas

### Opción A — Cada frontend genera y envuelve su propio cliente

`apps/web` y `apps/mobile` corren `openapi-typescript` por separado y cada uno escribe su wrapper de `fetch`, interceptores y manejo de errores.

✅ Sin paquete compartido nuevo — mantiene la estructura del ADR-008 literalmente.
❌ **Duplica** la lógica no trivial (interceptores, refresh de token, mapeo de errores HTTP a tipos) en dos plataformas.
❌ Dos configuraciones de codegen que pueden divergir.
❌ Un bug en el manejo de errores se arregla dos veces.

### Opción B — `packages/api-client` compartido y agnóstico de plataforma ✅ (elegida)

Un único paquete `@moneydiary/api-client` que contiene: tipos generados, cliente `openapi-fetch` con interceptores, interfaz `TokenStorage` (inyectada, sin implementación), y mapeo de errores. Web y mobile lo importan y le pasan su propia implementación de `TokenStorage`.

✅ **Una sola vez** la lógica de cliente, interceptores y errores.
✅ **Agnóstico de plataforma real:** no importa `localStorage` ni `expo-secure-store` — los recibe por DI vía `TokenStorage`.
✅ El codegen de tipos vive en un solo lugar, alimentado por el `openapi.json` de ADR-011 Contrato-first OpenAPI.
✅ La frontera es nítida: se comparte **el contrato**, nunca componentes UI, estilos ni hooks de pantalla.
⚠️ Introduce el primer paquete compartido → obliga a resolver build/orden del monorepo.

### Opción C — Cliente compartido pero acoplado a una plataforma

Un paquete compartido que asume un mecanismo de storage concreto (ej. siempre `localStorage`).

✅ Menos abstracción que la Opción B.
❌ **Inutilizable en React Native** — `localStorage` no existe en RN. Rompería mobile de entrada.
❌ Viola el principio de agnosticismo que es el corazón de esta decisión.

---

## Decisión

**Se crea `packages/api-client` (`@moneydiary/api-client`): un paquete workspace, agnóstico de plataforma (sin DOM, sin React Native), que expone un cliente HTTP tipado a partir del `openapi.json`. Recibe el almacenamiento de token por inyección de dependencias mediante la interfaz `TokenStorage`.**

### Estructura del paquete

```
packages/api-client/
├── openapi.json          ← artefacto commiteado (emitido por apps/api, ADR-011)
├── src/
│   ├── types.gen.ts      ← generado por openapi-typescript · NO editar
│   ├── client.ts         ← openapi-fetch + interceptores (auth, errores)
│   ├── auth.ts           ← interface TokenStorage (contrato de DI, sin impl.)
│   ├── errors.ts         ← HTTP status → union discriminada de errores
│   └── index.ts          ← superficie pública del paquete
├── package.json          ← name: @moneydiary/api-client
└── tsconfig.json
```

### `TokenStorage` — el puerto de almacenamiento (sin implementación)

```typescript
// src/auth.ts
export interface TokenStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}
```

> La firma es **async** a propósito: `expo-secure-store` es asíncrono en mobile. Un storage síncrono (localStorage) se adapta trivialmente envolviéndolo en `Promise.resolve`.

### Factory pública

```typescript
// src/index.ts
export function createApiClient(opts: {
  baseUrl: string;
  storage: TokenStorage;
}): ApiClient { /* ... */ }

export type { TokenStorage } from './auth';
export type { ApiError } from './errors';
export type { paths, components } from './types.gen';
```

### Interceptores (`client.ts`)

`openapi-fetch` con middleware:

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './types.gen';

export function createApiClient({ baseUrl, storage }: /* ... */) {
  const client = createClient<paths>({ baseUrl });

  client.use({
    async onRequest({ request }) {
      const token = await storage.getToken();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },
    async onResponse({ response }) {
      if (response.status === 401) await storage.clearToken();
      return response;
    },
  });

  return client;
}
```

> El refresh de token concreto (cómo se obtiene un token nuevo) depende de la estrategia de auth, que se decide en un ADR posterior. Aquí solo se define **dónde** se engancha (`onRequest`/`onResponse`) y **cómo** se accede al storage (por DI).

### `errors.ts` — union discriminada

Los errores HTTP se mapean a tipos discriminados por `kind`, para que los consumidores hagan pattern-matching exhaustivo:

```typescript
// src/errors.ts
export type ApiError =
  | { kind: 'validation'; status: 400; issues: FieldIssue[] }
  | { kind: 'unauthorized'; status: 401 }
  | { kind: 'not_found'; status: 404 }
  | { kind: 'server'; status: 500; message: string }
  | { kind: 'network'; cause: unknown };
```

### Cómo lo consume cada plataforma

```typescript
// apps/web/src/api/storage.ts
export const webStorage: TokenStorage = {
  getToken: async () => localStorage.getItem('md_token'),
  setToken: async (t) => localStorage.setItem('md_token', t),
  clearToken: async () => localStorage.removeItem('md_token'),
};

// apps/web/src/api/client.ts
export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL, storage: webStorage });
```

```typescript
// apps/mobile/src/api/storage.ts
import * as SecureStore from 'expo-secure-store';
export const mobileStorage: TokenStorage = {
  getToken: () => SecureStore.getItemAsync('md_token'),
  setToken: (t) => SecureStore.setItemAsync('md_token', t),
  clearToken: () => SecureStore.deleteItemAsync('md_token'),
};
```

### Regeneración de tipos

```json
// packages/api-client/package.json
{
  "scripts": {
    "generate": "openapi-typescript ./openapi.json -o ./src/types.gen.ts",
    "build": "tsup src/index.ts --format esm,cjs --dts",
    "typecheck": "tsc --noEmit"
  }
}
```

- **`types.gen.ts` es generado — nunca se edita a mano** (mismo criterio que `routeTree.gen.ts` en web).
- Está en `.gitignore`; se regenera desde `openapi.json` (que sí está commiteado).
- Build con `tsup` (esm + cjs + `.d.ts`) para que web (Vite/ESM) y mobile (Metro) lo consuman sin fricción.

### Frontera explícita

```
web  ◄──────────────────────────────────────►  mobile
     ✗  NO comparten componentes UI
     ✗  NO comparten estilos (Tailwind vs NativeWind)
     ✗  NO comparten hooks de pantalla
     ✓  SÍ comparten @moneydiary/api-client (el contrato HTTP)
```

Web y mobile son **hermanas, no gemelas**: comparten el contrato y nada más. Esa frontera es lo que evita el pantano de "¿por qué este componente anda en web pero no en mobile?".

---

## Consecuencias

**Positivas:**
- La lógica de cliente, interceptores y mapeo de errores se escribe y se testea **una sola vez**.
- **Agnóstico de plataforma real:** el mismo paquete corre en Vite y en Metro/RN sin `#ifdef`s ni ramas por entorno, porque toda dependencia de plataforma entra por `TokenStorage`.
- Coherencia arquitectónica: mismo patrón de puertos/DI que el backend, ahora en el borde del frontend.
- Frontera de responsabilidad nítida — se comparte el contrato, no la UI. Reduce el acoplamiento accidental entre plataformas.
- Un tercer consumidor futuro (CLI, otra app) reutiliza el cliente pasando su propio `TokenStorage`.

**A tener en cuenta:**
- **Primer paquete compartido del monorepo** → hay que declarar `@moneydiary/api-client` como dependencia workspace en `apps/web` y `apps/mobile`, y resolver el **orden de build** (`api emit → api-client generate/build → web/mobile`). Con la resolución aislada de pnpm, cada app declara la dep explícitamente.
- **`tsup` como dependencia nueva de build** en el paquete — cubierta por `pnpm audit` y `minimum-release-age` (ADR-006 Package Manager).
- **El refresh de token no está resuelto aquí:** los interceptores dejan el gancho, pero la lógica concreta depende de la estrategia de auth (ADR futuro). Hasta entonces, un 401 solo limpia el token.
- **React Native y `fetch`:** RN trae `fetch` global, pero hay diferencias sutiles (streaming, `FormData`). El cliente se prueba en ambos entornos antes de dar por cerrada la portabilidad.
- **Versionado interno:** al no publicarse a npm, `@moneydiary/api-client` se versiona con el monorepo (workspace protocol `workspace:*`), sin release independiente.

---

## No incluido en este ADR (decisiones futuras)

- **Orquestador de monorepo (Turborepo):** con el grafo `api emit → api-client generate → {web, mobile} typecheck`, un orquestador con cache de tasks empieza a justificar su costo (el ADR-008 ya lo dejó como "se podría incorporar más adelante"). **Recomendación:** adoptarlo cuando el encadenamiento manual de scripts se vuelva molesto o CI se ponga lento — no antes. Por ahora, scripts pnpm encadenados alcanzan.
- **Estrategia de autenticación:** proveedor de identidad, emisión y refresh de token, expiración. Este ADR solo define el puerto `TokenStorage` y los ganchos de interceptor.
- **Publicación a npm:** el paquete es interno (`workspace:*`). Si en el futuro se quiere consumir desde fuera del monorepo, se reevalúa publicarlo.
- **Reintentos / backoff / offline queue:** políticas de resiliencia de red (especialmente relevantes en mobile) se definen cuando aparezca el requerimiento.

---

## Referencias

- ADR-005 Monolito-Modular-Clean-Architecture — patrón de puertos/DI que este ADR replica en el frontend
- ADR-006 Package Manager — pnpm workspaces + seguridad de dependencias
- ADR-008 Frontend Stack — decisión previa ("sin `packages/shared`") que este ADR reemplaza parcialmente
- ADR-010 App Mobile — segundo consumidor; define el `TokenStorage` de `expo-secure-store`
- ADR-011 Contrato-first OpenAPI — origen del `openapi.json` que alimenta `types.gen.ts`
- [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)
- [openapi-typescript](https://openapi-ts.dev/)
- [tsup](https://tsup.egoist.dev/)

---

*Fecha de decisión: 2026-07-02*
