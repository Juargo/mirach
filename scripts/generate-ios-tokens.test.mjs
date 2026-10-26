// Run: node --test scripts/generate-ios-tokens.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildOutputs, camel, collectColors, hexToSrgb, pascal } from './generate-ios-tokens.mjs';

const tokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'));

test('hexToSrgb converts hex to exact sRGB components', () => {
  assert.deepEqual(hexToSrgb('#000000'), { red: '0.000000', green: '0.000000', blue: '0.000000', alpha: '1.000000' });
  assert.deepEqual(hexToSrgb('#ffffff'), { red: '1.000000', green: '1.000000', blue: '1.000000', alpha: '1.000000' });
  assert.deepEqual(hexToSrgb('#782C5C'), { red: '0.470588', green: '0.172549', blue: '0.360784', alpha: '1.000000' });
});

test('every 8-bit channel round-trips through the decimal string', () => {
  for (let n = 0; n < 256; n++) {
    const hex = `#${n.toString(16).padStart(2, '0')}0000`;
    assert.equal(Math.round(Number(hexToSrgb(hex).red) * 255), n);
  }
});

test('hexToSrgb rejects malformed colors', () => {
  assert.throws(() => hexToSrgb('#fff'), /Invalid hex/);
  assert.throws(() => hexToSrgb('red'), /Invalid hex/);
});

test('names map to Swift identifiers', () => {
  assert.equal(camel('sin-categoria'), 'sinCategoria');
  assert.equal(camel('card-foreground'), 'cardForeground');
  assert.equal(pascal('semaforo'), 'Semaforo');
});

test('output is deterministic', () => {
  assert.deepEqual(buildOutputs(tokens), buildOutputs(structuredClone(tokens)));
});

test('one colorset per token with light as any and dark as luminosity:dark', () => {
  const files = new Map(buildOutputs(tokens).map((f) => [f.path, f.content]));
  const colors = collectColors(tokens);
  assert.equal(colors.length, 25);
  const set = JSON.parse(files.get('Resources/Tokens.xcassets/Bucket/gustos.colorset/Contents.json'));
  assert.equal(set.colors[0].appearances, undefined);
  assert.equal(set.colors[0].color.components.red, hexToSrgb('#7b61a8').red);
  assert.deepEqual(set.colors[1].appearances, [{ appearance: 'luminosity', value: 'dark' }]);
  assert.equal(set.colors[1].color.components.red, hexToSrgb('#a891d6').red);
  const ns = JSON.parse(files.get('Resources/Tokens.xcassets/Bucket/Contents.json'));
  assert.equal(ns.properties['provides-namespace'], true);
});

test('Swift file exposes the copy and never says Deseos', () => {
  const swift = buildOutputs(tokens).find((f) => f.path.endsWith('GeneratedTokens.swift')).content;
  assert.match(swift, /static let gustos = "Gustos"/);
  assert.match(swift, /static let gustos = Color\("Bucket\/gustos", bundle: \.main\)/);
  assert.match(swift, /enum Estado \{[^}]*static let sinDatos = "Sin datos"/);
  assert.doesNotMatch(swift, /deseos/i);
});

test('Swift file exposes spacing and the square radius, without mono or a radius ceiling', () => {
  const swift = buildOutputs(tokens).find((f) => f.path.endsWith('GeneratedTokens.swift')).content;
  assert.match(swift, /enum MirachSpacing \{[^}]*static let m: CGFloat = 16/);
  assert.match(swift, /static let base: CGFloat = 0/);
  assert.match(swift, /static let sans: \[String\] = \["Inter"/);
  assert.match(swift, /monospacedDigit\(\)/);
  assert.doesNotMatch(swift, /static let mono|maxAllowed/);
});

test('a missing dark value fails the generation', () => {
  const broken = structuredClone(tokens);
  delete broken.color.dark.bucket.gustos;
  assert.throws(() => buildOutputs(broken), /Missing dark value for bucket.gustos/);
});
