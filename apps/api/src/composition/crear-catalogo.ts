import type { PrismaClient } from '@prisma/client';

import { ListarCatalogoUseCase } from '../application/use-cases/listar-catalogo.use-case';
import { CrearCategoriaUseCase } from '../application/use-cases/crear-categoria.use-case';
import { ActualizarCategoriaUseCase } from '../application/use-cases/actualizar-categoria.use-case';
import { EliminarCategoriaUseCase } from '../application/use-cases/eliminar-categoria.use-case';
import { CrearPatronUseCase } from '../application/use-cases/crear-patron.use-case';
import { ActualizarPatronUseCase } from '../application/use-cases/actualizar-patron.use-case';
import { EliminarPatronUseCase } from '../application/use-cases/eliminar-patron.use-case';

import { VistaPreviaPatronUseCase } from '../application/use-cases/vista-previa-patron.use-case';
import { CategorizarTransaccionUseCase } from '../application/use-cases/categorizar-transaccion.use-case';
import { PlanificadorAprendizaje } from '../application/services/planificador-aprendizaje';
import type { ICryptoService } from '../application/ports/crypto-service.port';
import type { ILogger } from '../application/ports/logger.port';

import { PrismaCatalogoClasificacionRepository } from '../infrastructure/persistence/prisma-catalogo-clasificacion.repository';
import { PrismaMovimientosParaAprenderReader } from '../infrastructure/persistence/prisma-movimientos-para-aprender.reader';
import { PrismaPerfilPresupuestoRepository } from '../infrastructure/persistence/prisma-perfil-presupuesto.repository';
import { PrismaUltimoPeriodoConDatosReader } from '../infrastructure/persistence/prisma-ultimo-periodo-con-datos.repository';
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
  /** CLA-15 — `POST /api/patrones/vista-previa`. */
  readonly vistaPreviaPatron: VistaPreviaPatronUseCase;
}

/**
 * crearCatalogo — ensambla el grafo del catálogo CRUD (US-038, design.md
 * D-10). Mirrors `crearAuth`/`crearAuthGoogle`/`crearProcessIngesta`: los 2
 * adapters Prisma se construyen UNA vez acá y se comparten entre los use
 * cases que los necesitan (`CrearPatronUseCase` necesita ambos —
 * `categoriaRepository` para el 404 de ownership, `patronRepository` para
 * el resto; `CrearCategoriaUseCase` también necesita ambos desde
 * CAT038-10/11 — `patronRepository.buscarPorTexto` para el chequeo de
 * duplicado contra el catálogo existente de cada patrón anidado).
 */
export function crearCatalogo(
  prisma: PrismaClient,
  crypto: ICryptoService,
  logger: ILogger,
): CatalogoGraph {
  const categoriaRepository = new PrismaCategoriaRepository(prisma);
  const patronRepository = new PrismaPatronRepository(prisma);
  // Classification learning (CLA-03, CLA-15): one planner shared by the
  // preview and the saves, so the count shown and the rows moved agree.
  const planificador = new PlanificadorAprendizaje(
    new PrismaCatalogoClasificacionRepository(prisma),
    new PrismaMovimientosParaAprenderReader(prisma, crypto),
    new PrismaPerfilPresupuestoRepository(prisma),
    new PrismaUltimoPeriodoConDatosReader(prisma),
    new CategorizarTransaccionUseCase(logger),
  );

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
    vistaPreviaPatron: new VistaPreviaPatronUseCase(
      categoriaRepository,
      planificador,
    ),
  };
}
