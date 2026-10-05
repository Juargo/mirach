#!/usr/bin/env node
// Generates the iOS design tokens from design/tokens.json (plan phase 7, T3).
//
// Outputs (relative to apps/ios/Mirach, fully deterministic, no dependencies):
//   Resources/Tokens.xcassets/<Group>/<token>.colorset/Contents.json
//       light value = "any" appearance, dark value = luminosity:dark appearance.
//   Core/Design/GeneratedTokens.swift
//       typed accessors for colors, copy, fonts and radii.
//
// Lives at the repo root next to check-design-tokens.mjs because both read the
// same source; apps/ios/scripts/generate-tokens.sh is the thin wrapper.
// Run: node scripts/generate-ios-tokens.mjs   (or apps/ios/scripts/generate-tokens.sh)

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSET_CATALOG = 'Resources/Tokens.xcassets';
const SWIFT_FILE = 'Core/Design/GeneratedTokens.swift';
const XCODE_INFO = { author: 'xcode', version: 1 };

/** "#edf0f5" -> { red: "0.929412", green: ..., blue: ..., alpha: "1.000000" } (sRGB, n/255). */
export function hexToSrgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const [red, green, blue] = m.slice(1).map((h) => (parseInt(h, 16) / 255).toFixed(6));
  return { red, green, blue, alpha: '1.000000' };
}

