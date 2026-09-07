/**
 * A test harness small enough to read in one sitting.
 *
 * Deliberately not a test framework. This repo already has a convention for
 * "a check you can run" in `eval` and `redteam`, and a second one with its own
 * config, runner and reporter would be more machinery than the thing it checks.
 */

let passed = 0;
const failures: string[] = [];

export function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n    ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function eq<T>(actual: T, expected: T, what: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}\n    expected ${e}\n    actual   ${a}`);
}

export function ok(cond: boolean, what: string) {
  if (!cond) throw new Error(what);
}

export function report() {
  console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
  for (const f of failures) console.error(`  FAIL  ${f}\n`);
  process.exit(failures.length === 0 ? 0 : 1);
}
