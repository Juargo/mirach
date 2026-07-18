import type { Request } from 'express';
import { esNavegacionDeNivelSuperior } from './sec-fetch-guard';

function requestConHeaders(
  headers: Record<string, string | undefined>,
): Request {
  return { headers } as unknown as Request;
}

describe('esNavegacionDeNivelSuperior() — guard anti-embed/CSRF (Sec-Fetch-*)', () => {
  it('Sec-Fetch-Dest: document → true (navegación top-level real)', () => {
    expect(
      esNavegacionDeNivelSuperior(
        requestConHeaders({ 'sec-fetch-dest': 'document' }),
      ),
    ).toBe(true);
  });

  it('Sec-Fetch-Dest: image (ej. <img src=...>) → false (embed, se rechaza)', () => {
    expect(
      esNavegacionDeNivelSuperior(
        requestConHeaders({ 'sec-fetch-dest': 'image' }),
      ),
    ).toBe(false);
  });

  it('Sec-Fetch-Dest: iframe → false (embed, se rechaza)', () => {
    expect(
      esNavegacionDeNivelSuperior(
        requestConHeaders({ 'sec-fetch-dest': 'iframe' }),
      ),
    ).toBe(false);
  });

  it('Sec-Fetch-Mode: navigate → true', () => {
    expect(
      esNavegacionDeNivelSuperior(
        requestConHeaders({ 'sec-fetch-mode': 'navigate' }),
      ),
    ).toBe(true);
  });

  it('Sec-Fetch-Mode: cors (no navigate) → false (se rechaza)', () => {
    expect(
      esNavegacionDeNivelSuperior(
        requestConHeaders({ 'sec-fetch-mode': 'cors' }),
      ),
    ).toBe(false);
  });

  it('ambos headers ausentes (cliente legacy) → true (fail-open documentado — gap residual)', () => {
    expect(esNavegacionDeNivelSuperior(requestConHeaders({}))).toBe(true);
  });
});
