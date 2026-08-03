---
tags:
  - adr
  - fase-diseño
  - contrato
  - toolchain
  - seguridad
proyecto: MoneyDiary
estado: ✅ Decidido (mecanismo enmendado 2026-08-02, ver abajo)
fecha_creacion: 2026-07-02
fecha_actualizacion: 2026-08-02
---

# ADR-011 — Contrato-first con OpenAPI: `openapi.json` como fuente única de verdad

## Estado

✅ **Decidido**

Reemplaza parcialmente a ADR-008 Frontend Stack (sección *"¿Compartir código entre `apps/api` y `apps/web`?"*), que decidió escribir los tipos DTO a mano y difirió el codegen OpenAPI hasta que "la duplicación generara dolor". Este ADR es exactamente ese camino previsto.

---

## Contexto

El ADR-008 Frontend Stack cerró el frontend web con una decisión deliberada: **no compartir código** entre `apps/api` y `apps/web`, y **escribir los tipos de los DTOs a mano** en `apps/web/src/api/types.ts`. La justificación fue correcta para su momento: con ~3-5 endpoints y un solo desarrollador, cualquier maquinaria de codegen no pagaba su costo, y compartir las entities del dominio habría roto la dirección de dependencias de ADR-005 Monolito-Modular-Clean-Architecture.

Dos cosas cambiaron esa ecuación:

1. **Entra una segunda plataforma consumidora.** El ADR-010 App Mobile agrega `apps/mobile` (React Native + Expo). Ahora el mismo contrato HTTP se consume desde **dos** frontends. Escribir a mano los tipos significa mantener el contrato duplicado en **tres** lugares (backend + web + mobile) y confiar en que los tres se mantengan sincronizados por disciplina humana. Esa es exactamente la clase de bug que el ADR-008 aceptó como riesgo ("si la API cambia y el frontend no actualiza el type, TypeScript NO va a avisar — el error aparece en runtime"). Con dos consumidores el riesgo se duplica y deja de ser aceptable.

2. **El backend ya expone la información necesaria.** NestJS con `@nestjs/swagger` puede derivar un documento OpenAPI 3.x directamente de los controllers y DTOs anotados. El costo marginal de emitir el contrato es bajo comparado con mantenerlo a mano ×3.

El problema a resolver, entonces: **definir una fuente única de verdad para el contrato HTTP** de la que web y mobile deriven sus tipos automáticamente, de forma que un cambio incompatible en la API se detecte en tiempo de compilación —y en CI— antes de llegar a runtime.

**Principio rector:** la dirección de la dependencia es **una sola** — `api → openapi.json → {web, mobile}`. Nadie escribe tipos "hacia atrás". Si se quiere cambiar el contrato, se cambia en NestJS y el resto se entera por tipos. Es la misma coherencia arquitectónica de Clean Architecture (el dominio no conoce a Prisma) llevada de punta a punta.

---

## Opciones Evaluadas

### Opción A — Tipos DTO escritos a mano (status quo del ADR-008)

Cada frontend declara sus propios `interface` espejo de los DTOs del backend.

✅ Cero herramientas, cero build step, cero dependencias.
✅ Control total sobre la forma exacta del tipo en cada plataforma.
❌ **Duplicación ×3** (backend + web + mobile) sin ninguna garantía de sincronía.
❌ Un cambio de contrato no rompe la compilación de los consumidores — el error aparece en runtime, en producción, en el dispositivo del usuario.
❌ No escala con dos plataformas: el costo de mantenimiento crece linealmente con cada consumidor.

### Opción B — `packages/contracts` con schemas Zod como fuente de verdad

Definir el contrato como schemas Zod en un paquete compartido; el backend valida contra ellos y los frontends infieren tipos con `z.infer`.

✅ Single source of truth **con validación runtime** incluida (parseo defensivo en el borde).
✅ Tipos inferidos, sin codegen.
❌ **Invierte la dirección de la dependencia:** el contrato deja de nacer en el backend y pasa a un paquete que el backend debe importar. El dominio NestJS termina acoplado a la forma del schema compartido.
❌ Obliga a los DTOs de NestJS a construirse desde Zod (`nestjs-zod` o similar), cambiando el estilo idiomático de `class-validator` + `@ApiProperty` que ya usa el proyecto.
❌ El contrato queda desacoplado de la *implementación real* del endpoint: nada garantiza que el controller efectivamente devuelva lo que el schema promete.

