---
tags:
  - adr
  - fase-diseño
  - contrato
  - toolchain
  - seguridad
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-07-02
fecha_actualizacion: 2026-07-02
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

*Fecha de decisión: 2026-07-02*
