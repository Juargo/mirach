import type { PrismaClient } from '@prisma/client';

import { ListarCatalogoUseCase } from '../application/use-cases/listar-catalogo.use-case';
import { CrearCategoriaUseCase } from '../application/use-cases/crear-categoria.use-case';
import { ActualizarCategoriaUseCase } from '../application/use-cases/actualizar-categoria.use-case';
import { EliminarCategoriaUseCase } from '../application/use-cases/eliminar-categoria.use-case';
import { CrearPatronUseCase } from '../application/use-cases/crear-patron.use-case';
import { ActualizarPatronUseCase } from '../application/use-cases/actualizar-patron.use-case';
import { EliminarPatronUseCase } from '../application/use-cases/eliminar-patron.use-case';

import { PrismaCategoriaRepository } from '../infrastructure/persistence/prisma-categoria.repository';
import { PrismaPatronRepository } from '../infrastructure/persistence/prisma-patron.repository';

/**
 * CatalogoGraph — las 7 piezas del catálogo CRUD que consumen
 * `registrarCategorias`/`registrarPatrones` (US-038, D-10). Un único objeto
 * (mirrors `AuthGraph`) en vez de 7 parámetros sueltos.
 */
export interface CatalogoGraph {
  readonly listarCatalogo: ListarCatalogoUseCase;
  readonly crearCategoria: CrearCategoriaUseCase;
  readonly actualizarCategoria: ActualizarCategoriaUseCase;
  readonly eliminarCategoria: EliminarCategoriaUseCase;
  readonly crearPatron: CrearPatronUseCase;
  readonly actualizarPatron: ActualizarPatronUseCase;
  readonly eliminarPatron: EliminarPatronUseCase;
}

/**
 * crearCatalogo — ensambla el grafo del catálogo CRUD (US-038, design.md
 * D-10). Mirrors `crearAuth`/`crearAuthGoogle`/`crearProcessIngesta`: los 2
 * adapters Prisma se construyen UNA vez acá y se comparten entre los use
 * cases que los necesitan (`CrearPatronUseCase` necesita ambos —
 * `categoriaRepository` para el 404 de ownership, `patronRepository` para
 * el resto; `CrearCategoriaUseCase` también necesita ambos desde
 * CAT038-10/11 — `patronRepository.existePatron` para el chequeo de
 * duplicado contra el catálogo existente de cada patrón anidado).
 */
export function crearCatalogo(prisma: PrismaClient): CatalogoGraph {
  const categoriaRepository = new PrismaCategoriaRepository(prisma);
  const patronRepository = new PrismaPatronRepository(prisma);

  return {
    listarCatalogo: new ListarCatalogoUseCase(categoriaRepository),
    crearCategoria: new CrearCategoriaUseCase(
      categoriaRepository,
      patronRepository,
    ),
    actualizarCategoria: new ActualizarCategoriaUseCase(categoriaRepository),
    eliminarCategoria: new EliminarCategoriaUseCase(categoriaRepository),
    crearPatron: new CrearPatronUseCase(categoriaRepository, patronRepository),
    actualizarPatron: new ActualizarPatronUseCase(patronRepository),
    eliminarPatron: new EliminarPatronUseCase(patronRepository),
  };
}