### Opción C — OpenAPI emitido desde NestJS + codegen de tipos ✅ (elegida)

`@nestjs/swagger` genera `openapi.json` a partir de los controllers y DTOs anotados con `@ApiProperty`. Ese artefacto se commitea y `openapi-typescript` deriva los tipos TypeScript que consumen web y mobile (vía ADR-012 packages api-client).

✅ **La fuente de verdad es la API real**, no una declaración paralela. El contrato se deriva de los controllers que efectivamente se ejecutan.
✅ **Dirección de dependencia correcta:** `api → openapi.json → consumidores`. Coherente con Clean Architecture.
✅ Mantiene el estilo idiomático de NestJS (`class-validator` + `@ApiProperty` en los DTOs de infraestructura).
✅ `openapi.json` es un artefacto **inspeccionable y versionado** en git → el diff de un PR muestra explícitamente cómo cambió el contrato.
✅ Habilita un **check de drift en CI**: regenerar el documento y comparar contra el commiteado detecta cualquier DTO cambiado sin actualizar el contrato.
⚠️ Introduce un build step y disciplina de anotación (`@ApiProperty` obligatorio en cada campo de cada DTO HTTP).
⚠️ OpenAPI/`openapi-typescript` da tipos en **tiempo de compilación**, no validación runtime. Se documenta como límite conocido (ver "No incluido").

### Opción D — tRPC

Contrato end-to-end TypeScript sin OpenAPI intermedio.

✅ Type-safety total sin codegen ni artefacto intermedio.
❌ Acopla cliente y servidor al mismo runtime TypeScript y al transporte tRPC — se pierde una API REST estándar, documentable e inspeccionable por terceros.
❌ Encaja mal con la arquitectura REST + NestJS ya establecida (ADR-001).
❌ El contrato deja de ser un artefacto neutro (OpenAPI) que cualquier cliente —incluido uno futuro no-TS— pueda consumir.

---

## Decisión

**El contrato HTTP se define como un documento OpenAPI 3.x (`openapi.json`) emitido desde `apps/api` con `@nestjs/swagger`, commiteado como artefacto, y consumido por web y mobile vía tipos generados con `openapi-typescript`.**

| Aspecto | Elección |
|---|---|
| Fuente de verdad | Controllers + DTOs NestJS anotados con `@ApiProperty` |
| Emisión | `@nestjs/swagger` → `openapi.json` |
| Comando | `pnpm api openapi:emit` |
| Artefacto | `packages/api-client/openapi.json` (commiteado) |
| Generación de tipos | `openapi-typescript` → `types.gen.ts` (ver ADR-012 packages api-client) |
| Garantía en CI | Check de drift (`git diff --exit-code` tras regenerar) |
| Validación runtime | **No incluida** (diferida — ver abajo) |

### Disciplina de anotación (obligatoria)

Para que el contrato emitido sea completo y correcto, los DTOs HTTP de `infrastructure/http/dto/` deben anotar **cada campo** con `@ApiProperty` (o `@ApiPropertyOptional`), y cada endpoint debe declarar `@ApiOperation` y `@ApiResponse` con su tipo de respuesta.

```typescript
// apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts
export class IngestaResponseDto {
  @ApiProperty({ example: 'a1b2c3', description: 'ID de la ingesta creada' })
  id: string;

  @ApiProperty({ enum: BancoConocido, example: BancoConocido.BCI })
  bancoDetectado: BancoConocido;

  @ApiProperty({ type: Number, example: 42, description: 'Filas de datos detectadas' })
  filasDatos: number;
}
```

```typescript
// controller
@ApiOperation({ summary: 'Ingesta un archivo de cartola bancaria' })
@ApiResponse({ status: 201, type: IngestaResponseDto })
@ApiResponse({ status: 400, type: ErrorResponseDto })
@Post()
async ingestar(/* ... */): Promise<IngestaResponseDto> { /* ... */ }
```

