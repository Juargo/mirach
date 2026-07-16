import {
  detectarAnclasFaltantes,
  construirTextoCompleto,
  extraerPeriodo,
  periodoAIso,
  paginaInicioTabla,
  evaluarEstructura,
} from './pdf-structure-extraction';
import { PagedToken } from './pdf-text-extractor';
import { EstructuraPdfBanco } from './strategies/estructura-pdf-banco';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';
import { RangoFechasInvalidoError } from '../../domain/errors/rango-fechas-invalido.error';

function tok(str: string, x: number, y: number, page = 1): PagedToken {
  return { str, x, y, page };
}

describe('detectarAnclasFaltantes', () => {
  it('retorna vacío cuando todas las anclas están presentes (case-sensitive, sin importar espacios internos)', () => {
    const tokens = [tok('FECHA', 10, 100), tok('DESCRIPCION', 50, 100)];
    expect(detectarAnclasFaltantes(tokens, ['FECHA', 'DESCRIPCION'])).toEqual(
      [],
    );
  });

  it('retorna las anclas que NO se encontraron en ningún token', () => {
    const tokens = [tok('FECHA', 10, 100)];
    expect(detectarAnclasFaltantes(tokens, ['FECHA', 'SALDO'])).toEqual([
      'SALDO',
    ]);
  });
});

describe('construirTextoCompleto', () => {
  it('ordena por página, luego Y descendente, luego X ascendente, y une con espacio', () => {
    const tokens = [
      tok('C', 10, 50, 1),
      tok('A', 10, 100, 1),
      tok('B', 20, 100, 1),
    ];
    expect(construirTextoCompleto(tokens)).toBe('A B C');
  });
});

describe('extraerPeriodo', () => {
  it('extrae desde/hasta cuando ambos regex matchean con grupo de captura', () => {
    const texto = 'Fecha Inicio 01/04/2026 Fecha Final 30/04/2026';
    const anclas = {
      desde: /Fecha Inicio\s+(\d{2}\/\d{2}\/\d{4})/,
      hasta: /Fecha Final\s+(\d{2}\/\d{2}\/\d{4})/,
    };
    expect(extraerPeriodo(texto, anclas)).toEqual({
      desde: '01/04/2026',
      hasta: '30/04/2026',
    });
  });

  it('retorna undefined si falta el match de desde u hasta', () => {
    const texto = 'Fecha Inicio 01/04/2026';
    const anclas = {
      desde: /Fecha Inicio\s+(\d{2}\/\d{2}\/\d{4})/,
      hasta: /Fecha Final\s+(\d{2}\/\d{2}\/\d{4})/,
    };
    expect(extraerPeriodo(texto, anclas)).toBeUndefined();
  });

  it('resuelve el caso Santander: etiquetas DESDE/HASTA en una fila y los valores en la fila siguiente', () => {
    const texto =
      'CARTOLA DESDE HASTA PAGINA 0262-M-C-00 54 01/03/2026 31/03/2026 1 de 1';
    const anclas = {
      desde: /DESDE\s+HASTA\s+PAGINA[\s\S]*?(\d{2}\/\d{2}\/\d{4})/,
      hasta:
        /DESDE\s+HASTA\s+PAGINA[\s\S]*?\d{2}\/\d{2}\/\d{4}[\s\S]*?(\d{2}\/\d{2}\/\d{4})/,
    };
    expect(extraerPeriodo(texto, anclas)).toEqual({
      desde: '01/03/2026',
      hasta: '31/03/2026',
    });
  });
});

describe('periodoAIso', () => {
  it('convierte DD/MM/YYYY a YYYY-MM-DD', () => {
    expect(periodoAIso('01/04/2026')).toBe('2026-04-01');
  });

  it('convierte DD-MM-YYYY (separador BCI) a YYYY-MM-DD', () => {
    expect(periodoAIso('01-04-2026')).toBe('2026-04-01');
  });
});

describe('paginaInicioTabla', () => {
  it('retorna la página del primer token (en orden de página ascendente) que matchea alguna ancla', () => {
    const tokens = [tok('otro', 0, 0, 1), tok('FECHA', 10, 100, 2)];
    expect(paginaInicioTabla(tokens, ['FECHA'])).toBe(2);
  });

  it('retorna 1 si ninguna ancla matchea (fallback conservador)', () => {
    const tokens = [tok('otro', 0, 0, 3)];
    expect(paginaInicioTabla(tokens, ['FECHA'])).toBe(1);
  });
});

