# Normalize the five product sources

Objective: align `docs/adr`, `docs/catalogo`, the GitHub milestones and issues, `docs/requisitos` and Figma (Mirach-UI), so each fact has one owner and the others reference it by ID.
Branch: `docs/normalizacion-fuentes` (one PR per work unit). Delivery: `ask-on-risk`. Test runner: none for docs (structural checks: links resolve, IDs exist, retired terms absent); `pnpm` checks for `design/tokens.json` and the generated app resources.

## Specs

- **S1** — The five sources are aligned: "@docs/adr @docs/catalogos, milestones, [Obsidian] Requisitos, https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=2-3&p=f&t=otbYjUdqkQwJlnLb-0 estén alineados" (L1). The requirements now live in `docs/requisitos` (#121).
- **S2** — Ownership (applied by the user when migrating the requirements; rules in `docs/requisitos/README.md`): requirements own *what*, ADRs own *how*, Figma owns the visual design and tokens, the screen catalog keeps only what Figma cannot express (endpoints, error codes, states) and cites `RF + Figma node`, milestones and issues own *when* and link IDs instead of copying them.
- **S3** — Open product decisions found in the audit are decided by the user and recorded in `docs/requisitos` before any other source changes (assumption: the user decides; this document never picks):
  - **D1** — Paid plans in v1.0 or v1.1 (backlog decision B vs ADR-012 vs Sprint 3 description). **Decided (L7): v1.1, with Plus free for everyone during the v1.0 launch.** Recorded in `docs/requisitos`; ADR-012 and the Sprint 3 milestone follow in T3 and T7.
  - **D2** — Typography: Inter only (UI Design, RNF-USA-006, Figma) or Inter + Geist Mono (ADR-007, `tokens.json`). **Decided (L8): Inter only, tabular figures (`tnum`) for amounts and dates.** Recorded in RNF-USA-006 and `ui-design.md`; ADR-007, `tokens.json` and removing Geist Mono from both apps follow in T3 and T4.
  - **D3** — Scope of VIS-08, VIS-16 and MOV-06: out of v1 (milestone "Después de v1.0") or in v1 (already drawn in Figma). **Decided (L9): all three out of v1.0.** Recorded in their RF rows and backlog §6 (VIS-08 and VIS-16 moved from Incr. 4 to Después; MOV-06 stays in v1.1). Figma marks them as later in T6.
  - **D4** — ADRs 001–012: move from `Propuesto` to `Aceptado` (product-owner review per `docs/adr/README.md`). **Decided (L10): accept all 12 in the T3 PR, after correcting ADR-007, ADR-010 and ADR-012 while still `Propuesto`; the state change is the last commit.**
  - **D5** — Issues #80 (match types) and #82 (pattern priority) contradict CLA-14 and CLA-12: close or rewrite. **Decided (L11): the requirements win.** The API itself contradicts them: it supports `CONTAINS`/`STARTS_WITH`/`REGEX` (`validar-patron.ts:14`), breaks ties by `prioridad` then text then id (`categorizar-transaccion.use-case.ts:133`), and only lower-cases without ignoring accents (`patron-clasificacion.ts:67`). Done: CLA-12 and CLA-14 rows note the decision; #82 closed (not planned); #80 rewritten to the icon picker only (CLA-11); implementation issues #129 (API) and #130 (iOS) opened in Sprint 3.
  - **D6** — Scope of VIS-13 (annual calendar) and VIS-14 (block detail by merchant): backlog §6 put them in v1.0, the "Después de v1.0" milestone after. **Decided (L16): both out of v1.0.** Recorded in their RF rows and backlog §6 (moved from Incr. 4 to Después).

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 — Decisions D1–D5 asked one at a time and logged in `docs/requisitos` | S3 | inline | done (L6–L11) | `2fe2afc` |
| T2 — Requirements cleanup: count 123 vs 136, «dentro» → «Bien» in `ui-design.md`, RNF header placeholder, resolved pending decisions (Apple on Android, store order, password, demo), backlog decision A obsolete and Sprint 0 items done, MOV-08 gap noted | S1, S2 | inline | done (L12); MOV-08 left open | `6b5f7c1` |
| T3 — ADRs: ADR-010:144 (BCI/Santander no longer blocked), ADR-007 per D2, ADR-012 per D1, states per D4; land `629cf80` (CLAUDE.md trim) | S1, S3 | inline | done (L13) | `5f7cc6e`, `2a7e444`, `841514b`, `2c376c1` |
| T4 — `design/tokens.json` from Figma variables (Gustos, block and state colors, type scale, spacing) and regenerated iOS/Android resources | S1, S2 | inline | pending (D2) | |
| T5 — Screen catalog: slim to behavior, cite RF + Figma node per screen, «Deseos» → «Gustos», retired ADR refs, Figma screen map, missing screens (supersedes the checklist of #108) | S1, S2 | inline | pending (D1, D3) | |
| T6 — Figma: frame names carry their requirement IDs; apply D3 | S1, S2 | inline | pending (D3) | |
| T7 — Milestones and issues: #63, #80, #82 per D5; update #108 and #109; populate Sprints 2–5 from the Figma screen map; issues for SOP-03 and AUTH-06 | S1, S3 | inline | in progress (L11, L15) | |

## Log

- **L1** (2026-10-25, user): "Haz una auditoria al repositorio sin realizar ningún cambio. Dime cuales son las acciones que se deben realizar para que los @docs/adr @docs/catalogos, milestones, /Users/jorge/Library/Mobile Documents/iCloud~md~obsidian/Documents/JJ - Developer/0002 EL YO CREADOR/DEV PERSONAL/Mirach/Requisitos, https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=2-3&p=f&t=otbYjUdqkQwJlnLb-0 estén alineados."
- **L2** (2026-10-25, user): "migra los requisitos al repo en docs/requisitos" → done in #121 (`8657d65`).
- **L3** (2026-10-25, user): "Continuemos con la normalización de las 5 referencias."
- **L4** (2026-10-25): prerequisites merged: #122 (`5d9194e`, typescript specifier) and #124 (`1f20ec1`, zod/vite/undici advisories). body-parser and multer tracked in #127 (after 2026-10-29).
- **L5** (2026-10-25): audit evidence. Figma variables on `05 Inicio` (`189:3751`): `color/bloque/gustos #7b61a8`, `necesidades #3c5a80`, `ahorro #009b7d`, `estado/bien #1f8a4c`, `cerca #b7791f`, `sobre #c0392b`, Inter only, type scale (Título 28, Cuerpo 16, Etiqueta 13, Mini 11) and spacing (4/16/24). `tokens.json` still has `deseos #782c5c`, semáforo «Muy Saludable», Inter + Geist Mono, no scale or spacing. Figma screen map: node `156:1630`.
- **L6** (2026-10-25, user, D1): "v1.0 con cobro"
- **L7** (2026-10-25, user, D1, replaces L6 before anything was written): "Espera mejor sigo tu recomendación" → v1.1 with "Plus gratis durante el lanzamiento". Recorded in the RF decision table and PLA intro, and as decided in backlog §8 B and §3 #1.
- **L8** (2026-10-25, user, D2): "solo Inter" → Inter only with tabular figures. Recorded in RNF-USA-006 and `ui-design.md` item 3.
- **L9** (2026-10-25, user, D3): "las tres fuera de v1.0". Open for T7: the "Después de v1.0" milestone description also lists VIS-13 and VIS-14, which backlog §6 still puts in Incr. 4 (v1.0); not part of D3.
- **L10** (2026-10-25, user, D4): "aceptalos así, como recomendás".
- **L11** (2026-10-25, user, D5): "mandan los requisitos, como recomendás".
- T1 committed (`2fe2afc`).
- **L12** (2026-10-25) T2: the audit's "136 requirements" was wrong (the grep counted rows of other tables); a parse of the requirement rows gives 123 (77/35/11) and matches backlog §3 module by module, so the backlog was not changed. Applied, each citing its existing source: pending 4 and 9 resolved (ADR-006; milestone Sprint 5), "Qué cambia" rows resolved (ADR-006, MOV-02, MOV-09, demo removed), AUTH note and PUB-01 updated (both store accounts active), RNF header `proyecto: Mirach`, `ui-design.md` «dentro» → «bien», backlog A and D marked superseded, Sprint 0 Play account and ADRs marked done, related-documents links. Left open: MOV-08 gap (backlog §3 #6) and pending decisions 1, 6, 8. All `.md` links in `docs/requisitos` resolve.
- T2 committed (`6b5f7c1`).
- **L13** (2026-10-25) T3: ADR-007 Inter only; ADR-012 billing in v1.1 (Estado + alternatives row) and a README pending item "Plus gratis en la v1.0" (how Plus rights are granted with no billing); ADR-010 corrected with evidence: BCI and Santander PDF readers exist and are tested with real statements (`apps/api/test/fixtures/pdf`), so the #109 wording "no longer blocked" was also inexact; the gap is product/format coverage (pending decision 1). ADRs 001–012 accepted (frontmatter, Estado, index). `629cf80` cherry-picked cleanly (`841514b`). CLAUDE.md: Gustos (API id still `Deseos`), landing on Vercel under `mirachbudget.app`, bundle ids `app.mirachbudget.ios` / `app.mirachbudget.android`, no "después" for Android. `apps/api/CLAUDE.md` only cites ADR-001 and ADR-009 (new series). The cherry-pick did change `apps/api/CLAUDE.md` (moved the restricted commands there and trimmed the Categorización bullet); see L14. Not done from #109: IMP-17 "descartado" depends on backlog decision C (fusions), still unanswered.
- **L14** (2026-10-25) native review of T1–T3 (reliability lens) approved with three advisories, all valid and fixed: (1) the cherry-picked `629cf80` had dropped durable knowledge from the `apps/api/CLAUDE.md` Categorización bullet (tramo 5b PR6 migration and the retired `backfill-desconocido.ts`); restored verbatim from `629cf80^`, line now identical to the original; (2) L13 wrongly said `apps/api/CLAUDE.md` was unchanged; corrected; (3) the "Qué cambia" profiles row was still open; marked resolved citing PER-04, PER-06 and PER-08 (decided 2026-10-23).
- User (2026-10-25): open the PR for T1–T3 now, continue T5 and T7 on this branch, T4 in its own PR.
- PR #131 opened for T1–T3 (2026-10-25).
- **L15** (2026-10-25) T7 partial: progress comments on #109 (done items; open: pending 6, IMP-17/decision C) and #108 (checklist adjusted for D1, D3, D5; catalog work moves to T5); Sprint 3 milestone description now says billing is decided for v1.1 instead of "Decisión del cobro el domingo 15". Still open in T7: VIS-13/VIS-14 scope (backlog §6 puts them in v1.0, the "Después de v1.0" milestone lists them after), populating Sprints 2–5 from the Figma screen map, issues for SOP-03 and AUTH-06, and #63 (only the on-device Apple revocation test remains).
- **L16** (2026-10-25, user, D6): "las dos fuera de v1.0, como recomendás".
- **L17** (2026-10-25) native review of the updated #131 approved with three advisories: (1) valid, three requirement lines still said BCI and Santander were unverified, contradicting ADR-010; updated with the same evidence; (2) and (3) declined: the HTTP middleware order lives in `app.ts:59-66` and the common commands in each `package.json`, which is what the intentional `629cf80` trim relied on.
- User (2026-10-25): create the 23 Sprint 2–5 issues, with screens 50 and 34 out of v1.0.
- Next: T4 needs its own PR (it changes shipped app resources, and the state tokens depend on #113); T5 and T7 are docs/GitHub only.