> **Nota de arquitectura:** esta disciplina vive **solo en la capa de infraestructura** (`infrastructure/http/`). El dominio y la aplicación (español, sin dependencias externas) **no** conocen `@ApiProperty` ni OpenAPI. Los DTOs HTTP son el borde donde el contrato se hace explícito, coherente con ADR-005 Monolito-Modular-Clean-Architecture.

### Emisión del contrato

Un script standalone bootea la aplicación Nest en memoria (sin levantar el servidor HTTP), construye el `SwaggerModule.createDocument(...)` y lo escribe a disco:

```typescript
// apps/api/src/openapi/emit.ts
const app = await NestFactory.create(AppModule, { logger: false });
const config = new DocumentBuilder()
  .setTitle('MoneyDiary API')
  .setVersion('1.0.0')
  .addBearerAuth()               // declara el esquema de auth (impl. futura)
  .build();
const document = SwaggerModule.createDocument(app, config);
writeFileSync(
  resolve(__dirname, '../../../../packages/api-client/openapi.json'),
  JSON.stringify(document, null, 2) + '\n',
);
await app.close();
```

Script en `package.json` de `apps/api`:

```json
{ "scripts": { "openapi:emit": "tsx src/openapi/emit.ts" } }
```

### Check de drift en CI (GitHub Actions)

El artefacto commiteado debe coincidir siempre con lo que emite el código actual. El job falla si divergen:

```yaml
# .github/workflows/ci.yml (fragmento)
- name: Verificar drift de OpenAPI
  run: |
    pnpm api openapi:emit
    git diff --exit-code packages/api-client/openapi.json \
      || (echo "::error::openapi.json desactualizado. Corré 'pnpm api openapi:emit' y commiteá." && exit 1)
```

**Consecuencia práctica del flujo completo:** si se cambia un DTO en NestJS sin regenerar el contrato → **CI falla** (drift). Si se cambia el contrato de forma incompatible → al regenerar tipos, **TypeScript rompe la compilación en web y en mobile** antes de runtime. El error se mueve de producción a la máquina del desarrollador / al PR.

---

## Seguridad

- **Superficie mínima expuesta:** el `openapi.json` se **emite en build**, no se sirve un endpoint `/api-docs` público en producción. Swagger UI, si se habilita, queda restringido a entornos no productivos. Esto evita exponer el mapa completo de la API a atacantes.
- **El contrato no filtra secretos:** los DTOs de respuesta se anotan explícitamente; ningún campo entra al contrato "por accidente" (a diferencia de serializar entities completas). Esto obliga a decidir campo por campo qué sale al exterior — un buen default de seguridad.
- **`addBearerAuth()`** deja declarado el esquema de autenticación en el contrato desde ya, aunque la estrategia de auth concreta se decida en un ADR posterior. El `TokenStorage` del ADR-012 packages api-client es el puerto que la consumirá.
- **Auditoría de toolchain:** `@nestjs/swagger` y `openapi-typescript` son dependencias de **devDependencies/build**, cubiertas por `pnpm audit --audit-level=high` y `minimum-release-age` de ADR-006 Package Manager. No entran al bundle de runtime.

---

## Consecuencias

**Positivas:**
- **Una sola fuente de verdad** para el contrato HTTP; web y mobile no pueden divergir del backend sin que CI o el compilador lo griten.
- **Detección temprana:** un cambio incompatible de contrato se detecta en el PR (drift) o al compilar los consumidores, nunca en runtime.
- **Diffs de contrato legibles:** cada PR que toca la API muestra el delta exacto de `openapi.json`, útil para review y para comunicar breaking changes.
- **Dirección de dependencia coherente** con Clean Architecture: el contrato fluye desde la API real hacia afuera.
- **Base para futuros consumidores:** un tercer cliente (CLI, integración, otro servicio) consume el mismo artefacto sin trabajo adicional.

