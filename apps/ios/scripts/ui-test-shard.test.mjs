import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { allTests, onlyTestingArguments, shard, testsInSource } from './ui-test-shard.mjs';

const uiTestsDir = fileURLToPath(new URL('../MirachUITests', import.meta.url));

test('finds test methods with attributes and ignores helpers', () => {
  const source = [
    'final class MirachUITests: XCTestCase {',
    '    @MainActor',
    '    func testOne() {',
    '    @MainActor func testTwo() {',
    '    private func openTab(_ app: XCUIApplication) {',
    '    func testWithArgument(_ x: Int) {',
    '}',
  ].join('\n');
  assert.deepEqual(testsInSource(source), [
    { className: 'MirachUITests', testName: 'testOne' },
    { className: 'MirachUITests', testName: 'testTwo' },
  ]);
});

test('every real UI test lands in exactly one shard', () => {
  const tests = allTests(uiTestsDir);
  assert.ok(tests.length > 0);
  for (const total of [1, 2, 3, 4]) {
    const seen = new Map();
    for (let index = 0; index < total; index += 1) {
      for (const t of shard(tests, index, total)) {
        const key = `${t.className}/${t.testName}`;
        assert.equal(seen.has(key), false, `${key} is in two shards`);
        seen.set(key, index);
      }
    }
    assert.equal(seen.size, tests.length, `${total} shards must cover all tests`);
  }
});

test('shards are balanced to within one test', () => {
  const tests = allTests(uiTestsDir);
  const sizes = [0, 1, 2].map((index) => shard(tests, index, 3).length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `unbalanced: ${sizes}`);
});

test('the selection is deterministic', () => {
  assert.deepEqual(shard(allTests(uiTestsDir), 1, 3), shard(allTests(uiTestsDir), 1, 3));
});

test('rejects an invalid shard', () => {
  assert.throws(() => shard([], 3, 3));
  assert.throws(() => shard([], -1, 3));
  assert.throws(() => shard([], 0, 0));
});

test('builds xcodebuild arguments', () => {
  assert.deepEqual(onlyTestingArguments([{ className: 'C', testName: 'testX' }]), [
    '-only-testing:MirachUITests/C/testX',
  ]);
});
