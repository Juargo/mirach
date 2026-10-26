// Run: node --test scripts/generate-android-tokens.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildOutputs, hexToArgb, kotlinName } from './generate-android-tokens.mjs';

const tokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'));
const kotlin = () => buildOutputs(tokens).find((f) => f.path.endsWith('GeneratedTokens.kt')).content;

test('hexToArgb produces an opaque Compose Color literal', () => {
  assert.equal(hexToArgb('#782C5C'), 'Color(0xFF782C5C)');
  assert.equal(hexToArgb('#ffffff'), 'Color(0xFFFFFFFF)');
  assert.throws(() => hexToArgb('#fff'), /Invalid hex/);
});

test('names map to Kotlin identifiers', () => {
  assert.equal(kotlinName('sin-categoria'), 'sinCategoria');
  assert.equal(kotlinName('card-foreground'), 'cardForeground');
});

test('output is deterministic and has no timestamps', () => {
  assert.deepEqual(buildOutputs(tokens), buildOutputs(structuredClone(tokens)));
  assert.doesNotMatch(kotlin(), /\b20\d\d-\d\d-\d\d\b/);
});

test('emits light and dark palettes with per-theme values', () => {
  const src = kotlin();
  assert.match(src, /val light = MirachPalette\(/);
  assert.match(src, /val dark = MirachPalette\(/);
  assert.match(src, /gustos = Color\(0xFF7B61A8\)/);
  assert.match(src, /gustos = Color\(0xFFA891D6\)/);
});

test('colors are grouped like the iOS Color.Mirach namespaces', () => {
  const src = kotlin();
  for (const g of ['Base', 'Bucket', 'Estado', 'Feedback', 'Ingreso']) {
    assert.match(src, new RegExp(`class ${g}Colors\\(`));
  }
  assert.match(src, /val ahorroText: Color/);
  assert.doesNotMatch(src, /class (Pie|Semaforo)Colors/);
});

test('exposes the copy and never says Deseos', () => {
  const src = kotlin();
  assert.match(src, /const val gustos = "Gustos"/);
  assert.match(src, /object Estado \{[^}]*const val sinDatos = "Sin datos"/);
  assert.doesNotMatch(src, /deseos/i);
});

test('exposes fonts, tabular figures and radius', () => {
  const src = kotlin();
  assert.match(src, /val sans: List<String> = listOf\("Inter"/);
  assert.match(src, /fontFeatureSettings = "tnum"/);
  assert.match(src, /val base: Dp = 0\.dp/);
  assert.match(src, /object MirachSpacing \{[^}]*val m: Dp = 16\.dp/);
  assert.doesNotMatch(src, /mono|maxAllowed/);
});

test('a missing dark value fails the generation', () => {
  const broken = structuredClone(tokens);
  delete broken.color.dark.bucket.gustos;
  assert.throws(() => buildOutputs(broken), /Missing dark value for bucket.gustos/);
});
