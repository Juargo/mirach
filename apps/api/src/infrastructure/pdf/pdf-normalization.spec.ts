import { normalizarTransaccionesPdf } from './pdf-normalization';
import { PagedToken } from './pdf-text-extractor';
import { EstructuraPdfBanco } from './strategies/estructura-pdf-banco';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { Transaccion } from '../../domain/value-objects/transaccion';

function tok(str: string, x: number, y: number, page = 1): PagedToken {
  return { str, x, y, page };
}

/** Rangos calcados de SantanderPdfStrategy.getEstructura() (empíricamente pinneados en PR3). */
const rangosXSantander = [
  { col: 'fecha' as const, xMin: 25, xMax: 90 },
  { col: 'descripcion' as const, xMin: 95, xMax: 325 },
  { col: 'cargo' as const, xMin: 395, xMax: 450 },
  { col: 'abono' as const, xMin: 495, xMax: 520 },
];

function estructuraBase(
  overrides: Partial<EstructuraPdfBanco> = {},
): EstructuraPdfBanco {
  return {
    banco: BancoConocido.Santander,
    anclasEncabezado: [],
    anclasPeriodo: { desde: /x/, hasta: /x/ },
    rangosX: rangosXSantander,
    toleranciaY: 2,
    formatoFecha: 'DD/MM',
    fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
    filasIgnoradas: [/Resumen de Comisiones/],
    ...overrides,
  };
}

const periodoMarzo2026 = { desde: '2026-03-01', hasta: '2026-03-31' };

/** Desempaqueta un Result Ok o falla el test con un mensaje útil si es Fail. */
function ok(
  resultado: ReturnType<typeof normalizarTransaccionesPdf>,
): ReturnType<typeof normalizarTransaccionesPdf> extends infer R
  ? R extends { getValue(): infer V }
    ? V
    : never
  : never {
  if (resultado.isFail()) {
    throw new Error(
      `Se esperaba Result.ok pero fue Result.fail: ${resultado.getError().message}`,
    );
  }

  return resultado.getValue();
}

