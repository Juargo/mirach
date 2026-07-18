import { ResumenController } from './resumen.controller';
import { MovimientosController } from './movimientos.controller';
import { DetalleBucketController } from './detalle-bucket.controller';
import { IngestaController } from './ingesta.controller';
import { IS_SESSION_PUBLIC_KEY } from './auth/session-public.decorator';

/**
 * Slice 2 rewires the 4 data endpoints to derive `userId` from
 * `@CurrentUser()` — the transitional `@PublicSession()` carve-out (Slice 1b)
 * is gone, so `SessionGuard` is mandatory on all four again (ISO-01).
 *
 * This is a permanent regression guard: none of these controllers may carry
 * `IS_SESSION_PUBLIC_KEY` metadata again without an explicit, reviewed
 * decision — a silent reintroduction would quietly reopen the keyless
 * fallback this slice closes.
 */
describe('SessionGuard enforcement — data endpoints no longer carve out @PublicSession()', () => {
  it.each([
    ['ResumenController', ResumenController],
    ['MovimientosController', MovimientosController],
    ['DetalleBucketController', DetalleBucketController],
    ['IngestaController', IngestaController],
  ])('%s does NOT carry IS_SESSION_PUBLIC_KEY metadata', (_name, controllerClass) => {
    expect(Reflect.getMetadata(IS_SESSION_PUBLIC_KEY, controllerClass)).toBeUndefined();
  });
});