**A tener en cuenta:**
- **Disciplina de `@ApiProperty`:** un DTO sin anotar produce un contrato incompleto (campos `any` o ausentes). Mitigación: lint/review; opcionalmente el plugin `@nestjs/swagger` CLI que infiere metadata desde los tipos TS reduce la anotación manual.
- **El contrato es tan bueno como los tipos declarados:** si un controller anota `@ApiResponse({ type: XDto })` pero devuelve otra cosa, el contrato miente. El check de drift no detecta esto (solo detecta desincronización del JSON). Mitigación futura: tests de contrato / validación de respuesta en e2e.
- **Sin validación runtime:** `openapi-typescript` da tipos de compilación. Un payload que en runtime no respeta el contrato (por un backend con bug) no es atrapado por el cliente. Ver "No incluido".
- **Nuevo paso en el flujo de trabajo:** tras cambiar un DTO hay que correr `pnpm api openapi:emit` y commitear. El check de drift lo vuelve obligatorio pero es fricción nueva.
- **Orden de generación:** el pipeline es `emit (api) → gen tipos (api-client) → typecheck (web, mobile)`. Con más pasos encadenados, un orquestador de monorepo (Turborepo) empieza a pagar su costo — se evalúa en ADR-012 packages api-client.

---

## No incluido en este ADR (decisiones futuras)

- **Validación runtime del contrato:** si aparece la necesidad de parseo defensivo en el borde (backend con bugs, respuestas inesperadas), se evaluará generar validadores desde el mismo OpenAPI (ej. `openapi-zod-client` o `zod` derivado del schema). Por ahora se acepta el límite de "tipos de compilación únicamente".
- **Estrategia de autenticación concreta:** proveedor de identidad, formato de token, refresh y expiración. Este ADR solo deja `addBearerAuth()` declarado en el contrato; el puerto `TokenStorage` vive en ADR-012 packages api-client.
- **Versionado del contrato / breaking changes:** política formal de versión de API (`/v1`, deprecaciones) se definirá cuando exista un consumidor externo al monorepo.
- **Tests de contrato:** verificar que la respuesta real del controller cumple el schema declarado (más allá del drift del JSON).

---

## Referencias