describe('evaluarEstructura', () => {
  const rangosX = [
    { col: 'fecha' as const, xMin: 0, xMax: 50 },
    { col: 'descripcion' as const, xMin: 50, xMax: 200 },
    { col: 'cargo' as const, xMin: 200, xMax: 300 },
    { col: 'abono' as const, xMin: 300, xMax: 400 },
  ];

  function estructuraBase(
    overrides: Partial<EstructuraPdfBanco> = {},
  ): EstructuraPdfBanco {
    return {
      banco: BancoConocido.BancoEstado,
      anclasEncabezado: ['FECHA', 'DESCRIPCION', 'SALDO'],
      anclasPeriodo: {
        desde: /Fecha Inicio\s+(\d{2}\/\d{2}\/\d{4})/,
        hasta: /Fecha Final\s+(\d{2}\/\d{2}\/\d{4})/,
      },
      rangosX,
      toleranciaY: 2,
      formatoFecha: 'DD/Mmm',
      fuenteAnio: { kind: 'inferido', desde: 'periodo-inicio' },
      filasIgnoradas: [],
      ...overrides,
    };
  }

  it('Result.ok con período ISO, página y rangosX cuando todo está presente', () => {
    const tokens = [
      tok('FECHA', 10, 100),
      tok('DESCRIPCION', 60, 100),
      tok('SALDO', 350, 100),
      tok('Fecha Inicio', 10, 50),
      tok('01/04/2026', 60, 50),
      tok('Fecha Final', 200, 50),
      tok('30/04/2026', 300, 50),
    ];

    const result = evaluarEstructura(
      tokens,
      estructuraBase(),
      BancoConocido.BancoEstado,
    );

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({
      banco: BancoConocido.BancoEstado,
      periodo: { desde: '2026-04-01', hasta: '2026-04-30' },
      paginaInicioTabla: 1,
      rangosX,
      toleranciaY: 2,
    });
  });

  it('[4.5] Fail(EstructuraPdfInvalidaError) con AnclaFaltante Y PeriodoFaltante en una sola pasada cuando ambos faltan', () => {
    const tokens = [
      tok('FECHA', 10, 100),
      // 'DESCRIPCION' y 'SALDO' mutados/ausentes
      // período también ausente
    ];

    const result = evaluarEstructura(
      tokens,
      estructuraBase(),
      BancoConocido.BancoEstado,
    );

    expect(result.isFail()).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(EstructuraPdfInvalidaError);
    const problemas = (error as EstructuraPdfInvalidaError).problemas;
    expect(problemas).toContainEqual({
      tipo: 'AnclaFaltante',
      ancla: 'DESCRIPCION',
    });
    expect(problemas).toContainEqual({ tipo: 'AnclaFaltante', ancla: 'SALDO' });
    expect(problemas).toContainEqual({ tipo: 'PeriodoFaltante' });
  });

  it('[4.6] Fail(RangoFechasInvalidoError) cuando SOLO falta el período (encabezados OK) y el banco lo requiere', () => {
    const tokens = [
      tok('FECHA', 10, 100),
      tok('DESCRIPCION', 60, 100),
      tok('SALDO', 350, 100),
      // sin período
    ];

    const result = evaluarEstructura(
      tokens,
      estructuraBase(),
      BancoConocido.BancoEstado,
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RangoFechasInvalidoError);
  });

  it('[4.6] BCI (fuenteAnio explícito) es EXENTO: Result.ok sin período aunque no haya ancla de período', () => {
    const tokens = [
      tok('FECHA', 10, 100),
      tok('DESCRIPCION', 60, 100),
      tok('SALDO', 350, 100),
    ];
    const estructuraBci = estructuraBase({
      banco: BancoConocido.BCI,
      fuenteAnio: { kind: 'explicito' },
    });

    const result = evaluarEstructura(tokens, estructuraBci, BancoConocido.BCI);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().periodo).toBeUndefined();
  });

  it('el mensaje de error NUNCA interpola texto crudo del PDF — solo anclas propias conocidas', () => {
    const tokens = [tok('un monto cualquiera $999.999', 10, 100)];

    const result = evaluarEstructura(
      tokens,
      estructuraBase(),
      BancoConocido.BancoEstado,
    );

    expect(result.isFail()).toBe(true);
    expect(result.getError().message).not.toContain('$999.999');
  });
});
