/**
 * IconoCategoria — value object (allowlist curada) para el ícono lucide de
 * una `Categoria` (categoria-iconografia, ADR-045 D-01/D-02).
 *
 * `ICONOS_CATEGORIA` es la ÚNICA autoridad de validez de un `icono` — un
 * nombre real de la librería lucide que no está en esta lista se rechaza
 * exactamente igual que cualquier otro string (CATICO-01). Los 24 valores
 * son el identificador kebab-case de lucide (no PascalCase, no emoji —
 * ADR-027), verificados contra los exports de `lucide-react` y
 * `lucide-react-native` (ver design.md).
 *
 * Vive en `domain` (no en `application`, a diferencia de los buckets
 * asignables `['Necesidades', 'Deseos', 'Ahorro']` de
 * `crear-categoria.use-case.ts`) porque este vocabulario lo consumen DOS
 * use cases (crear/actualizar) **y** la plantilla de infraestructura
 * (`catalogo-template.ts`) — infra puede importar de domain (ADR-005), así
 * que una sola fuente aquí evita triplicar la lista.
 */
export const ICONOS_CATEGORIA = [
  'shopping-cart',
  'fuel',
  'pill',
  'heart-pulse',
  'bus',
  'house',
  'zap',
  'wifi',
  'smartphone',
  'graduation-cap',
  'shield',
  'car',
  'paw-print',
  'tv',
  'bike',
  'utensils',
  'shirt',
  'plane',
  'gamepad-2',
  'gift',
  'dumbbell',
  'piggy-bank',
  'trending-up',
  'credit-card',
] as const;

/** Nombre lucide kebab-case perteneciente a la allowlist curada. */
export type IconoCategoria = (typeof ICONOS_CATEGORIA)[number];

/**
 * esIconoCategoria — type guard. `true` solo si `valor` es un string
 * presente en `ICONOS_CATEGORIA`; cualquier otro tipo, o un string ausente
 * de la lista (incluso un nombre lucide real, CATICO-01), es `false`.
 */
export function esIconoCategoria(valor: unknown): valor is IconoCategoria {
  return (
    typeof valor === 'string' &&
    (ICONOS_CATEGORIA as readonly string[]).includes(valor)
  );
}
