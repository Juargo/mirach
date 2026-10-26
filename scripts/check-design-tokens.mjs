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

const TEXT = 4.5;
const GRAPHIC = 3;
// [fg, bg, kind] — token paths relative to color.<theme>; "#rrggbb" literals allowed.
const SURFACES = ['base.background', 'base.card'];
const onSurfaces = (fg, kind) => SURFACES.map((bg) => [fg, bg, kind]);
const pairs = [
  // text (4.5:1) on both surfaces
  ...['base.foreground', 'base.muted-foreground', 'feedback.error-text', 'feedback.success-text',
    'feedback.expense-text', 'ingreso.text', 'estado.sobre', 'estado.bien-text', 'estado.cerca-text',
    'bucket.ahorro-text'].flatMap((fg) => onSurfaces(fg, 'text')),
  ['base.card-foreground', 'base.card', 'text'],
  ['base.accent-foreground', 'base.accent', 'text'],
  ['base.primary-foreground', 'base.primary', 'text'],
  ['base.primary-foreground', 'base.destructive', 'text'],
  // chart labels: the background color written over each bucket fill (Figma screen 05)
  ['base.background', 'bucket.necesidades', 'text'],
  ['base.background', 'bucket.gustos', 'text'],
  ['base.background', 'bucket.ahorro', 'text'],
  // graphic (3:1): strokes, bucket fills and state marks on both surfaces
  ...['base.input', 'bucket.necesidades', 'bucket.gustos', 'bucket.ahorro', 'estado.bien', 'estado.cerca',
    'estado.sobre'].flatMap((fg) => onSurfaces(fg, 'graphic')),
];
// Known exceptions: real Figma pairs below threshold, reported to the owner (values are NOT changed here).
// Key: "<theme> <fg> on <bg>". Each one is also listed in design/README.md.
const KNOWN_EXCEPTIONS = new Set([
  // Chart percentage label over the Ahorro slice in light mode (3.51:1).
  'light base.background on bucket.ahorro',
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
