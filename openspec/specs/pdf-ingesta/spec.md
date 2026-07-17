# PDF Bank-Statement Ingestion Specification

## Purpose

Defines the PDF ingestion pipeline (`.pdf` bank-statement uploads) added to reach parity with the existing `.xlsx` pipeline for the 4 supported Chilean banks (BancoEstado, Banco de Chile, Santander, BCI): the extension boundary, PDF-specific detect/validate/normalize stages, end-to-end wiring, and documentation accuracy (ADR-009; ADR-015 money-exactness + `user_id`-isolation emphasis).

## Requirements

### Requirement: PDF-00 — Extension boundary accepts `.pdf`

The `Extension` value object MUST accept `.pdf` alongside `.xlsx`. `IngestFileUseCase` MUST NOT reject a `.pdf` upload on extension grounds. The controller MUST reject any upload over 10 MB before parsing, regardless of extension. Unsupported extensions MUST still be rejected.

#### Scenario: A `.pdf` upload passes the extension gate

- GIVEN a file named `cartola.pdf` under 10 MB
- WHEN `Extension.desdeNombreArchivo()` runs
- THEN it returns `Result.ok` with the PDF extension
- AND `IngestFileUseCase` does not reject it

#### Scenario: An oversized PDF is rejected before parsing

- GIVEN a `.pdf` file larger than 10 MB
- WHEN it is uploaded to `POST /api/ingestas`
- THEN the response status is 400
- AND the file is not parsed

#### Scenario: An unsupported extension is still rejected

- GIVEN a file named `cartola.docx`
- WHEN `Extension.desdeNombreArchivo()` runs
- THEN it returns `Result.fail(ExtensionNoPermitidaError)`

### Requirement: PDF-01 — Bank detection identifies the 4 known banks and fails safely otherwise

`IPdfBankDetector` MUST identify the issuing bank from page-1 text content for each of the 4 supported fixtures, and MUST return a controlled `Result.fail` — never throw or hang — for a non-bank PDF, a PDF with no extractable text layer, or a corrupt/unparseable PDF. The reader MUST run hardened (`isEvalSupported:false`, `disableFontFace:true`, no network access).

#### Scenario: Each fixture is detected as its known bank

| Fixture | Expected `BancoConocido` |
|---|---|
| bancoestado-cartola-test.pdf | BancoEstado |
| bancochile-cartola-test.pdf | BancoChile |
| santander-cartola-test.pdf | Santander |
| bci-cartola-test.pdf | BCI |

- GIVEN the fixture's PDF buffer
- WHEN `IPdfBankDetector.detectar()` runs
- THEN it returns `Result.ok` with the matching `BancoConocido`

#### Scenario: A non-bank PDF is rejected

- GIVEN a PDF containing none of the 4 header anchors
- WHEN detection runs
- THEN it returns `Result.fail(BancoNoReconocidoError)`

#### Scenario: A PDF with no text layer is rejected

- GIVEN a scanned/image-only PDF
- WHEN detection runs
- THEN it returns `Result.fail(PdfSinTextoError)`

#### Scenario: A corrupt PDF does not hang the process

- GIVEN an unparseable PDF buffer
- WHEN detection runs
- THEN it returns `Result.fail(PdfInvalidoError)` within the request timeout

### Requirement: PDF-02 — Structure validation succeeds for the 4 known banks and groups failures

`IPdfStructureValidator` MUST produce an `EstructuraPdfValidada` (period date range, table start page, per-column X ranges) for each fixture. A mutated or missing table header MUST return `Result.fail(EstructuraPdfInvalidaError)` listing ALL detected problems in a single pass. A missing period anchor MUST return `Result.fail(RangoFechasInvalidoError)` for banks that omit the year (BancoEstado, Banco de Chile, Santander); BCI, which carries the year per row, is exempt from this specific failure.

#### Scenario: Each fixture validates to its expected period

| Fixture | Period |
|---|---|
| bancoestado-cartola-test.pdf | 01/04/2026–30/04/2026 |
| bancochile-cartola-test.pdf | 01/04/2026–30/04/2026 |
| santander-cartola-test.pdf | 01/03/2026–31/03/2026 |
| bci-cartola-test.pdf | 01/04/2026–30/04/2026 |

- GIVEN the fixture's detected bank
- WHEN `IPdfStructureValidator.validar()` runs
- THEN it returns `Result.ok(EstructuraPdfValidada)` with the matching period, table start page, and column X ranges

#### Scenario: Multiple structural problems are reported together

- GIVEN a fixture with both a mutated header and a missing period anchor
- WHEN validation runs
- THEN `Result.fail(EstructuraPdfInvalidaError)` lists both problems in a single error

