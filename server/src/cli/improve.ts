import { existsSync, lstatSync, readdirSync, statSync, readFileSync } from 'node:fs';
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
 * Resolve an array of paths to actual file paths.
 * - Existing files are returned as-is
 * - Directories are expanded to all source files within them (recursive)
 * - Symlinks are skipped (lstatSync does not follow them) to prevent both
 *   directory traversal and infinite recursion on circular symlinks
 * - Nonexistent paths are silently dropped
 *
 * Note: glob patterns (e.g. "src/**") are not supported. Pass literal file
 * or directory paths only. Use a directory path to expand all files within it.
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
        // lstatSync does not follow symlinks — symlinks are skipped entirely
        const stat = lstatSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (stat.isFile() && /\.(ts|tsx|js|mjs|py|rb|go|rs)$/.test(entry)) {
          results.push(full);
        }
        // symlinks: stat.isSymbolicLink() — intentionally skipped
      } catch {
        // skip unreadable entries
      }
    }
  }

  for (const pattern of patterns) {
    if (!existsSync(pattern)) continue;
    const stat = lstatSync(pattern);
    if (stat.isDirectory()) {
      walk(pattern);
    } else if (stat.isFile()) {
      results.push(pattern);
    }
    // top-level symlinks are also skipped
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

  const result: ImproveResult = {
    filesChanged: resolvedFiles,
    iterations: iteration,
    stoppedEarly,
  };
  if (lastError !== undefined) {
    result.error = lastError;
  }
  return result;
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
  // Check CLAUDECODE guard before doing anything
  if (process.env['CLAUDECODE']) {
    process.stderr.write(
      '[forge] forge improve cannot run inside an active Claude Code session.\n' +
      '[forge] Open a separate terminal outside Claude Code and run: forge improve\n'
    );
    return 1;
  }

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
