#!/usr/bin/env node
// Prints the `-only-testing:` arguments for one shard of the iPhone UI test suite, one per line.
//
//   node scripts/ui-test-shard.mjs <index> <total> [uiTestsDir]
//
// Every `test…` method of every `XCTestCase` subclass under the UI tests folder goes to exactly
// one shard, round-robin in a stable order (file path, then position in the file), so CI can run
// the slow UI suite on several runners at once. No dependencies: CI only needs Node.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UI_TEST_TARGET = 'MirachUITests';

/** All `{ className, testName }` in a Swift source, in declaration order. */
export function testsInSource(source) {
  const tests = [];
  let className = null;
  for (const line of source.split('\n')) {
    const cls = line.match(/^\s*(?:final\s+)?class\s+(\w+)\s*:\s*XCTestCase\b/);
    if (cls) className = cls[1];
    const fn = line.match(/^\s*(?:@\w+\s+)*func\s+(test\w*)\s*\(\s*\)/);
    if (fn && className) tests.push({ className, testName: fn[1] });
  }
  return tests;
}

/** Every Swift file under `dir`, sorted, as paths relative to `dir`. */
function swiftFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return swiftFiles(path, base);
      return entry.name.endsWith('.swift') ? [relative(base, path)] : [];
    })
    .sort();
}

/** Every UI test under `dir`, in the stable order used for sharding. */
export function allTests(dir) {
  return swiftFiles(dir).flatMap((file) => testsInSource(readFileSync(join(dir, file), 'utf8')));
}

/** The tests of shard `index` (0-based) out of `total`. */
export function shard(tests, index, total) {
  if (!Number.isInteger(total) || total < 1) throw new Error(`invalid shard total: ${total}`);
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    throw new Error(`invalid shard index ${index} for ${total} shards`);
  }
  return tests.filter((_, position) => position % total === index);
}

export function onlyTestingArguments(tests) {
  return tests.map((t) => `-only-testing:${UI_TEST_TARGET}/${t.className}/${t.testName}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [indexArg, totalArg, dirArg] = process.argv.slice(2);
  const dir = dirArg ?? join(fileURLToPath(new URL('..', import.meta.url)), UI_TEST_TARGET);
  const tests = allTests(dir);
  if (tests.length === 0) throw new Error(`no UI tests found under ${dir}`);
  const selected = shard(tests, Number(indexArg), Number(totalArg));
  process.stdout.write(onlyTestingArguments(selected).join('\n') + '\n');
}
