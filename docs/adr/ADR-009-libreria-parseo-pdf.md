---
tags:
  - adr
  - fase-diseño
  - toolchain
  - seguridad
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-06-11
fecha_actualizacion: 2026-06-11
---

# ADR-009 — Librería de Parseo PDF: pdfjs-dist (build legacy) para cartolas bancarias

## Estado

✅ **Decidido**

---

## Contexto

Los 4 bancos del scope (BancoEstado, Banco de Chile, BCI, Santander) permiten descargar cartolas tanto en `.xlsx` como en `.pdf` desde sus portales. Hasta ahora, MoneyDiary solo soporta `.xlsx` (ADR-007 Libreria Parseo Excel).

La necesidad de procesar PDFs surge porque:

1. **Algunos bancos solo entregan PDFs en ciertos flujos** (ej. cartolas históricas, comprobantes mensuales por mail).
2. **Los usuarios suelen archivar el PDF**, no la planilla Excel — es el formato "oficial" desde el punto de vista del usuario.
3. **Coexistencia**: la decisión es que `.pdf` **convive** con `.xlsx`, no lo reemplaza (queda en alcance del Sprint, pipeline dual).

### Inspección de los 4 PDFs reales

Antes de elegir librería se realizó un spike (`apps/api/scripts/spike-pdf.ts`) cargando los 4 fixtures con `pdfjs-dist` v6 y extrayendo `getTextContent()` con posiciones `(x, y)` por token. Hallazgos:

| Banco | Texto nativo | Cabecera identificable | Tabla por posiciones X | Particularidad |
|---|---|---|---|---|
| **BancoEstado** | ✅ | `CARTOLA CUENTARUT N°` | ✅ columnas alineadas | Fechas en formato `DD/Mmm` (sin año), año debe inferirse de `Fecha Inicio/Final` |
| **Banco de Chile** | ✅ | `Estado de Cuenta` + `CUENTA CORRIENTE` | ✅ columnas estables | Fechas `DD/MM`, año debe inferirse de `DESDE/HASTA`. Filas `SALDO INICIAL`/`SALDO FINAL` deben filtrarse |
| **Santander** | ✅ | `BANCO SANTANDER CHILE` + `CARTOLA` | ⚠️ requiere merge de tokens | **Cada palabra de la descripción es un item separado** — hay que agruparlos dentro del rango X de la columna |
| **BCI** | ✅ | `CARTOLA DE CUENTA CORRIENTE` + `BCI` | ✅ columnas perfectas | Fechas `DD/MM/YYYY` (único con año). Continuaciones multi-línea sin fecha en columna izquierda. Footer del navegador (URL + fecha de impresión) debe filtrarse |

**Conclusión del spike**: los 4 PDFs son **texto nativo** (no escaneos) y `pdfjs-dist` expone posiciones `(x, y)` confiables. No se requiere OCR.

---

## Opciones Evaluadas

### Opción A — `pdf-parse`

Wrapper sobre una versión antigua de pdfjs.

✅ API muy simple (`pdf(buffer).then(data => data.text)`)
❌ **Solo retorna texto plano concatenado** — pierde la asociación columnar. Reconstruir tablas sería un parsing por regex muy frágil para Santander y BCI.
❌ Mantenimiento esporádico (último release con varios meses sin commits).
❌ Depende de un fork antiguo de pdfjs.

### Opción B — `pdf2json`

Convierte PDF a una estructura JSON con coordenadas.

✅ Provee posiciones por carácter
❌ El modelo de salida es muy verboso (un objeto por glifo) y requiere mucho post-procesamiento
❌ Mantenimiento intermitente
❌ Historial de issues abiertos sobre encoding de UTF-8 en español
❌ Requiere `pdf.js-extract` como adapter en muchos casos

### Opción C — `mupdf` (binding nativo)

Binding al engine C++ de MuPDF.

✅ Parser robusto y rápido
✅ Output de alta fidelidad
❌ Distribución de binarios nativos rompe la simplicidad de instalación (`pnpm approve-builds` adicional)
❌ Licencia AGPL — incompatible con uso comercial cerrado a futuro
❌ Overkill para PDFs de texto nativo simples como las cartolas

### Opción D — `unpdf`

Wrapper "serverless-friendly" de pdfjs.

✅ Tree-shakeable, sin dependencia del worker
❌ Agrega una capa de abstracción innecesaria sobre `pdfjs-dist`
❌ Para nuestro caso (Node 22 directo, no edge), no aporta sobre usar pdfjs directamente
❌ Menor tracción que pdfjs y reescrituras frecuentes de API

### Opción E — `pdfjs-dist` (build legacy) ✅ (elegida)

Implementación de Mozilla del visor PDF de Firefox, distribuida como librería Node/Browser.

✅ **MIT License** — sin restricciones comerciales
✅ Publicada en npm — `pnpm audit` la escanea automáticamente
✅ Mantenida por Mozilla — ciclo de release predecible
✅ **Build `legacy/build/pdf.mjs` funciona en Node sin worker** ni dependencias nativas
✅ `getTextContent()` retorna items con `transform[4]`, `transform[5]` (x, y) → permite reconstruir tablas
✅ Tipos TypeScript incluidos
✅ Validada empíricamente sobre los 4 PDFs del scope
⚠️ Historial de CVE notable — ver sección de seguridad

---

## Decisión

**Librería de parseo PDF:** `pdfjs-dist@^6` (build `legacy/build/pdf.mjs`).

### Estrategia de uso

```typescript
// apps/api/src/infrastructure/pdf/pdfjs-pdf-reader.adapter.ts
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const loadingTask = pdfjs.getDocument({
  data,
  useSystemFonts: true,
  isEvalSupported: false,       // ← mitigación CVE-2024-4367
  disableFontFace: true,        // ← reduce superficie de ataque
});
```

