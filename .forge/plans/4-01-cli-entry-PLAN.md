---
phase: 4
plan: 01
slug: cli-entry
type: feature
wave: 4
depends_on:
  - build-loop
  - improve-loop
files_modified:
  - server/src/cli/index.ts
  - server/src/cli/index.test.ts
autonomous: true
requirements:
  - REQ-001
  - REQ-007
must_haves:
  - "server/src/cli/index.ts is a standalone CLI entry point (not the MCP server)"
  - "Running `node server/dist/cli/index.js build` invokes runBuild() and exits with its return code"
  - "Running `node server/dist/cli/index.js improve [files...]` invokes runImproveCommand() and exits with its return code"
  - "Running `node server/dist/cli/index.js` with no command prints usage and exits 0"
  - "Running `node server/dist/cli/index.js unknown-command` prints usage and exits 1"
  - "The CLI entry point does NOT start the MCP server (server/src/index.ts remains separate)"
  - "pnpm build in server/ compiles the CLI entry point to server/dist/cli/index.js"
  - "When forge build completes with exit code 0, runImprove() is called automatically with the filesModified from last-build.json; improve failure is caught, logged, and treated as non-fatal (build is still success)"
---

<objective>
Create the CLI entry point that wires `forge build` and `forge improve` subcommands to the
loop implementations. When complete:
- `server/src/cli/index.ts` is a self-contained entry point with a shebang and arg-parsing
- `pnpm build` in `server/` compiles it to `server/dist/cli/index.js`
- Calling `node server/dist/cli/index.js build` runs the build loop
- Calling `node server/dist/cli/index.js improve [files...]` runs the improve command
- The MCP server entry point (`server/src/index.ts`) is completely unchanged
</objective>

<context>
Read these before starting:

1. `/Users/dkay/code/forge/server/src/index.ts` — the existing MCP server entry point; understand
   its structure so the CLI entry point is clearly separate. Do NOT modify index.ts.
2. `/Users/dkay/code/forge/server/src/cli/build.ts` — `runBuild()` signature and return type
3. `/Users/dkay/code/forge/server/src/cli/improve.ts` — `runImproveCommand()` signature and return type
4. `/Users/dkay/code/forge/server/tsconfig.json` — current `outDir: ./dist`, `rootDir: ./src` settings;
   the CLI entry will compile to `server/dist/cli/index.js` automatically
5. `/Users/dkay/code/forge/install.sh` — how the MCP server entry is currently invoked
   (`node server/dist/index.js`); the CLI entry will be invoked as `node server/dist/cli/index.js`

Key design decisions:
- The CLI entry point is at `server/src/cli/index.ts` — it compiles alongside the rest of the
  server package because `tsconfig.json` already includes `src/**/*`
- No separate tsconfig or build step is needed — one `pnpm build` compiles everything
- Arg parsing: use `process.argv.slice(2)` directly — no commander/yargs dependency
- Exit via `process.exit(code)` with the return code from runBuild/runImproveCommand
- Shebang line is NOT needed in the TypeScript source — the dispatcher calls it with `node`

CLI interface:
```
forge build                       Run the build loop for the current project
forge improve [file ...]          Run the improve loop on specified files
forge improve                     Run the improve loop on last-build files_modified
```

Error cases (all print to stderr and exit 1):
- `forge xyz` — unknown command, print usage
- `forge build` with CLAUDECODE set — runBuild() handles this internally
- `forge improve` with CLAUDECODE set — runImproveCommand() handles this internally

Test strategy:
- Write unit tests that import the CLI module and test its arg-parsing helpers
- Test the `parseArgs()` pure function: verifies command routing logic
- Do NOT actually call runBuild or runImproveCommand in unit tests — they require TUI/claude
- One smoke test: verify the CLI module can be imported without throwing

Do NOT:
- Modify `server/src/index.ts` — the MCP server must remain unchanged
- Add commander, yargs, or any arg-parsing library
- Start the MCP server from the CLI entry point
- Use `require()` — ESM only
</context>

<tasks>
  <task type="auto">
    <files>server/src/cli/index.test.ts,server/src/cli/index.ts</files>
    <action>
Step 1 — Write failing tests FIRST (RED phase).

