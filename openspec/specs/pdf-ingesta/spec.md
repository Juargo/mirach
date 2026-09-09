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

`IPdfBankDetector` MUST identify the issuing bank from page-1 text content for each of the 4 supported fixtures, and MUST return a controlled `Result.fail` — never throw or hang — for a non-bank PDF, a PDF with no extractable text layer, or a corrupt/unparseable PDF. The reader MUST run hardened (`isEvalSupported:false`, `disableFontFace:true`, no network access). A password-protected PDF is NOT a corrupt/unparseable PDF for the purposes of this requirement — see PDF-06, which governs it separately and forbids reporting it as `PdfInvalidoError`.

(Previously: this requirement's "corrupt PDF" scenario did not distinguish a password-protected PDF from a genuinely corrupt one, because the extractor collapsed both into `PdfInvalidoError`. This change narrows that scenario's scope and adds an explicit boundary scenario below.)

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

#### Scenario: A password-protected PDF is never reported as PdfInvalidoError (boundary clarification)

- GIVEN a password-protected PDF fixture, submitted with no password or with the wrong password
- WHEN detection runs
- THEN it does NOT return `Result.fail(PdfInvalidoError)`
- AND it returns the password-related outcome defined by PDF-06 instead

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

### Requirement: PDF-06 — A password-protected PDF is reported distinctly from an invalid PDF, and a correct password unlocks every stage

The system MUST distinguish a PDF that is valid but password-protected from a PDF that is
genuinely corrupt or unparseable. A password-protected PDF MUST NOT be reported via
`PdfInvalidoError` at any stage (bank detection, structure validation, or normalization). When
the correct password is supplied, all three pipeline stages MUST successfully process the file,
identically to how they process an equivalent unprotected PDF. Supplying a password for a PDF
that is NOT password-protected MUST be harmless — the file is processed exactly as if no
password had been supplied; it is never treated as an error condition.

The system MUST also let the caller distinguish "no password was supplied for a file that needs
one" from "a password was supplied but it was wrong" — the two are different situations that
warrant different user-facing guidance (prompt for a password vs. tell the user to retry).

#### Scenario: A locked PDF with no password is reported as protected, not invalid

- GIVEN a password-protected PDF fixture
- WHEN it is submitted to preview or commit with no password
- THEN the system reports that the file is password-protected
- AND it does NOT report `PdfInvalidoError`

#### Scenario: A locked PDF with the wrong password is reported as a wrong password, not invalid

- GIVEN a password-protected PDF fixture whose real password is known
- WHEN it is submitted with an incorrect password
- THEN the system reports the password was incorrect
- AND this outcome is distinguishable from the "no password supplied" outcome in the scenario above
- AND it does NOT report `PdfInvalidoError`

#### Scenario: The correct password unlocks all three pipeline stages

- GIVEN a password-protected PDF fixture and its correct password
- WHEN it is submitted to preview (and, independently, to commit) with the correct password
- THEN bank detection, structure validation, and normalization all complete successfully
- AND the resulting canonical transactions match what the same statement's content would
  produce if it were not password-protected

#### Scenario: A password supplied for an unprotected PDF is harmless

- GIVEN a PDF fixture that is NOT password-protected
- WHEN it is submitted together with an arbitrary non-empty password value
- THEN the file is processed exactly as it would be with no password supplied
- AND no error is returned on account of the (unnecessary) password

### Requirement: PDF-07 — The password is never persisted, logged, or exposed

