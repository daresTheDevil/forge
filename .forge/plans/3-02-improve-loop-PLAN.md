---
phase: 3
plan: 02
slug: improve-loop
type: feature
wave: 3
depends_on:
  - spawn-stream
  - tui
files_modified:
  - server/src/cli/improve.ts
  - server/src/cli/improve.test.ts
autonomous: true
requirements:
  - REQ-006
  - REQ-007
must_haves:
  - "runImprove() accepts a scope array of file paths or glob patterns"
  - "runImprove() iterates up to maxIterations (default 10) calling spawnClaude each pass"
  - "Iteration stops early when the delta between passes falls below threshold (default 0.05)"
  - "The improve prompt instructs Claude to refactor at an aggressive quality bar without changing behavior"
  - "CLAUDECODE is deleted from child env (via spawnClaude) — never set in the improve subprocess"
  - "runImprove() returns { filesChanged: string[]; iterations: number; stoppedEarly: boolean }"
  - "Improve failure is non-fatal — runImprove() catches subprocess errors and returns partial results"
  - "Standalone mode: forge improve src/foo.ts runs the loop on the specified file"
  - "Standalone mode: forge improve with no argument reads filesModified from the most recently completed plan build state"
  - "forge improve with no argument and no completed plan state exits with a clear error message and code 1"
---

<objective>
Implement the improve loop — both as the auto-pass called by the build loop after a successful build,
and as a standalone `forge improve [path]` command. When complete:
- `server/src/cli/improve.ts` exports `runImprove()` and `buildImprovePrompt()`
- `server/src/cli/improve.test.ts` passes — covering prompt generation, delta detection, and error recovery
- The loop correctly iterates until the delta threshold or max iterations are reached
- Non-fatal error handling: subprocess failures are caught and logged, not thrown
</objective>

<context>
Read these before starting:

1. `/Users/dkay/code/forge/.forge/specs/forge-build-cli-SPEC.md` — REQ-006 and REQ-007 acceptance criteria in full
2. `/Users/dkay/code/forge/server/src/cli/spawn.ts` — spawnClaude() signature and SpawnOptions
3. `/Users/dkay/code/forge/server/src/cli/types.ts` — ImproveOptions interface
4. `/Users/dkay/code/forge/server/src/cli/display.ts` — attachDisplay() for live rendering
5. `/Users/dkay/code/forge/server/src/cli/tui.ts` — Tui interface for appendLog during improve pass

Key design decisions from the spec:
- The improve prompt must emphasize: refactor at an aggressive quality bar — optimal naming, structure,
  patterns, clarity — as the best engineer on the team would write it. Never change behavior.
- Delta threshold: measure change between iterations by comparing file sizes (or line counts) before
  and after each pass. If the total delta (sum of |after - before| / before for each file) is below
  0.05, stop early.
- The improve loop uses the same spawnClaude() from plan 2-01 — same CLAUDECODE guard, same flags.
- Scope expansion: when a glob pattern like `src/routes/**` is passed, use `node:fs` glob or manual
  readdirSync recursion — do NOT add a glob library dependency.
- For reading the most recently completed plan state (standalone, no args): read
  `.forge/state/last-build.json` if it exists. The build loop (plan 3-01) will write this file.
  If it does not exist, exit with a clear error.

Delta calculation (simple and testable):
```typescript
function calcDelta(before: Map<string, number>, after: Map<string, number>): number {
  let total = 0;
  let count = 0;
  for (const [file, beforeSize] of before) {
    const afterSize = after.get(file) ?? beforeSize;
    if (beforeSize > 0) {
      total += Math.abs(afterSize - beforeSize) / beforeSize;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}
```

Test strategy:
- Unit test `buildImprovePrompt()` — pure function, verify it mentions the quality bar and the scope
- Unit test `calcDelta()` — verify it returns 0 for unchanged files, >0 for changed files
- Unit test the `resolveScope()` function — verify glob expansion and fallback behavior
- Integration smoke test: verify `runImprove` is exported and callable; mock spawnClaude in tests
  using vitest's vi.mock() or by passing a custom spawn function via options

Do NOT:
- Install a glob library — use `readdirSync` recursion for directory expansion
- Change behavior in the improve prompt — only structure, naming, clarity
- Throw from runImprove on subprocess failure — catch, log, and return partial results
- Block the improve pass from running if scope is empty — log a notice and return early with 0 iterations
</context>