describe('normalizarTransaccionesPdf', () => {
  it('reconstruye una fila con fecha+sucursal fusionadas en un solo token (caso Santander) y descripción palabra-por-palabra', () => {
    const tokens = [
      tok('07/03 Providencia', 30, 100),
      tok('Compra', 100, 100),
      tok('Supermercado', 140, 100),
      tok('Generico', 190, 100),
      tok('45.990', 400, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
    );

    expect(resultado).toEqual([
      Transaccion.crear({
        fecha: new Date(Date.UTC(2026, 2, 7)),
        descripcion: 'Compra Supermercado Generico',
        cargo: 45990,
        abono: 0,
      }).getValue(),
    ]);
  });

  it('asigna abono cuando el monto cae en la columna abono, cargo queda en 0', () => {
    const tokens = [
      tok('05/03 Providencia', 30, 100),
      tok('Abono', 100, 100),
      tok('Sueldo', 140, 100),
      tok('850.000', 500, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
    );

    expect(resultado).toEqual([
      Transaccion.crear({
        fecha: new Date(Date.UTC(2026, 2, 5)),
        descripcion: 'Abono Sueldo',
        cargo: 0,
        abono: 850000,
      }).getValue(),
    ]);
  });

  it('descarta filas sin fecha interpretable (encabezados de tabla, etiquetas)', () => {
    const tokens = [
      tok('FECHA', 30, 200),
      tok('DESCRIPCION', 100, 200),
      tok('05/03 Providencia', 30, 100),
      tok('Abono', 100, 100),
      tok('850.000', 500, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
    );

    expect(resultado).toHaveLength(1);
  });

  it('excluye filas que matchean filasIgnoradas aunque traigan una fecha con formato válido', () => {
    const tokens = [
      tok('01/03 OPER.', 30, 200),
      tok('Resumen', 100, 200),
      tok('de', 140, 200),
      tok('Comisiones', 160, 200),
      tok('05/03 Providencia', 30, 100),
      tok('Abono', 100, 100),
      tok('850.000', 500, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0].descripcion).toBe('Abono');
  });

  it('REGRESIÓN: dos filas con (fecha, descripcion, cargo, abono) IDÉNTICAS pero sin anclaFinTabla entre medio son dos movimientos reales distintos — NO se deduplican por valor', () => {
    // Escenario del revisor: dos compras genuinas, mismo día/comercio/monto,
    // a Y distintas. Deduplicar por tupla de valor las colapsaba en 1 y
    // corrompía el total consolidado — ver comentario de diseño en
    // pdf-normalization.ts (por qué se removió `deduplicar`).
    const tokens = [
      tok('12/03 OPER.', 30, 100),
      tok('Compra', 100, 100),
      tok('Cafeteria', 140, 100),
      tok('Local', 190, 100),
      tok('3.500', 400, 100),
      tok('12/03 OPER.', 30, 50),
      tok('Compra', 100, 50),
      tok('Cafeteria', 140, 50),
      tok('Local', 190, 50),
      tok('3.500', 400, 50),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
    );

    expect(resultado).toHaveLength(2);
  });

  it('filasIgnoradas SOLO descarta la fila que matchea — las filas reales que vienen DESPUÉS se siguen recolectando (per-row skip ≠ fin de tabla)', () => {
    const tokens = [
      // Fila ignorada (simula SALDO INICIAL, típicamente de las primeras
      // filas de la tabla — truncar acá perdería todo el statement).
      tok('01/03 OPER.', 30, 300),
      tok('Resumen', 100, 300),
      tok('de', 140, 300),
      tok('Comisiones', 160, 300),
      // Movimientos reales DESPUÉS de la fila ignorada.
      tok('05/03 Providencia', 30, 200),
      tok('Abono', 100, 200),
      tok('850.000', 500, 200),
      tok('10/03 Providencia', 30, 100),
      tok('Compra', 100, 100),
      tok('45.990', 400, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
    );

    expect(resultado).toHaveLength(2);
  });

  it('anclaFinTabla corta la recolección: las filas ANTES se mantienen, las filas DESPUÉS (incluido el eco de la última fila) se descartan', () => {
    const tokens = [
      // Movimiento real antes del terminador.
      tok('05/03 Providencia', 30, 300),
      tok('Abono', 100, 300),
      tok('850.000', 500, 300),
      // Ancla de fin de tabla (Santander: "Resumen de Comisiones").
      tok('Resumen', 100, 200),
      tok('de', 140, 200),
      tok('Comisiones', 160, 200),
      // Eco de la última fila del detalle, repetido DESPUÉS del terminador
      // — no debe contarse como movimiento.
      tok('05/03 Providencia', 30, 100),
      tok('Abono', 100, 100),
      tok('850.000', 500, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(
        tokens,
        estructuraBase({ anclaFinTabla: /Resumen de Comisiones/ }),
        periodoMarzo2026,
      ),
    );

    expect(resultado).toHaveLength(1);
    expect(resultado[0].descripcion).toBe('Abono');
  });

  it('NO deduplica dos filas con fecha distinta aunque el resto coincida', () => {
    const tokens = [
      tok('05/03 OPER.', 30, 100),
      tok('Pago', 100, 100),
      tok('9.990', 400, 100),
      tok('06/03 OPER.', 30, 50),
      tok('Pago', 100, 50),
      tok('9.990', 400, 50),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
    );

    expect(resultado).toHaveLength(2);
  });

  it('infiere el año a partir del período cuando no hay cruce de mes', () => {
    const tokens = [
      tok('15/03 OPER.', 30, 100),
      tok('Pago', 100, 100),
      tok('1.000', 400, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
    );

    expect(resultado[0].fecha).toEqual(new Date(Date.UTC(2026, 2, 15)));
  });

  it('[year-crossing END-TO-END] cruce Nov→Dic→Ene→Feb incrementa el año inferido correctamente (sintético, Santander no cruza año en su fixture real)', () => {
    const tokens = [
      tok('10/11 OPER.', 30, 400),
      tok('Movimiento Noviembre', 100, 400),
      tok('1.000', 400, 400),

      tok('10/12 OPER.', 30, 300),
      tok('Movimiento Diciembre', 100, 300),
      tok('1.000', 400, 300),

      tok('10/01 OPER.', 30, 200),
      tok('Movimiento Enero', 100, 200),
      tok('1.000', 400, 200),

      tok('10/02 OPER.', 30, 100),
      tok('Movimiento Febrero', 100, 100),
      tok('1.000', 400, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(tokens, estructuraBase(), {
        desde: '2025-11-01',
        hasta: '2026-02-28',
      }),
    );

    expect(resultado.map((t) => t.fecha)).toEqual([
      new Date(Date.UTC(2025, 10, 10)),
      new Date(Date.UTC(2025, 11, 10)),
      new Date(Date.UTC(2026, 0, 10)),
      new Date(Date.UTC(2026, 1, 10)),
    ]);
  });

  it('fuenteAnio explícito (formato DD/MM/YYYY, caso BCI) usa el año de la propia fila, sin necesitar período', () => {
    const rangosXBci = [
      { col: 'fecha' as const, xMin: 0, xMax: 100 },
      { col: 'descripcion' as const, xMin: 100, xMax: 300 },
      { col: 'cargo' as const, xMin: 300, xMax: 400 },
      { col: 'abono' as const, xMin: 400, xMax: 500 },
    ];
    const tokens = [
      tok('01/04/2026', 30, 100),
      tok('Pago Credito', 150, 100),
      tok('50.000', 350, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(
        tokens,
        estructuraBase({
          banco: BancoConocido.BCI,
          formatoFecha: 'DD/MM/YYYY',
          fuenteAnio: { kind: 'explicito' },
          rangosX: rangosXBci,
          filasIgnoradas: [],
        }),
        undefined,
      ),
    );

    expect(resultado).toEqual([
      Transaccion.crear({
        fecha: new Date(Date.UTC(2026, 3, 1)),
        descripcion: 'Pago Credito',
        cargo: 50000,
        abono: 0,
      }).getValue(),
    ]);
  });

  it('formato DD/Mmm (BancoEstado, mes abreviado español) parsea correctamente — implementado en PR4b', () => {
    const tokens = [
      tok('02/Abr', 30, 100),
      tok('Compra', 100, 100),
      tok('5.000', 400, 100),
    ];

    const resultado = ok(
      normalizarTransaccionesPdf(
        tokens,
        estructuraBase({
          formatoFecha: 'DD/Mmm',
          fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
        }),
        { desde: '2026-04-01', hasta: '2026-04-30' },
      ),
    );

    expect(resultado).toEqual([
      Transaccion.crear({
        fecha: new Date(Date.UTC(2026, 3, 2)),
        descripcion: 'Compra',
        cargo: 5000,
        abono: 0,
      }).getValue(),
    ]);
  });

  it('DD/Mmm es case-insensitive y cubre los 12 meses en español', () => {
    const casos: Array<[string, number]> = [
      ['01/Ene', 0],
      ['01/FEB', 1],
      ['01/mar', 2],
      ['01/Abr', 3],
      ['01/May', 4],
      ['01/Jun', 5],
      ['01/Jul', 6],
      ['01/Ago', 7],
      ['01/Sep', 8],
      ['01/Oct', 9],
      ['01/Nov', 10],
      ['01/Dic', 11],
    ];

    for (const [texto, mesIndex0] of casos) {
      const tokens = [
        tok(texto, 30, 100),
        tok('X', 100, 100),
        tok('1.000', 400, 100),
      ];
      const resultado = ok(
        normalizarTransaccionesPdf(
          tokens,
          estructuraBase({ formatoFecha: 'DD/Mmm' }),
          periodoMarzo2026,
        ),
      );
      expect(resultado[0].fecha.getUTCMonth()).toBe(mesIndex0);
    }
  });

  it('sin período y formato que requiere inferencia → usa el año actual como fallback defensivo (nunca lanza)', () => {
    const tokens = [
      tok('15/03 OPER.', 30, 100),
      tok('Pago', 100, 100),
      tok('1.000', 400, 100),
    ];

    expect(() =>
      normalizarTransaccionesPdf(tokens, estructuraBase(), undefined),
    ).not.toThrow();
  });

  describe('hardening PR4b — monto malformado nunca se vuelve 0 en silencio (ADR-015)', () => {
    it.each([
      ['15.000-', 'signo negativo al final'],
      ['1.500,50', 'coma decimal'],
      ['12.34', 'grupo separador mal formado'],
      ['abc', 'texto no numérico'],
    ])(
      'cargo malformado ("%s" — %s) → Result.fail con MontoIleeible, NO una transacción con cargo=0',
      (valorMalformado) => {
        const tokens = [
          tok('05/03 OPER.', 30, 100),
          tok('Pago', 100, 100),
          tok(valorMalformado, 400, 100),
        ];

        const resultado = normalizarTransaccionesPdf(
          tokens,
          estructuraBase(),
          periodoMarzo2026,
        );

        expect(resultado.isFail()).toBe(true);
        const error = resultado.getError();
        expect(error.problemas).toEqual([
          { tipo: 'MontoIleeible', fila: 1, columna: 'cargo' },
        ]);
        // El mensaje nunca interpola el valor crudo (podría ser un monto real).
        expect(error.message).not.toContain(valorMalformado);
      },
    );

    it('abono malformado también se reporta (misma taxonomía, columna "abono")', () => {
      const tokens = [
        tok('05/03 OPER.', 30, 100),
        tok('Abono', 100, 100),
        tok('9,90', 500, 100),
      ];

      const resultado = normalizarTransaccionesPdf(
        tokens,
        estructuraBase(),
        periodoMarzo2026,
      );

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError().problemas).toEqual([
        { tipo: 'MontoIleeible', fila: 1, columna: 'abono' },
      ]);
    });

    it('columna vacía (sin ningún token) sigue siendo 0 legítimo — NO es un problema', () => {
      const tokens = [
        tok('05/03 OPER.', 30, 100),
        tok('Pago', 100, 100),
        tok('9.990', 400, 100),
      ];

      const resultado = ok(
        normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
      );

      expect(resultado).toEqual([
        Transaccion.crear({
          fecha: new Date(Date.UTC(2026, 2, 5)),
          descripcion: 'Pago',
          cargo: 9990,
          abono: 0,
        }).getValue(),
      ]);
    });

    it('agrupa VARIOS problemas de distintas filas en una sola pasada (mismo criterio UX que EstructuraPdfInvalidaError/NormalizacionInvalidaError)', () => {
      const tokens = [
        tok('05/03 OPER.', 30, 200),
        tok('Pago uno', 100, 200),
        tok('12.34', 400, 200),
        tok('06/03 OPER.', 30, 100),
        tok('Pago dos', 100, 100),
        tok('9,90', 400, 100),
      ];

      const resultado = normalizarTransaccionesPdf(
        tokens,
        estructuraBase(),
        periodoMarzo2026,
      );

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError().problemas).toEqual([
        { tipo: 'MontoIleeible', fila: 1, columna: 'cargo' },
        { tipo: 'MontoIleeible', fila: 2, columna: 'cargo' },
      ]);
    });
  });

  describe('hardening PR4b — tokensSinAsignar money-safe (deriva geométrica)', () => {
    it('fila reconocida como transacción con cargo y abono AMBOS vacíos, pero con un token con forma de monto fuera de rangosX → Result.fail con TokenSinAsignarSospechoso (no se pierde en silencio)', () => {
      const tokens = [
        tok('05/03 OPER.', 30, 100),
        tok('Pago', 100, 100),
        // "$99.990" cae fuera de TODOS los rangos configurados (rangosXSantander
        // termina en x=520) — simula una columna de monto desplazada por
        // deriva geométrica que ninguna rangosX capturó.
        tok('$99.990', 600, 100),
      ];

      const resultado = normalizarTransaccionesPdf(
        tokens,
        estructuraBase(),
        periodoMarzo2026,
      );

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError().problemas).toEqual([
        { tipo: 'TokenSinAsignarSospechoso', fila: 1 },
      ]);
    });

    it('un token sin asignar que NO tiene forma de monto (ej. un número de operación sin separador de miles) NO dispara la señal — evita falsos positivos contra los 4 fixtures reales', () => {
      const tokens = [
        tok('05/03 OPER.', 30, 100),
        tok('Pago', 100, 100),
        tok('9.990', 400, 100),
        // Token fuera de rangosX pero SIN forma de monto (dígitos planos, sin
        // separador de miles ni "$") — simula un N° de operación/documento
        // deliberadamente excluido de rangosX (ver banco-estado.strategy.ts).
        tok('1001234', 600, 100),
      ];

      const resultado = ok(
        normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
      );

      expect(resultado).toHaveLength(1);
      expect(resultado[0].cargo).toBe(9990);
    });

    it('un token con forma de monto fuera de rangosX en una fila que SÍ tiene cargo/abono asignado NO dispara la señal (ej. columna Saldo, siempre presente y siempre fuera de rangosX)', () => {
      const tokens = [
        tok('05/03 OPER.', 30, 100),
        tok('Pago', 100, 100),
        tok('9.990', 400, 100),
        // Simula la columna "Saldo" (deliberadamente fuera de rangosX en los
        // 4 bancos) — con forma de monto, pero esta fila YA tiene su cargo
        // asignado, así que no es una señal de deriva.
        tok('$1.234.567', 600, 100),
      ];

      const resultado = ok(
        normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
      );

      expect(resultado).toHaveLength(1);
      expect(resultado[0].cargo).toBe(9990);
    });
  });

  describe('hardening PR4b — fusionarContinuaciones (opt-in, caso BCI)', () => {
    it('una fila sin fecha, sin cargo/abono propios, con descripción, se fusiona como sufijo de la candidata más reciente cuando fusionarContinuaciones está activo', () => {
      const rangosXBci = [
        { col: 'fecha' as const, xMin: 0, xMax: 100 },
        { col: 'descripcion' as const, xMin: 100, xMax: 300 },
        { col: 'cargo' as const, xMin: 300, xMax: 400 },
        { col: 'abono' as const, xMin: 400, xMax: 500 },
      ];
      const tokens = [
        tok('02/04/2026', 30, 200),
        tok('Pago Credito D001', 150, 200),
        tok('50.000', 350, 200),
        // Continuación multilínea (sin fecha, sin monto propio).
        tok('001/012', 150, 100),
      ];

      const resultado = ok(
        normalizarTransaccionesPdf(
          tokens,
          estructuraBase({
            banco: BancoConocido.BCI,
            formatoFecha: 'DD/MM/YYYY',
            fuenteAnio: { kind: 'explicito' },
            rangosX: rangosXBci,
            filasIgnoradas: [],
            fusionarContinuaciones: true,
          }),
          undefined,
        ),
      );

      expect(resultado).toEqual([
        Transaccion.crear({
          fecha: new Date(Date.UTC(2026, 3, 2)),
          descripcion: 'Pago Credito D001 001/012',
          cargo: 50000,
          abono: 0,
        }).getValue(),
      ]);
    });

    it('sin fusionarContinuaciones (default), la misma fila de continuación se descarta en silencio — comportamiento previo a PR4b, sin cambios para los otros 3 bancos', () => {
      const tokens = [
        tok('07/03 Providencia', 30, 200),
        tok('Compra', 100, 200),
        tok('Super', 140, 200),
        tok('45.990', 400, 200),
        tok('continuacion huerfana', 100, 100),
      ];

      const resultado = ok(
        normalizarTransaccionesPdf(tokens, estructuraBase(), periodoMarzo2026),
      );

      expect(resultado).toHaveLength(1);
      expect(resultado[0].descripcion).toBe('Compra Super');
    });

    it('una fila de continuación SIN candidata previa (aparece antes de cualquier transacción) se descarta sin lanzar, aunque fusionarContinuaciones esté activo', () => {
      const rangosXBci = [
        { col: 'fecha' as const, xMin: 0, xMax: 100 },
        { col: 'descripcion' as const, xMin: 100, xMax: 300 },
        { col: 'cargo' as const, xMin: 300, xMax: 400 },
        { col: 'abono' as const, xMin: 400, xMax: 500 },
      ];
      const tokens = [
        // Encabezado repetido de página, sin candidata previa que la absorba.
        tok('CARTOLA DE CUENTA CORRIENTE', 150, 200),
        tok('02/04/2026', 30, 100),
        tok('Pago', 150, 100),
        tok('50.000', 350, 100),
      ];

      const resultado = ok(
        normalizarTransaccionesPdf(
          tokens,
          estructuraBase({
            banco: BancoConocido.BCI,
            formatoFecha: 'DD/MM/YYYY',
            fuenteAnio: { kind: 'explicito' },
            rangosX: rangosXBci,
            filasIgnoradas: [],
            fusionarContinuaciones: true,
          }),
          undefined,
        ),
      );

      expect(resultado).toHaveLength(1);
      expect(resultado[0].descripcion).toBe('Pago');
    });

    it('hardening jd-fix-agent — una fila de continuación que aparece ANTES de la fila fechada (ordering real del fixture BCI) se fusiona como PREFIJO de la fila fechada siguiente cuando esa fila trae descripción vacía o solo dígitos (fragmento), y NO contamina la fila fechada anterior con descripción completa', () => {
      const rangosXBci = [
        { col: 'fecha' as const, xMin: 0, xMax: 100 },
        { col: 'descripcion' as const, xMin: 100, xMax: 300 },
        { col: 'cargo' as const, xMin: 300, xMax: 400 },
        { col: 'abono' as const, xMin: 400, xMax: 500 },
      ];
      const tokens = [
        // Transacción #1: descripción completa en una sola línea — NO debe
        // recibir como sufijo la línea huérfana que viene justo debajo (esa
        // huérfana es en realidad el PREFIJO de la transacción #2, ver
        // ordering real de bci-cartola-test.pdf: la etiqueta de continuación
        // aparece ARRIBA de la fila fechada a la que pertenece).
        tok('02/04/2026', 30, 200),
        tok('Alguna Descripcion Completa', 150, 200),
        tok('700.000', 350, 200),
        // Huérfana — sin fecha, sin cargo/abono propios. Aparece ANTES
        // (Y mayor a) la transacción #2, con la MISMA distancia a ambas
        // filas fechadas vecinas (geometría equidistante, igual que en el
        // fixture real) — el desempate NO es por distancia Y, sino porque
        // la transacción #2 trae su propia descripción vacía/fragmentaria.
        tok('Pago Credito D001', 150, 190),
        // Transacción #2: descripción propia son solo dígitos (número de
        // documento largo desbordado dentro de la columna descripción) —
        // señal de fragmento, ver calcularPrefijosContinuacion.
        tok('02/04/2026', 30, 180),
        tok('4800000001', 150, 180),
        tok('250.213', 350, 180),
        // Huérfana — sufijo clásico de la transacción #2 (comportamiento
        // sin cambios respecto al fusionarContinuaciones original).
        tok('001/012', 150, 170),
      ];

      const resultado = ok(
        normalizarTransaccionesPdf(
          tokens,
          estructuraBase({
            banco: BancoConocido.BCI,
            formatoFecha: 'DD/MM/YYYY',
            fuenteAnio: { kind: 'explicito' },
            rangosX: rangosXBci,
            filasIgnoradas: [],
            fusionarContinuaciones: true,
          }),
          undefined,
        ),
      );

      expect(resultado).toEqual([
        Transaccion.crear({
          fecha: new Date(Date.UTC(2026, 3, 2)),
          descripcion: 'Alguna Descripcion Completa',
          cargo: 700000,
          abono: 0,
        }).getValue(),
        Transaccion.crear({
          fecha: new Date(Date.UTC(2026, 3, 2)),
          descripcion: 'Pago Credito D001 4800000001 001/012',
          cargo: 250213,
          abono: 0,
        }).getValue(),
      ]);
    });
  });
});
