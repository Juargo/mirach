import { z } from 'zod';

import {
  envExampleDiverges,
  formatFieldLine,
  renderEnvExample,
} from './env-example';
import { EnvObjectSchema } from './env';

describe('formatFieldLine — formato puro schema campo -> línea .env.example', () => {
  it('campo con default: "KEY=default  # description"', () => {
    const field = z.coerce
      .number()
      .default(42)
      .describe('Campo de prueba con default.');

    expect(formatFieldLine('TEST_KEY', field)).toBe(
      'TEST_KEY=42  # Campo de prueba con default.',
    );
  });

  it('campo requerido (sin default): "KEY=  # description"', () => {
    const field = z.string().min(1).describe('Campo requerido de prueba.');

    expect(formatFieldLine('REQUIRED_KEY', field)).toBe(
      'REQUIRED_KEY=  # Campo requerido de prueba.',
    );
  });

  it('campo opcional sin default: "KEY=  # description"', () => {
    const field = z.string().optional().describe('Campo opcional de prueba.');

    expect(formatFieldLine('OPTIONAL_KEY', field)).toBe(
      'OPTIONAL_KEY=  # Campo opcional de prueba.',
    );
  });

  it('campo con default + transform (patrón COOKIE_SECURE): usa el default PRE-transform', () => {
    const field = z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true')
      .describe('Campo booleano de prueba.');

    expect(formatFieldLine('BOOL_KEY', field)).toBe(
      'BOOL_KEY=false  # Campo booleano de prueba.',
    );
  });
});

describe('renderEnvExample — archivo completo derivado de EnvObjectSchema', () => {
  it('incluye una línea por cada campo del schema real, en orden de declaración', () => {
    const output = renderEnvExample();
    const fieldNames = Object.keys(EnvObjectSchema.shape);

    for (const name of fieldNames) {
      expect(output).toContain(`\n${name}=`);
    }
  });

  it('NODE_ENV se emite sin valor de default en la línea (el schema.description sí aparece)', () => {
    const output = renderEnvExample();

    expect(output).toContain('NODE_ENV=development  #');
  });

  it('DATABASE_URL (requerido, sin default) se emite vacío', () => {
    const output = renderEnvExample();

    expect(output).toContain('DATABASE_URL=  #');
  });

  it('documenta las variables solo-de-script (fuera del schema) en un bloque separado, comentadas', () => {
    const output = renderEnvExample();

    expect(output).toContain('SEED_USER_EMAIL');
    expect(output).toContain('SEED_USER_PASSWORD');
    expect(output).toContain('CONFIRM_PROD_BACKFILL');
    // No deben quedar como líneas activas del schema (serían "KEY=" sin "#").
    expect(output).not.toMatch(/\nSEED_USER_EMAIL=/);
  });

  it('es determinístico: dos corridas producen exactamente el mismo texto', () => {
    expect(renderEnvExample()).toBe(renderEnvExample());
  });
});

describe('envExampleDiverges — detección de divergencia (usada por env:example:check)', () => {
  it('devuelve false cuando el contenido committeado coincide con lo generado', () => {
    const generated = renderEnvExample();

    expect(envExampleDiverges(generated)).toBe(false);
  });

  it('devuelve true cuando el contenido committeado fue alterado a mano (tamper)', () => {
    const tampered = `${renderEnvExample()}\n# alguien agregó esto a mano`;

    expect(envExampleDiverges(tampered)).toBe(true);
  });

  it('devuelve true cuando el schema cambió y el archivo committeado quedó desactualizado', () => {
    expect(envExampleDiverges('DATABASE_URL=\n')).toBe(true);
  });
});