<tasks>
  <task type="auto">
    <files>server/src/cli/improve.test.ts,server/src/cli/improve.ts</files>
    <action>
Step 1 — Write failing tests FIRST (RED phase).

Create `server/src/cli/improve.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildImprovePrompt, calcDelta, resolveScope } from './improve.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

describe('buildImprovePrompt', () => {
  it('mentions the scope files in the prompt', () => {
    const prompt = buildImprovePrompt(['src/foo.ts', 'src/bar.ts'], 1, 3);
    expect(prompt).toContain('src/foo.ts');
    expect(prompt).toContain('src/bar.ts');
  });

  it('includes quality bar language', () => {
    const prompt = buildImprovePrompt(['src/foo.ts'], 1, 1);
    expect(prompt.toLowerCase()).toContain('refactor');
    expect(prompt.toLowerCase()).toContain('behavior');
  });

  it('includes iteration context', () => {
    const prompt = buildImprovePrompt(['src/foo.ts'], 2, 5);
    expect(prompt).toContain('2');
    expect(prompt).toContain('5');
  });
});

describe('calcDelta', () => {
  it('returns 0 for identical sizes', () => {
    const before = new Map([['a.ts', 100], ['b.ts', 200]]);
    const after = new Map([['a.ts', 100], ['b.ts', 200]]);
    expect(calcDelta(before, after)).toBe(0);
  });

  it('returns >0 when files changed', () => {
    const before = new Map([['a.ts', 100]]);
    const after = new Map([['a.ts', 120]]);
    expect(calcDelta(before, after)).toBeGreaterThan(0);
  });

  it('returns 0 for empty map', () => {
    expect(calcDelta(new Map(), new Map())).toBe(0);
  });

  it('handles file with zero bytes gracefully', () => {
    const before = new Map([['empty.ts', 0]]);
    const after = new Map([['empty.ts', 0]]);
    expect(calcDelta(before, after)).toBe(0);
  });
});

describe('resolveScope', () => {
  it('returns existing file paths unchanged', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-scope-'));
    const file = path.join(tmpDir, 'foo.ts');
    fs.writeFileSync(file, 'hello');
    const result = resolveScope([file]);
    expect(result).toContain(file);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('expands a directory to all .ts files within it', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-scope-'));
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'a');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'b');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# ignore');
    const result = resolveScope([tmpDir]);
    expect(result.some(f => f.endsWith('a.ts'))).toBe(true);
    expect(result.some(f => f.endsWith('b.ts'))).toBe(true);
    expect(result.some(f => f.endsWith('README.md'))).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty array for nonexistent paths', () => {
    const result = resolveScope(['/nonexistent/path/to/file.ts']);
    expect(result).toEqual([]);
  });
});

describe('runImprove', () => {
  it('exports runImprove function', async () => {
    const mod = await import('./improve.js');
    expect(typeof mod.runImprove).toBe('function');
  });

  it('returns early with 0 iterations when scope is empty', async () => {
    const { runImprove } = await import('./improve.js');
    const result = await runImprove({
      scope: [],
      maxIterations: 10,
      threshold: 0.05,
      standalone: false,
    });
    expect(result.iterations).toBe(0);
    expect(result.filesChanged).toEqual([]);
  });
});
```

Run: `cd /Users/dkay/code/forge/server && pnpm test` — tests MUST FAIL.

Step 2 — Create `server/src/cli/improve.ts`:

```typescript
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawnClaude } from './spawn.js';
import { attachDisplay } from './display.js';
import type { ImproveOptions } from './types.js';

// ── Delta calculation (pure, exported for testing) ────────────────────────────

/**
 * Compute the average normalized change across files.
 * Returns 0..∞ — values below threshold (default 0.05) trigger early stop.
 */
export function calcDelta(
  before: Map<string, number>,
  after: Map<string, number>
): number {
  let total = 0;
  let count = 0;
  for (const [file, beforeSize] of before) {
    const afterSize = after.get(file) ?? beforeSize;
    if (beforeSize > 0) {
      total += Math.abs(afterSize - beforeSize) / beforeSize;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

// ── Scope resolution (pure, exported for testing) ─────────────────────────────

/**
 * Resolve an array of paths/globs to actual file paths.
 * - Existing files are returned as-is
 * - Directories are expanded to all .ts/.js/.py files within them (recursive)
 * - Nonexistent paths are silently dropped
 */
export function resolveScope(patterns: string[]): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx|js|mjs|py|rb|go|rs)$/.test(entry)) {
          results.push(full);
        }
      } catch {
        // skip unreadable entries
      }
    }
  }

  for (const pattern of patterns) {
    if (!existsSync(pattern)) continue;
    const stat = statSync(pattern);
    if (stat.isDirectory()) {
      walk(pattern);
    } else {
      results.push(pattern);
    }
  }

  return results;
}

// ── Prompt builder (pure, exported for testing) ───────────────────────────────

/**
 * Build the improve pass prompt for a given iteration.
 * Quality bar: best engineer on the team — optimal naming, structure, patterns, clarity.
 * Constraint: never change observable behavior.
 */
export function buildImprovePrompt(
  files: string[],
  iteration: number,
  maxIterations: number
): string {
  const fileList = files.map(f => `- ${f}`).join('\n');

  return `You are performing an automated code quality improvement pass (iteration ${iteration}/${maxIterations}).

## Scope
The following files must be improved:
${fileList}

## Quality Bar
Refactor these files as the best engineer on the team would write them:
- Optimal naming: variables, functions, types, and constants should be precise and self-documenting
- Optimal structure: extract helpers where they clarify intent; inline where they obscure it
- Optimal patterns: apply idiomatic patterns for this language/framework; eliminate anti-patterns
- Optimal clarity: every block of logic should be immediately understandable to a skilled reader

## Critical Constraint
NEVER change observable behavior. This includes:
- Do not change function signatures (unless purely cosmetic renaming of internal parameters)
- Do not change exported API shapes
- Do not change logic — only the expression of that logic
- Do not add new features or fix bugs (if you notice a bug, leave a TODO comment — do not fix it)

## Workflow
1. Read each file in the scope
2. For each file: identify naming, structure, pattern, and clarity improvements
3. Apply improvements using the Edit tool
4. Run tests to verify no behavior change: run the project's test suite
5. If tests fail after your changes, revert your changes with git checkout -- <file> and stop