/** "sin-categoria" -> "sinCategoria" (Swift identifier). */
export function camel(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** "bucket" -> "Bucket" (asset folder and Swift enum). */
export function pascal(name) {
  const c = camel(name);
  return c[0].toUpperCase() + c.slice(1);
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** Flattens color.{light,dark}.<group>.<token> into ordered entries, checking both themes match. */
export function collectColors(tokens) {
  const { light, dark } = tokens.color;
  const entries = [];
  for (const [group, items] of Object.entries(light)) {
    if (group.startsWith('$')) continue;
    for (const [name, leaf] of Object.entries(items)) {
      const darkLeaf = dark[group]?.[name];
      if (!darkLeaf) throw new Error(`Missing dark value for ${group}.${name}`);
      entries.push({ group, name, light: leaf.$value, dark: darkLeaf.$value });
    }
    for (const name of Object.keys(dark[group] ?? {})) {
      if (!items[name]) throw new Error(`Missing light value for ${group}.${name}`);
    }
  }
  return entries;
}

function colorsetContents({ light, dark }) {
  const color = (hex) => ({ 'color-space': 'srgb', components: hexToSrgb(hex) });
  return {
    colors: [
      { color: color(light), idiom: 'universal' },
      {
        appearances: [{ appearance: 'luminosity', value: 'dark' }],
        color: color(dark),
        idiom: 'universal',
      },
    ],
    info: XCODE_INFO,
  };
}

function renderSwift(tokens, colors) {
  const groups = [...new Set(colors.map((c) => c.group))];
  const q = (s) => JSON.stringify(s);

  const colorEnums = groups
    .map((group) => {
      const lines = colors
        .filter((c) => c.group === group)
        .map((c) => `            static let ${camel(c.name)} = Color(${q(`${pascal(group)}/${c.name}`)}, bundle: .main)`);
      return `        enum ${pascal(group)} {\n${lines.join('\n')}\n        }`;
    })
    .join('\n');

  const names = colors.map((c) => `        ${q(`${pascal(c.group)}/${c.name}`)},`).join('\n');
  const same = colors
    .filter((c) => c.light.toLowerCase() === c.dark.toLowerCase())
    .map((c) => `        ${q(`${pascal(c.group)}/${c.name}`)},`)
    .join('\n');

  const copyEnum = (key) => {
    const lines = Object.entries(tokens.copy[key])
      .filter(([k]) => !k.startsWith('$'))
      .map(([k, leaf]) => `        static let ${camel(k)} = ${q(leaf.$value)}`);
    return `    enum ${pascal(key)} {\n${lines.join('\n')}\n    }`;
  };

  const fam = tokens.typography['font-family'];
  const list = (arr) => `[${arr.map(q).join(', ')}]`;
  const radius = tokens.radius;
  const px = (leaf) => String(parseFloat(leaf.$value));

  return `// GENERATED FILE. DO NOT EDIT.
// Source: design/tokens.json. Regenerate with: apps/ios/scripts/generate-tokens.sh
// CI fails when this file is out of date (see the \`ios\` job in .github/workflows/ci.yml).

import SwiftUI

// MARK: - Colors

/// Light/dark colors live in the \`Tokens.xcassets\` asset catalog; the system picks
/// the variant from the current appearance, so no view decides a color per theme.
/// Use: \`Color.Mirach.Bucket.deseos\`, \`Color.Mirach.Base.foreground\`.
extension Color {
    enum Mirach {
${colorEnums}
    }
}

/// Asset names, for runtime checks that every token resolves in the catalog.
enum MirachTokenCatalog {
    /// Every color asset name, as \`Group/token\`.
    static let colorAssetNames: [String] = [
${names}
    ]

    /// Color assets whose light and dark values are intentionally identical.
    static let identicalInBothThemes: Set<String> = [${same ? `\n${same}\n    ` : ''}]
}

// MARK: - Copy

/// User-facing labels from \`copy.*\` in tokens.json. The 30% bucket is "Deseos".
enum MirachCopy {
${copyEnum('bucket')}
${copyEnum('semaforo')}
}

// MARK: - Typography

/// Font family names from \`typography.font-family\`, in fallback order. Fonts are not bundled yet.
enum MirachFont {
    static let sans: [String] = ${list(fam.sans.$value ?? fam.sans)}
    static let mono: [String] = ${list(fam.mono.$value ?? fam.mono)}
    /// OpenType feature required for figures (\`typography.figure-features\`).
    static let figureFeatures = ${q(tokens.typography['figure-features'].$value)}
}

extension View {
    /// Rule "figures use tabular digits": amounts, dates and counts align in columns.
    func mirachFigures() -> some View {
        monospacedDigit()
    }
}

// MARK: - Radius

/// Corner radii from \`radius.*\`. The base is square; \`maxAllowed\` is a ceiling, not a default.
enum MirachRadius {
    static let base: CGFloat = ${px(radius.base)}
    static let maxAllowed: CGFloat = ${px(radius['max-allowed'])}
}
`;
}

/** Pure: tokens object -> [{ path (relative to apps/ios/Mirach), content }], in a stable order. */
export function buildOutputs(tokens) {
  const colors = collectColors(tokens);
  const files = [
    { path: `${ASSET_CATALOG}/Contents.json`, content: json({ info: XCODE_INFO }) },
  ];
  const groups = [...new Set(colors.map((c) => c.group))];
  for (const group of groups) {
    files.push({
      path: `${ASSET_CATALOG}/${pascal(group)}/Contents.json`,
      content: json({ info: XCODE_INFO, properties: { 'provides-namespace': true } }),
    });
  }
  for (const c of colors) {
    files.push({
      path: `${ASSET_CATALOG}/${pascal(c.group)}/${c.name}.colorset/Contents.json`,
      content: json(colorsetContents(c)),
    });
  }
  files.push({ path: SWIFT_FILE, content: renderSwift(tokens, colors) });
  return files;
}

/** Replaces the token catalog and Swift file under `iosSourceDir` (stale tokens disappear). */
export function writeOutputs(tokens, iosSourceDir) {
  const files = buildOutputs(tokens);
  rmSync(join(iosSourceDir, ASSET_CATALOG), { recursive: true, force: true });
  for (const f of files) {
    const target = join(iosSourceDir, f.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.content);
  }
  return files.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tokens = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));
  const count = writeOutputs(tokens, join(root, 'apps/ios/Mirach'));
  console.log(`generate-ios-tokens: wrote ${count} files`);
}
