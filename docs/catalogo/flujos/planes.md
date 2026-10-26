# Plan y suscripción

Plan gratis, prueba de 30 días de Plus y cobro mediante las tiendas (PLA-01 a PLA-09, IMP-24). **Fuera de la v1.0**: por la decisión D1 (25-10-2026), el cobro entra en la v1.1 y la v1.0 sale con Plus gratis para todos. Este flujo se especifica en detalle antes de la v1.1 (#155).

## Pantallas

| N° | Pantalla | Figma | Requisitos | Alcance |
|---|---|---|---|---|
| 15 | Planes | [`91:368`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=91-368) | PLA-01, PLA-03, PLA-04, PLA-05 | v1.1 |
| 32 | Aviso · límite de 2 bancos (plan gratis) | [`138:1022`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=138-1022) | IMP-24 | v1.1 |
| 38 | Inicio · aviso de fin de prueba | [`198:3919`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=198-3919) | PLA-09 | v1.1 |
| 39 | Terminó la prueba · plan gratis | [`146:1158`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=146-1158) | PLA-02, PLA-07, PLA-09 | v1.1 |
| 40 | Error de pago | [`146:1195`](https://www.figma.com/design/NY2IRzO5C4z6Y4NTfuAG2u/Mirach-UI?node-id=146-1195) | PLA-03 | v1.1 |
| 26b, 27b | Categorías · plan gratis | ver [Categorías y patrones](categorias-y-patrones.md) | CLA-09, PLA-01 | v1.1 |

## Endpoints

Ninguno existe todavía. ADR-005 §7 y ADR-012 prevén `GET /api/plan`, el webhook `POST /api/webhooks/revenuecat`, `GET /api/config` (límites del plan gratis, PLA-08) y la validación del límite de bancos en `preview` y `commit` (IMP-24).

## Pendiente en el API

- Cómo se otorgan los derechos de Plus a todas las cuentas en la v1.0 y cómo se pasa a la prueba de 30 días en la v1.1 (pendiente en el [README de ADRs](../../adr/README.md)).
- Brecha 19 (#116): `GET /api/config`.
