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

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 — Decisions D1–D5 asked one at a time and logged in `docs/requisitos` | S3 | inline | done (L6–L11) | |
| T2 — Requirements cleanup: count 123 vs 136, «dentro» → «Bien» in `ui-design.md`, RNF header placeholder, resolved pending decisions (Apple on Android, store order, password, demo), backlog decision A obsolete and Sprint 0 items done, MOV-08 gap noted | S1, S2 | inline | pending | |
| T3 — ADRs: ADR-010:144 (BCI/Santander no longer blocked), ADR-007 per D2, ADR-012 per D1, states per D4; land `629cf80` (CLAUDE.md trim) | S1, S3 | inline | pending (D1, D2, D4) | |
| T4 — `design/tokens.json` from Figma variables (Gustos, block and state colors, type scale, spacing) and regenerated iOS/Android resources | S1, S2 | inline | pending (D2) | |
| T5 — Screen catalog: slim to behavior, cite RF + Figma node per screen, «Deseos» → «Gustos», retired ADR refs, Figma screen map, missing screens (supersedes the checklist of #108) | S1, S2 | inline | pending (D1, D3) | |
| T6 — Figma: frame names carry their requirement IDs; apply D3 | S1, S2 | inline | pending (D3) | |
| T7 — Milestones and issues: #63, #80, #82 per D5; update #108 and #109; populate Sprints 2–5 from the Figma screen map; issues for SOP-03 and AUTH-06 | S1, S3 | inline | pending (D1, D5) | |

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
- Next: commit T1 (requirements decisions) and continue with T2.