Create `server/src/cli/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCliArgs } from './index.js';

describe('parseCliArgs', () => {
  it('parses the build command', () => {
    const result = parseCliArgs(['build']);
    expect(result.command).toBe('build');
    expect(result.args).toEqual([]);
  });

  it('parses the improve command with no args', () => {
    const result = parseCliArgs(['improve']);
    expect(result.command).toBe('improve');
    expect(result.args).toEqual([]);
  });

  it('parses the improve command with file args', () => {
    const result = parseCliArgs(['improve', 'src/foo.ts', 'src/bar.ts']);
    expect(result.command).toBe('improve');
    expect(result.args).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('returns null command for empty args', () => {
    const result = parseCliArgs([]);
    expect(result.command).toBeNull();
  });

  it('returns unknown command for unrecognized subcommands', () => {
    const result = parseCliArgs(['deploy']);
    expect(result.command).toBe('unknown');
    expect(result.raw).toBe('deploy');
  });
});

describe('CLI module', () => {
  it('can be imported without throwing', async () => {
    // The module must not auto-execute when imported in test context
    // (it only runs when process.argv[1] matches the module file path)
    await expect(import('./index.js')).resolves.toBeDefined();
  });

  it('exports parseCliArgs', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.parseCliArgs).toBe('function');
  });
});
```

Run: `cd /Users/dkay/code/forge/server && pnpm test` — tests MUST FAIL.

Step 2 — Create `server/src/cli/index.ts`:

```typescript
import { fileURLToPath } from 'node:url';
import { runBuild } from './build.js';
import { runImproveCommand } from './improve.js';

// ── Arg parsing (pure, exported for testing) ──────────────────────────────────

export interface CliArgs {
  command: 'build' | 'improve' | 'unknown' | null;
  args: string[];
  raw?: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  if (argv.length === 0) {
    return { command: null, args: [] };
  }

  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'build':
      return { command: 'build', args: rest };
    case 'improve':
      return { command: 'improve', args: rest };
    default:
      return { command: 'unknown', args: rest, raw: cmd };
  }
}

// ── Usage text ────────────────────────────────────────────────────────────────

function printUsage(): void {
  process.stdout.write(
    'forge — AI development workflow\n\n' +
    'Usage:\n' +
    '  forge build                Run the autonomous build loop\n' +
    '  forge improve [file ...]   Run the improve loop on specified files\n' +
    '  forge improve              Run the improve loop on last-build files\n\n' +
    'Inside Claude Code, use /forge:help to see all commands.\n'
  );
}

// ── Main entry point ──────────────────────────────────────────────────────────
// Only auto-executes when this file is the entry point (not when imported in tests).

const isMain = (() => {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  const argv = process.argv.slice(2);
  const parsed = parseCliArgs(argv);

  (async () => {
    switch (parsed.command) {
      case 'build': {
        const code = await runBuild();
        if (code === 0) {
          // Auto-improve on files touched by the build (REQ-006). Non-fatal.
          try {
            await runImproveCommand([]);  // no args → reads last-build.json
          } catch (err) {
            process.stderr.write(`[forge] Improve pass failed (non-fatal): ${err instanceof Error ? err.message : String(err)}\n`);
          }
        }
        process.exit(code);
        break;
      }
      case 'improve': {
        const code = await runImproveCommand(parsed.args);
        process.exit(code);
        break;
      }
      case null: {
        printUsage();
        process.exit(0);
        break;
      }
      case 'unknown':
      default: {
        process.stderr.write(`forge: unknown command '${parsed.raw}'\n\n`);
        printUsage();
        process.exit(1);
        break;
      }
    }
  })().catch((err: unknown) => {
    process.stderr.write(`[forge] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
```

Step 3 — Verify compilation:
```
cd /Users/dkay/code/forge/server && pnpm build
```

Confirm `server/dist/cli/index.js` exists after the build.

Step 4 — Run tests to confirm GREEN:
```
cd /Users/dkay/code/forge/server && pnpm test
```

Step 5 — Typecheck:
```
cd /Users/dkay/code/forge/server && pnpm typecheck
```

Step 6 — Smoke test the compiled CLI:
```
node /Users/dkay/code/forge/server/dist/cli/index.js
```
Should print usage and exit 0.
    </action>
    <verify>cd /Users/dkay/code/forge/server && pnpm build && pnpm test && node /Users/dkay/code/forge/server/dist/cli/index.js 2>&1 | grep -q "forge" && echo "CLI smoke test passed"</verify>
    <done>server/dist/cli/index.js exists, pnpm test passes, CLI prints usage when called with no args</done>
  </task>
</tasks>

<verification>cd /Users/dkay/code/forge/server && pnpm build && pnpm test && pnpm typecheck && node /Users/dkay/code/forge/server/dist/cli/index.js 2>&1 | grep -i forge</verification>
<success_criteria>
[REQ-001]: The CLI entry point routes `forge build` to runBuild() and exits with its return code. Missing plans directory or no autonomous tasks are handled by runBuild() — the CLI does not need to duplicate these checks.
[REQ-007]: The CLI entry point routes `forge improve [files...]` to runImproveCommand() with the remaining argv as the scope. With no args, runImproveCommand() reads last-build.json automatically.
</success_criteria>
