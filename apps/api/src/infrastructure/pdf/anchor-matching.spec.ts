import {
  coincideAnclaEnToken,
  coincideAnclaEnVentana,
} from './anchor-matching';
import { PagedToken } from './pdf-text-extractor';

function token(str: string, page = 1): PagedToken {
  return { str, x: 0, y: 0, page };
}

describe('coincideAnclaEnToken', () => {
  it('encuentra el ancla cuando un solo token la contiene', () => {
    const tokens = [token('CARTOLA CUENTARUT N° 12345678')];
    expect(coincideAnclaEnToken(tokens, 'CARTOLA CUENTARUT N°')).toBe(true);
  });

  it('no encuentra el ancla si está repartida en tokens distintos', () => {
    const tokens = [token('CARTOLA'), token('CUENTARUT'), token('N°')];
    expect(coincideAnclaEnToken(tokens, 'CARTOLA CUENTARUT N°')).toBe(false);
  });

  it('es case-sensitive: no coincide si difiere la capitalización', () => {
    // Caso real: BCI trae "ESTADO DE CUENTA" (mayúsculas, decorativo) y
    // Santander trae "estado de cuenta" (minúsculas, nota al pie) — ninguno
    // debe coincidir con el ancla Title Case real de Banco de Chile.
    const tokens = [token('ESTADO DE CUENTA LINEA DE SOBREGIRO')];
    expect(coincideAnclaEnToken(tokens, 'Estado de Cuenta')).toBe(false);

    const tokensMinusculas = [token('aprobado este estado de cuenta si')];
    expect(coincideAnclaEnToken(tokensMinusculas, 'Estado de Cuenta')).toBe(
      false,
    );
  });

  it('ignora tokens de otras páginas solo si el caller ya filtró (no filtra por página)', () => {
    const tokens = [token('CARTOLA CUENTARUT N°', 2)];
    expect(coincideAnclaEnToken(tokens, 'CARTOLA CUENTARUT N°')).toBe(true);
  });
});

describe('coincideAnclaEnVentana', () => {
  it('encuentra el ancla fragmentada en varios tokens adyacentes (letter-spacing)', () => {
    const tokens = [
      token('Santander'),
      token(''),
      token('B A N C O'),
      token(' '),
      token('S A N T A N D E R'),
      token(' '),
      token('C H I L E'),
      token('SU EJECUTIVO DE CUENTA ES :'),
    ];
    expect(coincideAnclaEnVentana(tokens, 'BANCO SANTANDER CHILE')).toBe(true);
  });

  it('no coincide si los tokens relevantes están fuera de la ventana', () => {
    const relleno = Array.from({ length: 20 }, (_, i) => token(`relleno${i}`));
    const tokens = [token('B A N C O'), ...relleno, token('C H I L E')];
    expect(coincideAnclaEnVentana(tokens, 'BANCO CHILE', 5)).toBe(false);
  });

  it('es case-sensitive', () => {
    const tokens = [token('banco'), token('santander'), token('chile')];
    expect(coincideAnclaEnVentana(tokens, 'BANCO SANTANDER CHILE')).toBe(false);
  });
});
