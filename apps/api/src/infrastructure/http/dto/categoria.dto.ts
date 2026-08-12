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
}

export function aCategoriaDto(categoria: CategoriaConPatrones): CategoriaDto {
  return {
    id: categoria.id,
    nombre: categoria.nombre,
    bucket: categoria.bucket,
    patrones: categoria.patrones.map(aPatronDto),
  };
}
