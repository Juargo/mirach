import { CategoriaConPatrones } from '../../../application/ports/categoria-repository.port';
import { CategoriaDto, aCategoriaDto } from './categoria.dto';

/**
 * CatalogoDto — contrato HTTP de `GET /api/categorias` (US-038). Envelope
 * `{ categorias: [...] }`, mismo patrón que `IngestaListResponseDto`
 * (`{ ingestas: [...] }`).
 */
export interface CatalogoDto {
  readonly categorias: ReadonlyArray<CategoriaDto>;
}

export function aCatalogoDto(
  categorias: ReadonlyArray<CategoriaConPatrones>,
): CatalogoDto {
  return { categorias: categorias.map(aCategoriaDto) };
}
