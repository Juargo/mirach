import { ResumenController } from './resumen.controller';
import { MovimientosController } from './movimientos.controller';
import { DetalleBucketController } from './detalle-bucket.controller';
import { IngestaController } from './ingesta.controller';
import { IS_SESSION_PUBLIC_KEY } from './auth/session-public.decorator';

/**
 * TRANSITIONAL (Slice 1): asserts the 4 existing data endpoints carry
 * `@PublicSession()` at the controller level, so the newly-global
 * `SessionGuard` (Slice 1b) doesn't 401 every pre-existing mono-user
 * caller. They remain protected by `ApiKeyGuard`. Slice 2 removes this
 * carve-out once `@CurrentUser()` is wired in.
 */
describe('SessionGuard carve-out — existing data endpoints stay @PublicSession()', () => {
  it.each([
    ['ResumenController', ResumenController],
    ['MovimientosController', MovimientosController],
    ['DetalleBucketController', DetalleBucketController],
    ['IngestaController', IngestaController],
  ])('%s carries IS_SESSION_PUBLIC_KEY metadata', (_name, controllerClass) => {
    expect(Reflect.getMetadata(IS_SESSION_PUBLIC_KEY, controllerClass)).toBe(true);
  });
});