#### Scenario: Missing period anchor is rejected for year-omitting banks

- GIVEN a BancoEstado, Banco de Chile, or Santander fixture with no `Fecha Inicio/Final` (or `DESDE/HASTA`) anchor
- WHEN validation runs
- THEN it returns `Result.fail(RangoFechasInvalidoError)`

### Requirement: PDF-03 — Normalization emits the canonical shape with exact money and matches per-bank reference targets

`IPdfTransactionNormalizer` MUST emit `{ fecha: 'YYYY-MM-DD', descripcion, cargo, abono }` with `cargo`/`abono` as `number`, computed without floating-point arithmetic, shape-compatible with the Excel normalizer output — so `PersistTransactionsUseCase`, categorization, and consolidation stay untouched. Each fixture MUST normalize to its documented period, totals, and filtered-row set.

#### Scenario: Amounts parse as exact integer CLP

- GIVEN a PDF cell containing `$1.580.000`
- WHEN the normalizer parses the amount
- THEN the result is the integer `1580000`
- AND no floating-point arithmetic is used

#### Scenario: Each fixture normalizes to its reference targets

| Fixture | Period | Signals |
|---|---|---|
| bancoestado | 01/04/2026–30/04/2026 | Cargos $135.010 / Abonos $150.000; 2 pages concatenated; year 2026 inferred |
| bancochile | 01/04/2026–30/04/2026 | SALDO INICIAL/FINAL rows excluded |
| santander | 01/03/2026–31/03/2026 | descriptions merged from word-by-word X tokens (e.g. `Transf a Tercero Maria Ejemplo`); Resumen de Comisiones excluded |
| bci | 01/04/2026–30/04/2026 | 2 pages concatenated; browser footer (URL + print date) excluded; year explicit per row; multiline continuations stitched into one row |

- GIVEN the fixture's validated structure
- WHEN normalization runs
- THEN the output's period, totals, and excluded rows match the table
- AND the movement count matches the real normalizer output verified against the fixture (exact count is asserted by the implementation test against the actual fixture, not fixed here — see explore/proposal `~13/~11/~7/~18` as working estimates)

#### Scenario: Month regression across the period increments the inferred year

- GIVEN a BancoEstado, Banco de Chile, or Santander statement whose period spans a year boundary (December → January)
- WHEN a row's month is earlier than the previous row's month
- THEN the inferred year for that row, and all following rows, increments by 1
- AND BCI rows use their explicit per-row year instead of inference

### Requirement: PDF-04 — End-to-end wiring preserves downstream behavior and format parity

`ProcessIngestaUseCase` MUST route `.pdf` uploads to the PDF ports and `.xlsx` uploads to the existing Excel ports, unchanged. `user_id` isolation (RNF-SEC-006) downstream MUST remain enforced. The CLI MUST accept a `.pdf` path argument. Error responses and logs MUST NOT leak raw PDF text (name, RUT, descriptions). Given the same logical movement present in both a PDF and an XLSX statement, both pipelines MUST yield equivalent canonical transactions.

#### Scenario: A valid bank PDF is ingested end to end

- GIVEN a real bank PDF fixture uploaded to `POST /api/ingestas`
- WHEN ingestion completes
- THEN the response status is 200
- AND the normalized transactions are persisted under the correct `userId`/`accountId`

#### Scenario: A non-bank PDF fails without leaking raw data

- GIVEN a non-bank PDF uploaded to `POST /api/ingestas`
- WHEN ingestion runs
- THEN the response is a controlled error (not a 500 crash)
- AND no raw PDF text (name, RUT, descriptions) appears in the response or logs

#### Scenario: The CLI ingests a PDF path

- GIVEN `pnpm api cli -- cartola.pdf` with a valid fixture path
- WHEN the command runs
- THEN it completes without error and reports the persisted movement count

#### Scenario: PDF and XLSX ingestion produce equivalent output for the same movement (parity D.5)

- GIVEN the same logical movement expressed in a PDF fixture and an XLSX fixture
- WHEN each is ingested through its respective pipeline
- THEN the resulting canonical transactions are equivalent (`fecha`, `descripcion`, `cargo`, `abono`)

### Requirement: PDF-05 — Documentation matches the reference targets and excludes PII

US-009 and US-010 vault documentation MUST reflect the reference test targets above (not the previous stale values), and MUST NOT contain any real personal name (PII).

#### Scenario: Vault docs reconciled

- GIVEN US-009 and US-010 in the vault
- WHEN reviewed against the reference targets table
- THEN the documented periods, totals, and signals match this spec
- AND no real personal name remains in US-010 CA-04