## Completion
When all files have been improved and tests pass, stop. Do not do anything else.`;
}

// ── File size snapshot ────────────────────────────────────────────────────────

function snapshotSizes(files: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const file of files) {
    try {
      map.set(file, statSync(file).size);
    } catch {
      map.set(file, 0);
    }
  }
  return map;
}

// ── Improve result ────────────────────────────────────────────────────────────

export interface ImproveResult {
  filesChanged: string[];
  iterations: number;
  stoppedEarly: boolean;
  error?: string;
}

// ── Main improve loop ─────────────────────────────────────────────────────────

export interface ImproveRunOptions extends ImproveOptions {
  cwd?: string;
  /** Optional TUI instance for live log rendering */
  tui?: {
    appendLog: (line: string) => void;
  };
}

/**
 * Run the improve loop on the given scope.
 * Non-fatal: subprocess errors are caught and returned in the result.
 */
export async function runImprove(opts: ImproveRunOptions): Promise<ImproveResult> {
  const resolvedFiles = resolveScope(opts.scope);

  if (resolvedFiles.length === 0) {
    return { filesChanged: [], iterations: 0, stoppedEarly: false };
  }

  const maxIterations = opts.maxIterations ?? 10;
  const threshold = opts.threshold ?? 0.05;
  const cwd = opts.cwd ?? process.cwd();
  const log = (line: string) => opts.tui?.appendLog(line);

  log(`\n  Improve pass — ${resolvedFiles.length} file(s), up to ${maxIterations} iterations`);

  let iteration = 0;
  let stoppedEarly = false;
  let lastError: string | undefined;

  let before = snapshotSizes(resolvedFiles);

  for (let i = 1; i <= maxIterations; i++) {
    iteration = i;
    log(`\n  Improve iteration ${i}/${maxIterations}`);

    const prompt = buildImprovePrompt(resolvedFiles, i, maxIterations);
    const emitter = new EventEmitter();

    if (opts.tui) {
      attachDisplay(emitter, { tui: opts.tui });
    }

    try {
      await spawnClaude(prompt, emitter, { cwd, taskType: 'auto' });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log(`  Improve subprocess error: ${lastError}`);
      break;
    }

    const after = snapshotSizes(resolvedFiles);
    const delta = calcDelta(before, after);
    log(`  Delta: ${delta.toFixed(4)} (threshold: ${threshold})`);

    if (delta < threshold) {
      stoppedEarly = true;
      log(`  Delta below threshold — stopping early after ${i} iteration(s)`);
      break;
    }

    before = after;
  }

  return {
    filesChanged: resolvedFiles,
    iterations: iteration,
    stoppedEarly,
    error: lastError,
  };
}

// ── Standalone entry point ────────────────────────────────────────────────────

/**
 * Run `forge improve` as a standalone command.
 * Reads scope from CLI args or falls back to last-build.json.
 */
export async function runImproveCommand(
  args: string[],
  cwd = process.cwd()
): Promise<number> {
  let scope: string[];

  if (args.length > 0) {
    // Explicit scope from CLI args: forge improve src/foo.ts src/bar.ts
    scope = args;
  } else {
    // No args: read files_modified from the most recent build state
    const lastBuildPath = path.join(cwd, '.forge', 'state', 'last-build.json');
    if (!existsSync(lastBuildPath)) {
      process.stderr.write(
        '[forge] No scope specified and no completed build found.\n' +
        '[forge] Usage: forge improve <file-or-dir> [file-or-dir ...]\n' +
        '[forge] Or run `forge build` first to generate a build state.\n'
      );
      return 1;
    }
    try {
      const lastBuild = JSON.parse(readFileSync(lastBuildPath, 'utf-8')) as { filesModified?: string[] };
      scope = lastBuild.filesModified ?? [];
    } catch {
      process.stderr.write('[forge] Failed to read last-build.json — file may be corrupted.\n');
      return 1;
    }

    if (scope.length === 0) {
      process.stderr.write('[forge] Last build had no files_modified — nothing to improve.\n');
      return 0;
    }
  }

  // Check CLAUDECODE guard
  if (process.env['CLAUDECODE']) {
    process.stderr.write(
      '[forge] forge improve cannot run inside an active Claude Code session.\n' +
      '[forge] Open a separate terminal outside Claude Code and run: forge improve\n'
    );
    return 1;
  }

  const result = await runImprove({
    scope,
    maxIterations: 10,
    threshold: 0.05,
    standalone: true,
    cwd,
  });

  // Print summary
  process.stdout.write('\n');
  process.stdout.write('─'.repeat(50) + '\n');
  process.stdout.write(`  Improve complete\n`);
  process.stdout.write(`  Iterations:     ${result.iterations}\n`);
  process.stdout.write(`  Files improved: ${result.filesChanged.length}\n`);
  if (result.stoppedEarly) {
    process.stdout.write('  Stopped early: delta below threshold\n');
  }
  if (result.error) {
    process.stdout.write(`  Warning: ${result.error}\n`);
  }
  process.stdout.write('─'.repeat(50) + '\n');

  return result.error ? 1 : 0;
}
```

Step 3 — Run tests to confirm GREEN:
`cd /Users/dkay/code/forge/server && pnpm test`

Step 4 — Typecheck:
`cd /Users/dkay/code/forge/server && pnpm typecheck`
    </action>
    <verify>cd /Users/dkay/code/forge/server && pnpm test 2>&1 | grep -E "passed|failed"</verify>
    <done>All improve.test.ts tests pass and typecheck exits 0</done>
  </task>
</tasks>

<verification>cd /Users/dkay/code/forge/server && pnpm test && pnpm typecheck</verification>
<success_criteria>
[REQ-006]: runImprove() is called by the build loop (plan 3-01) after all tasks complete. It iterates up to 10 times, stops early when delta < 0.05, uses the same CLAUDECODE guard via spawnClaude(), and returns partial results on subprocess failure (non-fatal). The scope is the union of files_modified across completed plan tasks.
[REQ-007]: runImproveCommand() handles forge improve with explicit paths, forge improve with no args (reads last-build.json), and forge improve with no args and no build state (exits 1 with clear message). Output shows which files were improved and how many iterations ran.
</success_criteria>
