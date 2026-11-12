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

test('exposes the text styles as sp TextStyles in Inter with the token line height', () => {
  const src = kotlin();
  assert.match(src, /object MirachTextStyles \{/);
  assert.match(
    src,
    /val titulo = TextStyle\(fontFamily = InterFontFamily, fontWeight = FontWeight\.SemiBold, fontSize = 28\.sp, lineHeight = 34\.sp\)/,
  );
  assert.match(
    src,
    /val numeroGrande = TextStyle\(fontFamily = InterFontFamily, fontWeight = FontWeight\.SemiBold, fontSize = 40\.sp, lineHeight = 44\.sp\)/,
  );
  assert.match(
    src,
    /val cuerpo = TextStyle\(fontFamily = InterFontFamily, fontWeight = FontWeight\.Normal, fontSize = 16\.sp, lineHeight = 24\.sp\)/,
  );
  assert.match(src, /val cuerpoDestacado = TextStyle\([^)]*FontWeight\.SemiBold, fontSize = 16\.sp, lineHeight = 24\.sp\)/);
  assert.match(src, /val boton = TextStyle\([^)]*FontWeight\.SemiBold, fontSize = 16\.sp, lineHeight = 20\.sp\)/);
  assert.match(src, /val etiqueta = TextStyle\([^)]*FontWeight\.Medium, fontSize = 13\.sp, lineHeight = 16\.sp\)/);
  assert.match(src, /val mini = TextStyle\([^)]*FontWeight\.Medium, fontSize = 11\.sp, lineHeight = 14\.sp\)/);
  assert.match(src, /import androidx\.compose\.ui\.text\.font\.FontWeight/);
  assert.match(src, /import androidx\.compose\.ui\.unit\.sp/);
});

test('a text style in a family other than Inter fails the generation', () => {
  const broken = structuredClone(tokens);
  broken.typography['text-style'].mini.$value.fontFamily = 'Roboto';
  assert.throws(() => buildOutputs(broken), /Unsupported font family Roboto/);
});

test('a text style weight without a Compose FontWeight fails the generation', () => {
  const broken = structuredClone(tokens);
  broken.typography['text-style'].mini.$value.fontWeight = 550;
  assert.throws(() => buildOutputs(broken), /Unsupported font weight 550/);
});

test('a missing dark value fails the generation', () => {
  const broken = structuredClone(tokens);
  delete broken.color.dark.bucket.gustos;
  assert.throws(() => buildOutputs(broken), /Missing dark value for bucket.gustos/);
});
