import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule — provee una ÚNICA instancia compartida de PrismaService a toda
 * la app (@Global).
 *
 * Sin esto, cada módulo que lista `PrismaService` en sus providers (IngestaModule,
 * MovimientosModule) obtiene su PROPIA instancia module-scoped. Dos instancias
 * rompen el e2e basado en spies: `moduleFixture.get(PrismaService)` resuelve una
 * instancia distinta a la que usa el pipeline, así que un `vi.spyOn` sobre el
 * PrismaService del test no intercepta las llamadas reales. Además abre conexiones
 * duplicadas contra el mismo pool. Una sola instancia global evita ambos problemas.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
