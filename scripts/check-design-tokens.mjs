#!/usr/bin/env node
// Validates design/tokens.json: structure, theme parity and WCAG 2.x contrast.
// No dependencies. Text pairs need 4.5:1; graphic pairs (non-text marks per
// DESIGN.md: strokes, bands, fills) need 3:1. Exit code 1 on any failure.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../design/tokens.json', import.meta.url));
const errors = [];
let tokens;
try {
  tokens = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`FAIL cannot parse design/tokens.json: ${e.message}`);
  process.exit(1);
}

// (a) every leaf has $value and $type; colors are #rrggbb
const HEX = /^#[0-9a-f]{6}$/i;
function leaves(node, path = []) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [];
  if ('$value' in node || '$type' in node) return [{ path: path.join('.'), node }];
  return Object.entries(node)
    .filter(([k]) => !k.startsWith('$'))
    .flatMap(([k, v]) => leaves(v, [...path, k]));
}
const all = leaves(tokens);
for (const { path, node } of all) {
  if (!('$value' in node)) errors.push(`${path}: missing $value`);
  if (!('$type' in node)) errors.push(`${path}: missing $type`);
  if (!node.$description) errors.push(`${path}: missing $description`);
  if (node.$type === 'color' && !HEX.test(String(node.$value))) {
    errors.push(`${path}: invalid hex "${node.$value}" (expected #rrggbb)`);
  }
}

// (b) both themes define the same token names
const names = (t) => new Set(leaves(tokens.color?.[t]).map((l) => l.path.replace(`color.${t}.`, '')));
const light = names('light');
const dark = names('dark');
for (const n of light) if (!dark.has(n)) errors.push(`token "${n}" in light but not in dark`);
for (const n of dark) if (!light.has(n)) errors.push(`token "${n}" in dark but not in light`);

// (c) contrast
const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => {
  const [r, g, b] = rgb(h).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const mix = (fg, bg, a) =>
  '#' + rgb(fg).map((c, i) => Math.round(c * a + rgb(bg)[i] * (1 - a)).toString(16).padStart(2, '0')).join('');

const TEXT = 4.5;
const GRAPHIC = 3;
// [fg, bg, kind] — token paths relative to color.<theme>; "#rrggbb" literals allowed.
const WHITE = '#ffffff'; // text on destructive: index.css comment ("white text on this fill clears AA")
const pairs = [
  ['base.foreground', 'base.background', 'text'],
  ['base.foreground', 'base.card', 'text'],
  ['base.card-foreground', 'base.card', 'text'],
  ['base.popover-foreground', 'base.popover', 'text'],
  ['base.muted-foreground', 'base.background', 'text'],
  ['base.muted-foreground', 'base.card', 'text'],
  ['base.primary-foreground', 'base.primary', 'text'],
  ['base.secondary-foreground', 'base.secondary', 'text'],
  [WHITE, 'base.destructive', 'text'],
  ['ingreso.text', 'ingreso.fill', 'text'],
  ['semaforo.verde-ink', 'semaforo.verde-fill', 'text'],
  ['semaforo.amarillo-ink', 'semaforo.amarillo-fill', 'text'],
  ['semaforo.rojo-ink', 'semaforo.rojo-fill', 'text'],
  ['pie.label-necesidades', 'bucket.necesidades', 'text'],
  ['pie.label-deseos', 'bucket.deseos', 'text'],
  ['pie.label-ahorro', 'bucket.ahorro', 'text'],
  ['pie.label-sin-categoria', 'bucket.sin-categoria', 'text'],
  ['feedback.warning-ink', 'feedback.warning-fill', 'text'],
  ['feedback.link-active-ink', 'feedback.link-active-fill', 'text'],
  ['feedback.success-text', 'base.card', 'text'],
  ['feedback.expense-text', 'base.card', 'text'],
  ['feedback.error-text', 'base.card', 'text'],
  // graphic (3:1): strokes, zone bands and bucket fills against the card
  ['base.input', 'base.card', 'graphic'],
  ['base.ring', 'base.background', 'graphic'],
  ['semaforo.verde-band', 'base.card', 'graphic'],
  ['semaforo.amarillo-band', 'base.card', 'graphic'],
  ['semaforo.rojo-band', 'base.card', 'graphic'],
  ['bucket.necesidades', 'base.card', 'graphic'],
  ['bucket.deseos', 'base.card', 'graphic'],
  ['bucket.ahorro', 'base.card', 'graphic'],
  ['bucket.sin-categoria', 'base.card', 'graphic'],
];
// Known exceptions: real web-palette pairs below threshold (values are NOT changed).
// Key: "<theme> <fg> on <bg>". Each one is also listed in design/README.md.
const KNOWN_EXCEPTIONS = new Set([
  // "Sin datos" chip: muted-foreground over its own 15% wash (semaforo-estilos.ts, SIN_DATOS).
  'light semaforo.sin-datos-ink on 15% wash over base.background',
  'dark semaforo.sin-datos-ink on 15% wash over base.card',
]);

const results = [];
const failures = [];
for (const theme of ['light', 'dark']) {
  const get = (p) => {
    if (p.startsWith('#')) return p;
    const n = tokens.color?.[theme]?.[p.split('.')[0]]?.[p.split('.')[1]];
    if (!n) throw new Error(`pair token not found: color.${theme}.${p}`);
    return n.$value;
  };
  const run = (label, fg, bg, kind) => {
    const r = ratio(fg, bg);
    const min = kind === 'text' ? TEXT : GRAPHIC;
    const key = `${theme} ${label}`;
    const ok = r >= min;
    const known = !ok && KNOWN_EXCEPTIONS.has(key);
    results.push({ theme, label, kind, r, min, ok, known });
    if (!ok && !known) failures.push(`${key}: ${r.toFixed(2)}:1 < ${min}:1 (${kind})`);
  };
  try {
    for (const [fg, bg, kind] of pairs) run(`${fg} on ${bg}`, get(fg), get(bg), kind);
    // "sin datos": ink = muted-foreground over its own 15% wash on the card
    const ink = get('semaforo.sin-datos-ink');
    run('semaforo.sin-datos-ink on 15% wash over base.card', ink, mix(ink, get('base.card'), 0.15), 'text');
    run('semaforo.sin-datos-ink on 15% wash over base.background', ink, mix(ink, get('base.background'), 0.15), 'text');
  } catch (e) {
    errors.push(e.message);
  }
}

for (const r of results.sort((a, b) => a.r - b.r)) {
  const tag = r.ok ? 'ok  ' : r.known ? 'KNOWN' : 'FAIL';
  console.log(`${tag} ${r.r.toFixed(2).padStart(5)}:1 (min ${r.min})  ${r.theme.padEnd(5)} ${r.label} [${r.kind}]`);
}
console.log(
  `\nTokens: ${all.length} leaves | themes: light ${light.size}, dark ${dark.size} | pairs checked: ${results.length} | ` +
    `known exceptions: ${results.filter((r) => r.known).length}`,
);
for (const kind of ['text', 'graphic']) {
  const low = results.find((r) => r.kind === kind);
  if (low) console.log(`Lowest ${kind} pair: ${low.r.toFixed(2)}:1  ${low.theme} ${low.label}${low.known ? ' (known exception)' : ''}`);
}

const problems = [...errors, ...failures];
if (problems.length) {
  console.error(`\nFAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('OK');