- ADR-005 Monolito-Modular-Clean-Architecture — dirección de dependencias que este ADR extiende al contrato HTTP
- ADR-006 Package Manager — pnpm workspaces + política de seguridad de dependencias
- ADR-008 Frontend Stack — decisión previa (tipos a mano) que este ADR reemplaza parcialmente
- ADR-010 App Mobile — segundo consumidor que motiva el contrato único
- ADR-012 packages api-client — cómo se consume el contrato desde web y mobile
- [NestJS OpenAPI (Swagger)](https://docs.nestjs.com/openapi/introduction)
- [openapi-typescript](https://openapi-ts.dev/)

---

## Enmienda 2026-08-02 — mecanismo para Express

**No se reabre la decisión original** (contrato-first con OpenAPI committeado + drift-check en CI). Lo que cambia es **el mecanismo de emisión**: ADR-028 eliminó NestJS (migración a Express), y con él desaparecieron `@nestjs/swagger`, `@ApiProperty` y `SwaggerModule.createDocument(...)` descritos arriba. Esta sección registra el mecanismo real vigente sin reescribir la Opción C original — queda como historial de por qué se descartó en su momento la Opción B (Zod).

### Mecanismo nuevo: Zod como fuente de verdad del contrato

El contrato HTTP se define ahora como **schemas Zod** (`zod-openapi@5.4.2`, versión exacta pineada) en `apps/api/src/infrastructure/http-express/schemas/` — capa de infraestructura, un `<endpoint>.schema.ts` por endpoint (query + response) más `openapi-document.ts` (`buildOpenApiDocument()`, función pura). El dominio y la aplicación **nunca** importan estos schemas (ADR-005 sin cambios).

| Aspecto | Mecanismo vigente (Express) | Mecanismo original (NestJS, ver arriba) |
|---|---|---|
| Fuente de verdad | Schemas Zod en `infrastructure/http-express/schemas/` | Controllers + DTOs anotados `@ApiProperty` |
| Librería | `zod-openapi@5.4.2` (pin exacto) | `@nestjs/swagger` |
| Emisión | `apps/api/scripts/emit-openapi.ts` → `pnpm api openapi:emit` | Script standalone que booteaba `NestFactory` |
| Artefacto | `apps/api/openapi.json` (commiteado, co-ubicado con el código que lo emite) | `packages/api-client/openapi.json` |
| Versión OpenAPI | **3.1.0** | 3.x (sin fijar) |
| Check de drift en CI | `pnpm api openapi:check` (paso nuevo en el job `api` de `.github/workflows/ci.yml`, mismo `path filter` `apps/api/**`) | `git diff --exit-code` tras `openapi:emit` |
| Validación runtime | **Sí** — cada handler hace `.safeParse()` sobre el mismo schema que alimenta el documento (ver abajo) | No incluida (límite documentado en la versión original) |

**Por qué Zod y no revivir la Opción C tal cual:** no hay controllers ni decoradores en Express — no existe un lugar natural para `@ApiProperty`. Zod ya era una opción evaluada (Opción B) y **rechazada** en la decisión original por dos razones que eran específicas de NestJS y hoy son **moot**:

1. *"Invierte la dirección de la dependencia"* — no aplica: los schemas viven en `infrastructure/http-express/schemas/`, capa de infraestructura del propio `apps/api`, no en un paquete compartido que el backend deba importar desde afuera.
2. *"Obliga a `nestjs-zod` o similar, cambiando el estilo idiomático"* — no aplica: no hay NestJS ni `class-validator` que desplazar.

Se evaluó también `@asteasolutions/zod-to-openapi` (requiere el monkey-patch global `extendZodWithOpenApi(z)`, contrario al ethos "sin magia" post-ADR-028) — se prefirió `zod-openapi`, nativo de Zod 4 (`.meta()`), con `createDocument()` explícito.

**Por qué OpenAPI 3.1.0 y no 3.0.3:** `zod-openapi` emite únicamente 3.1.x (nunca 3.0.x) — al elegir la librería, la versión del documento queda determinada. El riesgo de compatibilidad de 3.1 con las herramientas de ADR-021 Análisis de Seguridad (ZAP, Schemathesis) se acepta como bajo (ambas soportan 3.1 en 2026); si un follow-up de DAST encuentra una incompatibilidad concreta, el costo de bajar a 3.0 es acotado (cambiar a `OpenApiGeneratorV3` de `@asteasolutions/zod-to-openapi` sobre los mismos DTOs simples).

**Beneficio nuevo que el mecanismo NestJS no daba:** validación runtime en el borde HTTP. Cada handler valida `req.query`/`req.body` con `.safeParse()` contra el mismo schema Zod que alimenta el documento OpenAPI — una sola fuente, dos consumidores (route + document builder). Esto cierra el límite "Sin validación runtime" que la sección "No incluido" de este ADR había dejado explícitamente abierto.

**Metas originales preservadas sin cambios:** fuente única de verdad del contrato, artefacto committeado y diffable en PR, check de drift obligatorio en CI, sin endpoint `/api-docs` público en producción (sigue sin existir).

### Estado de implementación (2026-08-02)

**Parcial.** Change SDD `openapi-contract-express`:
- ✅ Slice 0 (toolchain completo + `GET /version`) — PR #212, mergeado a `main`.
- ✅ Slice 1 (`GET /api/resumen`, query + respuesta rica con `BigInt`) — PR #213, mergeado a `main`.
- ⏳ Rollout del resto de endpoints (lecturas restantes, luego escrituras/auth con cuidado extra por ADR-015) — pendiente, una slice por PR.
- ⏳ Consumidor de tipos generados (`openapi-typescript` + `packages/api-client` de ADR-012 packages api-client) — **sin construir**. Ver nota en ADR-012.
- ⏳ Cableado del DAST de ADR-021 Análisis de Seguridad contra este artefacto — follow-up no iniciado.

---

*Fecha de decisión: 2026-07-02*
*Fecha de enmienda (mecanismo): 2026-08-02*
