#!/usr/bin/env node
// Generates the Android design tokens from design/tokens.json (Android app, T3).
//
// Output (relative to apps/android/app/src/main/kotlin/app/mirachbudget/android):
//   core/design/GeneratedTokens.kt
//       light/dark palettes grouped like the iOS Color.Mirach.<Group>, copy, fonts,
//       tabular figures and radii. Fully deterministic, no dependencies.
//
// Lives at the repo root next to generate-ios-tokens.mjs because both read the same
// source; apps/android/scripts/generate-tokens.sh is the thin wrapper.
// Run: node scripts/generate-android-tokens.mjs   (or apps/android/scripts/generate-tokens.sh)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { camel, collectColors, copyEntries, pascal } from './design-tokens.mjs';

const PACKAGE = 'app.mirachbudget.android.core.design';
const KOTLIN_FILE = 'core/design/GeneratedTokens.kt';

export const kotlinName = camel;

/** "#782c5c" -> "Color(0xFF782C5C)" (opaque sRGB). */
export function hexToArgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  return `Color(0xFF${m[1].toUpperCase()})`;
}

const q = (s) => JSON.stringify(s);
const px = (leaf) => String(parseFloat(leaf.$value));

function renderKotlin(tokens, colors) {
  const groups = [...new Set(colors.map((c) => c.group))];
  const inGroup = (g) => colors.filter((c) => c.group === g);

  const groupClasses = groups
    .map((g) => {
      const params = inGroup(g).map((c) => `    val ${kotlinName(c.name)}: Color,`).join('\n');
      return `@Immutable\nclass ${pascal(g)}Colors(\n${params}\n)`;
    })
    .join('\n\n');

  const paletteParams = groups.map((g) => `    val ${kotlinName(g)}: ${pascal(g)}Colors,`).join('\n');

  const palette = (theme) => {
    const body = groups
      .map((g) => {
        const args = inGroup(g).map((c) => `            ${kotlinName(c.name)} = ${hexToArgb(c[theme])},`).join('\n');
        return `        ${kotlinName(g)} = ${pascal(g)}Colors(\n${args}\n        ),`;
      })
      .join('\n');
    return `    val ${theme} = MirachPalette(\n${body}\n    )`;
  };

  const copyObject = (key) => {
    const lines = copyEntries(tokens, key).map(([k, v]) => `        const val ${kotlinName(k)} = ${q(v)}`);
    return `    object ${pascal(key)} {\n${lines.join('\n')}\n    }`;
  };

  const fam = tokens.typography['font-family'];
  const list = (arr) => `listOf(${arr.map(q).join(', ')})`;
  const { radius } = tokens;
  const spacing = Object.entries(tokens.spacing)
    .filter(([k]) => !k.startsWith('$'))
    .map(([k, leaf]) => `    val ${kotlinName(k)}: Dp = ${px(leaf)}.dp`)
    .join('\n');

  return `// GENERATED FILE. DO NOT EDIT.
// Source: design/tokens.json. Regenerate with: apps/android/scripts/generate-tokens.sh
// CI fails when this file is out of date (see the \`android\` job in .github/workflows/ci.yml).

package ${PACKAGE}

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// region Colors

${groupClasses}

/** Every Mirach color for one theme. Use: \`MirachTheme.colors.bucket.gustos\`. */
@Immutable
class MirachPalette(
${paletteParams}
)

object MirachPalettes {
${palette('light')}

${palette('dark')}
}

// endregion

// region Copy

/** User-facing labels from \`copy.*\` in tokens.json. The 30% bucket is "Gustos". */
object MirachCopy {
${copyObject('bucket')}
${copyObject('estado')}
}

// endregion

// region Typography

/** Font family names from \`typography.font-family\`, in fallback order. Inter is bundled (see MirachTypography.kt). */
object MirachFont {
    val sans: List<String> = ${list(fam.sans.$value)}

    /** OpenType feature required for figures (\`typography.figure-features\`). */
    const val figureFeatures = ${q(tokens.typography['figure-features'].$value)}
}

/** Rule "figures use tabular digits": amounts, dates and counts align in columns. */
fun TextStyle.mirachFigures(): TextStyle = copy(fontFeatureSettings = ${q(tokens.typography['figure-features'].$value)})

// endregion

// region Radius

/** Corner radii from \`radius.*\`. Corners are square. */
object MirachRadius {
    val base: Dp = ${px(radius.base)}.dp
}

// endregion

// region Spacing

/** Spacing scale from \`spacing.*\`, in dp. */
object MirachSpacing {
${spacing}
}

// endregion
`;
}

/** Pure: tokens object -> [{ path (relative to the Android source root), content }]. */
export function buildOutputs(tokens) {
  return [{ path: KOTLIN_FILE, content: renderKotlin(tokens, collectColors(tokens)) }];
}

export function writeOutputs(tokens, sourceDir) {
  const files = buildOutputs(tokens);
  for (const f of files) {
    const target = join(sourceDir, f.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.content);
  }
  return files.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tokens = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));
  const count = writeOutputs(tokens, join(root, 'apps/android/app/src/main/kotlin/app/mirachbudget/android'));
  console.log(`generate-android-tokens: wrote ${count} file`);
}
