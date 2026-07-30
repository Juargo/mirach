---
tags:
  - adr
  - fase-diseño
  - toolchain
  - seguridad
proyecto: MoneyDiary
estado: ✅ Decidido
fecha_creacion: 2026-05-23
fecha_actualizacion: 2026-05-23
---

# ADR-007 — Librería de Parseo Excel: ExcelJS + eliminación de soporte .xls

## Estado

✅ **Decidido**

---

## Contexto

MoneyDiary necesita leer archivos de movimientos bancarios exportados desde portales chilenos (Banco de Chile, BancoEstado, BCI, Santander). Estos archivos pueden venir en formato `.xlsx` (Excel moderno, OOXML) o `.xls` (Excel 97-2003, formato BIFF).

Para parsear estos archivos en Node.js, se evaluaron las opciones disponibles en el ecosistema al momento de tomar esta decisión (mayo 2026).

### El problema con SheetJS (paquete `xlsx` en npm)

SheetJS es históricamente la librería dominante para manejo de Excel en Node.js. Sin embargo, presenta un problema estructural grave a partir de 2022:

- **El equipo de SheetJS dejó de publicar en npm.** La última versión disponible en el registro público es `0.18.5` y no recibirá más actualizaciones.
- Las versiones parcheadas (`0.19.3+`, `0.20.2+`) **solo se distribuyen desde `cdn.sheetjs.com`**, fuera del ecosistema npm estándar.
- La versión `0.18.5` tiene **dos CVEs activas sin parche en npm**:

| CVE | Tipo | Versiones afectadas | Parche disponible |
|-----|------|---------------------|-------------------|
| GHSA-4r6h-8v6p-xvw6 | Prototype Pollution | `< 0.19.3` | Solo en CDN |
| GHSA-5pgg-2g8v-p4x9 | ReDoS | `< 0.20.2` | Solo en CDN |

### Por qué el CDN de SheetJS no es una solución sostenible

Instalar desde `cdn.sheetjs.com` resuelve las CVEs actuales pero introduce un riesgo de proceso más difícil de mitigar:

- **`pnpm audit` queda ciego** para ese paquete — no es parte del registro npm y no aparecerá en ningún scan automático de vulnerabilidades.
- Si aparece una nueva vulnerabilidad, **no hay alerta automática**. Habría que revisar manualmente los advisories de SheetJS y actualizar la URL en `package.json`.
- Esto contradice directamente la estrategia de seguridad definida en ADR-006 Package Manager, que prioriza detección automática y auditorías reproducibles.
- La licencia cambió a **SSPL** (Server Side Public License), que tiene restricciones si el software se distribuye como servicio.

---

## Opciones Evaluadas

### Opción A — SheetJS CDN (`https://cdn.sheetjs.com/xlsx-0.20.3/...`)

✅ Soporta `.xls` y `.xlsx`
✅ CVEs actuales resueltas
❌ Fuera del registro npm — `pnpm audit` no lo escanea
❌ Actualizaciones manuales ante nuevas vulnerabilidades
❌ Licencia SSPL con restricciones comerciales
❌ Rompe el principio de auditoría continua (ADR-006)

### Opción B — `node-xlsx`

Wrapper liviano alrededor del core de SheetJS.

❌ Tiene **los mismos CVEs** que SheetJS npm (`0.18.5` como dependencia transitiva)
❌ No resuelve el problema — solo añade una capa encima

### Opción C — ExcelJS ✅ (elegida)

Librería independiente de SheetJS, desarrollada y mantenida de forma autónoma.

✅ **MIT License** — sin restricciones comerciales
✅ Sin CVEs conocidas
✅ Publicada en npm — `pnpm audit` la escanea automáticamente
✅ Tipos TypeScript incluidos (sin necesidad de `@types/exceljs`)
✅ API moderna basada en Promises/async-await
✅ Soporta `.xlsx` completamente
✅ Activamente mantenida (~12M descargas semanales, 2026)
❌ **No soporta `.xls`** (formato BIFF / Excel 97-2003)

---

## Decisión

**Librería de parseo:** `exceljs`

Junto con esta decisión, se elimina el soporte para archivos `.xls` en el dominio de MoneyDiary. Los bancos chilenos actualmente ofrecen exportación en formato `.xlsx` desde sus portales web — los archivos `.xls` son un formato legacy que ningún banco requiere exclusivamente.

### Impacto en el dominio

El value object `Extension` (creado en ADR-005 Monolito-Modular-Clean-Architecture) acepta únicamente `.xlsx` a partir de esta decisión. Si un usuario intenta cargar un `.xls`, recibirá un mensaje claro indicando que descargue la cartola en formato `.xlsx` desde el portal del banco.

```typescript
// Antes
const EXTENSIONES_PERMITIDAS = ['.xls', '.xlsx'] as const;

// Después
const EXTENSIONES_PERMITIDAS = ['.xlsx'] as const;
```

### Instalación

```bash
pnpm add exceljs
```

No requiere `@types/exceljs` — los tipos están incluidos en el paquete.

---

## Consecuencias

**Positivas:**
- La librería de parseo queda bajo el mismo sistema de auditoría automática que el resto de dependencias (`pnpm audit`).
- Eliminación de 2 CVEs high del árbol de dependencias.
- Se mantiene la coherencia con la estrategia de seguridad definida en ADR-006.
- La API async de ExcelJS es más idiomática en Node.js moderno que la API síncrona de SheetJS.

**A tener en cuenta:**
- **Los archivos `.xls` ya no son aceptados.** Los usuarios deben descargar sus cartolas en formato `.xlsx`.
  - Banco de Chile: Portal → Cartola Histórica → Exportar como `.xlsx`
  - Los demás bancos del proyecto (BancoEstado, BCI, Santander) ya exportan en `.xlsx` por defecto.
- El `IBankDetector` port debe cambiar a una API **asíncrona** (`async/await`) porque ExcelJS es Promise-based. Esto afecta el use case y el CLI, pero no el dominio.
- Las estrategias de detección deben reescribirse usando la API de ExcelJS (`workbook.xlsx.load(buffer)`, `worksheet.getCell('A1').value`) en lugar de la API de SheetJS.

---

## Referencias

- [ExcelJS — npm](https://npmjs.com/package/exceljs)
- [GHSA-4r6h-8v6p-xvw6 — Prototype Pollution en SheetJS](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
- [GHSA-5pgg-2g8v-p4x9 — ReDoS en SheetJS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)
- [SheetJS issue #3098 — npm vulnerability sin parche](https://git.sheetjs.com/sheetjs/sheetjs/issues/3098)
- ADR-005 Monolito-Modular-Clean-Architecture
- ADR-006 Package Manager

---

*Fecha de decisión: 2026-05-23 · Última actualización: 2026-05-23*