### Impacto en el dominio y la arquitectura

1. El value object `Extension` (creado en ADR-007 Libreria Parseo Excel) pasa a aceptar `.xlsx` **y** `.pdf`.
2. Se crea un nuevo puerto `IPdfReader` en `application/ports/`, paralelo a `IFileReader` para Excel.
3. El `IngestFileUseCase` despacha al pipeline correcto según extensión (`xlsxPipeline` vs `pdfPipeline`). Ambos pipelines normalizan al **mismo esquema canónico de transacciones** producido por US-007 Normalizacion columnas.
4. Se crean strategies de detección/extracción PDF por banco en `infrastructure/pdf/strategies/`, espejo de las strategies de Excel.

```typescript
// Antes
const EXTENSIONES_PERMITIDAS = ['.xlsx'] as const;

// Después
const EXTENSIONES_PERMITIDAS = ['.xlsx', '.pdf'] as const;
```

### Algoritmo común de extracción

1. Cargar PDF con `pdfjs.getDocument(...)` (sin worker).
2. Por cada página, `page.getTextContent()` → items con `(x, y, str, width)`.
3. **Agrupar por Y** con tolerancia ±2px → filas.
4. **Mapear tokens a columnas** según rangos X declarados por cada strategy (BancoEstado/Chile/Santander/BCI).
5. **Mergear tokens dentro del rango X de una misma celda** (clave para Santander que tokeniza palabra por palabra).
6. **Detectar filas de movimiento** por fecha parseable en la columna izquierda.
7. **Continuaciones multilínea** (filas sin fecha pero con descripción) se concatenan a la fila previa con fecha.
8. **Filtros** específicos por banco: `SALDO INICIAL/FINAL`, footer de impresión del navegador (BCI), `Resumen de Comisiones` (Santander).
9. **Inferir año** desde el rango `DESDE/HASTA` (todos menos BCI que ya trae año).

### Instalación

```bash
pnpm --filter @moneydiary/api add pdfjs-dist
```

Tipos incluidos. No requiere `@types/pdfjs-dist`.

---

## Seguridad

PDF es un formato históricamente explotado para ejecución de código. Decisiones tomadas para mitigar:

### CVE-2024-4367 (referencia histórica)

Una vulnerabilidad crítica en `pdfjs-dist` permitía **ejecución arbitraria de JavaScript** al procesar un PDF malicioso con un objeto FontMatrix manipulado. Fue parcheada en `pdfjs-dist@4.2.67`. Trabajamos con `^6.x`, que está varias mayores adelante del fix.

### Mitigaciones aplicadas en `getDocument()`

- `isEvalSupported: false` — desactiva `eval()` interno de pdfjs incluso en runtimes que lo soportan. Es la mitigación recomendada por Mozilla.
- `disableFontFace: true` — evita registrar `@font-face` en el documento (no aplica en Node, pero deja explícito el intento).
- **No se renderiza el PDF a canvas**: solo se llama `getTextContent()`. Esto reduce dramáticamente la superficie de ataque (no se ejecuta código de fuentes ni se rasterizan operadores de PDF).

### Política de actualización

- `minimum-release-age=10080` (7 días) en `.npmrc` ya cubre el caso de versiones recién publicadas (ADR-006).
- `pnpm audit --audit-level=high` corre en CI y bloquea merges con vulnerabilidades altas.
- Se monitorea el [advisory feed de Mozilla pdfjs](https://github.com/mozilla/pdf.js/security/advisories).

### Boundary de confianza

Los PDFs **provienen del usuario**, no de un canal interno controlado. Eso los califica como **input no confiable**. El controller HTTP debe:

- Limitar tamaño máximo (sugerencia: 10 MB para cartolas — el más grande de nuestros fixtures es 469 KB).
- Aplicar timeout al parseo (sugerencia: 15s) para evitar PDFs malformados que congelen el worker pool.
- Capturar excepciones de pdfjs y devolver un error de dominio (`PdfInvalidoError`).

---

## Consecuencias

**Positivas:**
- Habilita ingesta de PDFs reutilizando el mismo pipeline canónico de transacciones (detect → validate → normalize).
- Mantiene la auditoría automática de dependencias (`pnpm audit`) — ningún binario nativo extra.
- Mozilla como mantainer da garantías de patching más rápidas que librerías comunitarias.

**A tener en cuenta:**
- Cada banco requiere su propia strategy de extracción tabular — no hay una abstracción genérica que funcione bien para los 4 sin lógica específica.
- Santander tokeniza por palabra: el merge de tokens dentro de un rango X es una pieza crítica de la implementación.
- BCI trae footer de impresión del navegador (`6/11/26, 5:15 PM ... BCI- CARTOLA`) que debe filtrarse — un cambio de estilo del portal podría romper este filtro.
- Los formatos de fecha varían entre bancos (`DD/Mmm`, `DD/MM`, `DD/MM/YYYY`). La inferencia de año depende de leer correctamente el rango de cartola.
- El worker pool del API debe acotar concurrencia de parseo PDF — pdfjs es más pesado en CPU que ExcelJS.

---

## Referencias

- [pdfjs-dist — npm](https://www.npmjs.com/package/pdfjs-dist)
- [Mozilla pdf.js repository](https://github.com/mozilla/pdf.js)
- [CVE-2024-4367 — Arbitrary JS execution in pdfjs](https://github.com/advisories/GHSA-wgrm-67xf-hhpq)
- ADR-005 Monolito-Modular-Clean-Architecture
- ADR-006 Package Manager
- ADR-007 Libreria Parseo Excel
- Spike empírico: `apps/api/scripts/spike-pdf.ts`

---

*Fecha de decisión: 2026-06-11 · Última actualización: 2026-06-11*
