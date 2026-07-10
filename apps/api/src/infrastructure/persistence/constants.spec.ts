import { USER_ID_FIJO, ACCOUNT_ID_FIJO } from './constants';

describe('persistence constants', () => {
  it('expone identificadores fijos, estables y no vacíos', () => {
    // La estabilidad es el contrato: el seed idempotente depende de que
    // estos valores NO cambien entre ejecuciones (US-011, seed twice).
    expect(USER_ID_FIJO).toBe('usuario-fijo-moneydiary');
    expect(ACCOUNT_ID_FIJO).toBe('cuenta-fija-moneydiary');
  });

  it('usa identificadores distintos para usuario y cuenta', () => {
    expect(USER_ID_FIJO).not.toBe(ACCOUNT_ID_FIJO);
  });
});
