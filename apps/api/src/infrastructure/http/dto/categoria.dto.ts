import { CategoriaConPatrones } from '../../../application/ports/categoria-repository.port';
import { PatronDto, aPatronDto } from './patron.dto';

/**
 * CategoriaDto — ÚNICA forma HTTP de una categoría (US-038, design.md §7.1).
 * Reusada por las entradas del GET list, el `201` de `POST /api/categorias`
 * y el `200` de `PATCH /api/categorias/:id`. `patrones: []` en la creación
 * es cómo se observa CA-03.
 */
export interface CategoriaDto {
  readonly id: string;
  readonly nombre: string;
  readonly bucket: string;
  readonly patrones: ReadonlyArray<PatronDto>;
  /** All-history count of the caller's own transacciones (CAT039-01). */
  readonly transaccionesCount: number;
  /**
   * categoria-iconografia (CATICO-01/04) — the curated allowlist name, or
   * `null`. The mapper ALWAYS sets this key at runtime (D-11 guarantee),
   * even though the wire schema types it as optional.
   */
  readonly icono: string | null;
  /**
   * `true` for a system category (today the three `Desconocido`): it cannot
   * be edited or deleted — PATCH/DELETE answer `403 CATEGORIA_INTERNA`.
   * Clients use it to hide those actions instead of learning it from the 403.
   */
  readonly esInterna: boolean;
}

export function aCategoriaDto(categoria: CategoriaConPatrones): CategoriaDto {
  return {
    id: categoria.id,
    nombre: categoria.nombre,
    bucket: categoria.bucket,
    patrones: categoria.patrones.map(aPatronDto),
    transaccionesCount: categoria.transaccionesCount,
    icono: categoria.icono,
    esInterna: categoria.esInterna,
  };
}