The submitted password MUST NOT be written to any database column, MUST NOT appear in any log
line (ADR-033 Pino redaction applies to it as sensitive data), and MUST NOT appear — in whole or
as a substring — in any domain error message, HTTP response body, or HTTP response header,
whether the password was correct, incorrect, or unnecessary. This applies in particular to the
error path: an error describing a password-protected or wrong-password PDF MUST be a fixed,
descriptive message that never interpolates the value the caller submitted (contrast with
ADR-013's existing PII-scrubbing posture for amounts and names).

#### Scenario: A wrong password never appears in the error response

- GIVEN a password-protected PDF fixture submitted with an incorrect password value
- WHEN the wrong-password error is returned to the caller
- THEN the HTTP response body does not contain the submitted password value anywhere

#### Scenario: A wrong password never appears in application logs

- GIVEN a password-protected PDF fixture submitted with an incorrect password value
- WHEN the request is processed and logged
- THEN no log line emitted for that request contains the submitted password value

#### Scenario: The password is never written to the database

- GIVEN any PDF submitted with a password (correct, incorrect, or unnecessary)
- WHEN the request completes, in any outcome
- THEN no database row, in any table, contains the submitted password value

### Requirement: PDF-08 — A password-protected or wrong-password PDF at commit produces no ingesta history row

A commit request that fails because the PDF is password-protected (no password supplied) or
because the supplied password is incorrect MUST be treated as a client-correctable input
validation error, not as a failed ingesta outcome. It MUST NOT result in any `Ingesta` row being
created — neither `PROCESADA` nor `FALLIDA`. Repeated failed attempts against the same file MUST
NOT accumulate rows in the caller's ingesta history.

This is an explicit, narrow exception to the general rule that every terminal pipeline failure at
commit is recorded in ingesta history (`ingesta-management` capability, requirement ING-07; see
that capability's delta in this change for the corresponding carve-out).

#### Scenario: Repeated wrong-password commit attempts leave no trace in history

- GIVEN a user submits the same password-protected PDF to commit three times, each with an
  incorrect password
- WHEN all three attempts complete
- THEN the user's ingesta history (`GET /api/ingestas`) contains no new rows attributable to
  these attempts

#### Scenario: A missing-password commit attempt leaves no trace in history

- GIVEN a user submits a password-protected PDF to commit with no password
- WHEN the attempt completes
- THEN the user's ingesta history contains no new row attributable to this attempt

#### Scenario: A successful password-unlocked commit is recorded normally

- GIVEN a user submits a password-protected PDF to commit with the correct password
- WHEN the commit succeeds
- THEN a `PROCESADA` `Ingesta` row is created exactly as it would be for an equivalent unprotected
  PDF

### Requirement: PDF-09 — Preview and commit accept the same optional password field, fully backward compatible

`POST /api/ingestas/preview` and `POST /api/ingestas/commit` MUST each accept an optional
password value alongside the uploaded file. When the field is absent, behavior MUST be
byte-identical to the system's behavior before this change, for every existing PDF and `.xlsx`
path — this is a purely additive contract change. When a password is supplied at preview and the
same file is later submitted to commit with the same password, commit MUST succeed under the same
conditions preview did (commit re-parses the file from scratch and is not aware of the earlier
preview call).

#### Scenario: Absent password field behaves exactly as before this change

- GIVEN any existing `.pdf` or `.xlsx` fixture that ingested successfully before this change
- WHEN it is submitted to preview and to commit with no password field present
- THEN the request is accepted and behaves identically to its pre-change behavior

#### Scenario: A password accepted at preview also works at commit for the same file

- GIVEN a password-protected PDF fixture and its correct password
- WHEN the file is previewed with that password, and the SAME file and password are then
  submitted to commit
- THEN commit succeeds and persists the resulting transactions

### Requirement: PDF-10 — The web upload flow reveals a password prompt reactively and never persists it client-side

The web upload form MUST NOT render a password input by default. A password input MUST appear
only after the API reports that the submitted file is password-protected. When the prompt
appears, the retry MUST reuse the file the user already selected — the user MUST NOT be asked to
pick the file again. The password value MUST be held only in ephemeral in-memory client state
across the preview → commit flow; it MUST NOT be written to `localStorage`, `sessionStorage`, or
any other client-side persistent storage.

#### Scenario: No password field is shown before any upload attempt

- GIVEN the user has not yet uploaded a file
- WHEN the upload form is rendered
- THEN no password input is visible

#### Scenario: A protected-file response reveals the password prompt without re-selecting the file

- GIVEN the user has selected and submitted a password-protected PDF with no password
- WHEN the API reports the file is password-protected
- THEN a password prompt appears
- AND the retry (once a password is entered) resubmits the SAME file object the user originally
  selected, without prompting them to pick a file again

#### Scenario: The password is never written to browser storage

- GIVEN the user has typed a password into the revealed prompt, at any point in the flow
- WHEN browser storage (`localStorage`, `sessionStorage`) is inspected
- THEN the password value is not present in either
