# Requisitos de Mirach

Este directorio es la fuente de verdad de **qué** debe hacer el producto y con qué calidad. Las decisiones técnicas (**cómo** se cumple) viven en [`docs/adr/`](../adr/README.md); el diseño visual, en Figma ([Mirach-UI](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u)); la planificación, en los milestones e issues de GitHub.

Los documentos se migraron desde las notas de Obsidian el 2026-10-25, sin cambios de contenido salvo los enlaces internos.

## Documentos

| Documento | Contenido |
|---|---|
| [Requisitos funcionales v1](requisitos-funcionales-v1.md) | Módulos, requisitos con ID (`CLA-14`, `IMP-05`...), reglas de negocio y decisiones de producto |
| [Requisitos no funcionales](requisitos-no-funcionales.md) | Atributos de calidad con ID (`RNF-SEC-002`...) |
| [Priorización del Product Backlog v1](priorizacion-backlog-v1.md) | Épicas, releases, Definición de Listo y de Terminado |
| [UI Design](ui-design.md) | Principios visuales de la app |
| [Prueba del prototipo v1](pruebas-de-usuario/prueba-prototipo-v1.md) | Guion y plantilla de registro de la prueba con usuarios |

## Reglas

- **Un dato, un dueño.** Los ADRs, el catálogo de pantallas, Figma y los issues citan los requisitos por ID; no copian su texto.
- **Una decisión de producto entra aquí primero**, por PR y con fecha, y después se refleja en ADRs, Figma, catálogo e issues, en ese orden.
- **Los IDs son estables.** Un requisito descartado se marca como tal; su ID no se reutiliza.
- **Datos de participantes fuera del repositorio.** El repositorio es público: los registros de pruebas con usuarios solo se suben anonimizados (sin nombre, edad exacta ni frases que identifiquen a la persona).
