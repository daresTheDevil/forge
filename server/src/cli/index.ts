import { fileURLToPath } from 'node:url';
import { runBuild, runBuildStatus } from './build.js';
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

  const cmd = argv[0] as string;
  const rest = argv.slice(1);

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
    '  forge build --status       Show build progress (completed/ready/blocked)\n' +
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
        if (parsed.args.includes('--status')) {
          process.exit(runBuildStatus());
          break;
        }
        const buildOpts = parsed.args[0] !== undefined ? { planFile: parsed.args[0] } : {};
        const code = await runBuild(buildOpts);
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
