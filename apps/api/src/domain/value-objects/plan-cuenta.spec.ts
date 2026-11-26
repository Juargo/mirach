import {
  EstadoSuscripcion,
  MotivoPermiso,
  OrigenLanzamiento,
  OrigenSuscripcion,
  Plan,
  TiendaSuscripcion,
  resolverPlanCuenta,
  type DerechosCuenta,
  type ReglaPrueba,
} from './plan';

const DIA = 24 * 60 * 60 * 1000;
const ACTIVACION = new Date('2026-12-01T00:00:00.000Z');
const dias = (n: number, desde: Date = ACTIVACION) =>
  new Date(desde.getTime() + n * DIA);

const REGLA: ReglaPrueba = {
  cobroActivoDesde: ACTIVACION,
  diasPrueba: 30,
  diasAviso: 3,
};

function cuenta(cambios: Partial<DerechosCuenta> = {}): DerechosCuenta {
  return {
    cuentaCreadaEn: dias(10),
    suscripcion: null,
    permisos: [],
    ...cambios,
  };
}

describe('resolverPlanCuenta', () => {
  describe('antes de activar el cobro', () => {
    it('sin fecha de activación toda cuenta tiene Plus por el lanzamiento', () => {
      const plan = resolverPlanCuenta(
        cuenta(),
        { ...REGLA, cobroActivoDesde: null },
        dias(500),
      );

      expect(plan).toEqual({
        plan: Plan.Plus,
        origen: OrigenLanzamiento,
        venceEn: null,
        renueva: false,
        producto: null,
        tienda: null,
        prueba: null,
      });
    });

    it('con la activación programada, el lanzamiento vence ese día', () => {
      const plan = resolverPlanCuenta(
        cuenta({ cuentaCreadaEn: dias(-20) }),
        REGLA,
        dias(-5),
      );

      expect(plan).toMatchObject({
        plan: Plan.Plus,
        origen: OrigenLanzamiento,
        venceEn: ACTIVACION,
        prueba: null,
      });
    });

    it('informa un derecho guardado antes que el lanzamiento', () => {
      const plan = resolverPlanCuenta(
        cuenta({
          permisos: [
            {
              motivo: MotivoPermiso.Fundador,
              otorgadoEn: dias(-3),
              venceEn: null,
              revocadoEn: null,
            },
          ],
        }),
        { ...REGLA, cobroActivoDesde: null },
        dias(0),
      );

      expect(plan.origen).toBe(MotivoPermiso.Fundador);
      expect(plan.prueba).toBeNull();
    });
  });

  describe('prueba de una cuenta nueva', () => {
    it('corre 30 días desde la creación de la cuenta', () => {
      const plan = resolverPlanCuenta(cuenta(), REGLA, dias(11));

      expect(plan).toEqual({
        plan: Plan.Plus,
        origen: MotivoPermiso.Prueba,
        venceEn: dias(40),
        renueva: false,
        producto: null,
        tienda: null,
        prueba: { venceEn: dias(40), vigente: true, avisoDiasRestantes: null },
      });
    });

    it('al terminar, la cuenta queda en el plan gratis y la prueba figura terminada', () => {
      const plan = resolverPlanCuenta(cuenta(), REGLA, dias(40));

      expect(plan).toEqual({
        plan: Plan.Gratis,
        origen: null,
        venceEn: null,
        renueva: false,
        producto: null,
        tienda: null,
        prueba: { venceEn: dias(40), vigente: false, avisoDiasRestantes: null },
      });
    });
  });

  describe('prueba de una cuenta que ya existía al activar el cobro', () => {
    it('corre 30 días desde la activación, no desde su creación', () => {
      const plan = resolverPlanCuenta(
        cuenta({ cuentaCreadaEn: dias(-200) }),
        REGLA,
        dias(29),
      );

      expect(plan).toMatchObject({
        plan: Plan.Plus,
        origen: MotivoPermiso.Prueba,
        venceEn: dias(30),
      });
    });

    it('termina a los 30 días de la activación', () => {
      const plan = resolverPlanCuenta(
        cuenta({ cuentaCreadaEn: dias(-200) }),
        REGLA,
        dias(30),
      );

      expect(plan.plan).toBe(Plan.Gratis);
    });
  });

  describe('aviso de fin de prueba (PLA-09)', () => {
    it.each([
      ['a más de 3 días', 36.9, null],
      ['a 3 días exactos', 37, 3],
      ['a 2 días y medio', 37.5, 3],
      ['a 1 día y medio', 38.5, 2],
      ['a una hora', 40 - 1 / 24, 1],
    ])('%s del fin avisa %s', (_caso, dia, esperado) => {
      const plan = resolverPlanCuenta(cuenta(), REGLA, dias(dia));

      expect(plan.prueba?.avisoDiasRestantes).toBe(esperado);
    });

    it('no avisa si otro derecho mantiene Plus después de la prueba', () => {
      const plan = resolverPlanCuenta(
        cuenta({
          suscripcion: {
            estado: EstadoSuscripcion.Activa,
            producto: 'plus_anual',
            tienda: TiendaSuscripcion.AppStore,
            venceEn: dias(400),
          },
        }),
        REGLA,
        dias(39),
      );

      expect(plan.origen).toBe(OrigenSuscripcion);
      expect(plan.prueba).toEqual({
        venceEn: dias(40),
        vigente: true,
        avisoDiasRestantes: null,
      });
    });

    it('no avisa una vez terminada', () => {
      const plan = resolverPlanCuenta(cuenta(), REGLA, dias(41));

      expect(plan.prueba?.avisoDiasRestantes).toBeNull();
    });
  });

  describe('casos límite', () => {
    it('con 0 días de prueba no hay prueba: la cuenta parte en el plan gratis', () => {
      const plan = resolverPlanCuenta(
        cuenta(),
        { ...REGLA, diasPrueba: 0 },
        dias(11),
      );

      expect(plan.plan).toBe(Plan.Gratis);
      expect(plan.prueba).toBeNull();
    });

    it('un permiso de prueba guardado reemplaza a la prueba derivada', () => {
      const plan = resolverPlanCuenta(
        cuenta({
          permisos: [
            {
              motivo: MotivoPermiso.Prueba,
              otorgadoEn: dias(10),
              venceEn: dias(100),
              revocadoEn: null,
            },
          ],
        }),
        REGLA,
        dias(60),
      );

      expect(plan).toMatchObject({
        plan: Plan.Plus,
        origen: MotivoPermiso.Prueba,
        venceEn: dias(100),
        prueba: { venceEn: dias(100), vigente: true },
      });
    });

    it('un permiso de prueba guardado y revocado deja la cuenta sin prueba', () => {
      const plan = resolverPlanCuenta(
        cuenta({
          permisos: [
            {
              motivo: MotivoPermiso.Prueba,
              otorgadoEn: dias(10),
              venceEn: dias(100),
              revocadoEn: dias(12),
            },
          ],
        }),
        REGLA,
        dias(15),
      );

      expect(plan.plan).toBe(Plan.Gratis);
      expect(plan.prueba).toMatchObject({ vigente: false });
    });

    it('sin fecha de creación de la cuenta no deriva una prueba', () => {
      const plan = resolverPlanCuenta(
        cuenta({ cuentaCreadaEn: null }),
        REGLA,
        dias(11),
      );

      expect(plan.plan).toBe(Plan.Gratis);
      expect(plan.prueba).toBeNull();
    });
  });
});
