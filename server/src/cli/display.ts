import { EventEmitter } from 'node:events';
import { chalk } from './chalk.js';
import type { Tui } from './tui.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DisplayStats {
  inputTokens: number;
  outputTokens: number;
  filesModified: string[];
  durationMs: number;
  cost: number;
}

export interface DisplayContext {
  stats: DisplayStats;
}

type TuiLike = Pick<Tui, 'appendLog'> & { setTaskModel?: (m: string) => void };

// ─── attachDisplay ────────────────────────────────────────────────────────────

/**
 * Attach display handlers to a claude event emitter.
 * @param emitter - The event emitter from a spawned claude process
 * @param opts - Options: pass `tui` for full-screen TUI mode
 * @returns DisplayContext with accumulated stats
 */
export function attachDisplay(
  emitter: EventEmitter,
  opts: { tui?: TuiLike },
): DisplayContext {
  const tui = opts.tui ?? null;
  let inThinkingBlock = false;

  const ctx: DisplayContext = {
    stats: {
      inputTokens: 0,
      outputTokens: 0,
      filesModified: [],
      durationMs: 0,
      cost: 0,
    },
  };

  const closeThinkingBlock = () => {
    if (inThinkingBlock && tui) {
      tui.appendLog(chalk.dim('  ─'));
      inThinkingBlock = false;
    }
  };

  emitter.on('init', (event: { model?: string }) => {
    const model = event.model ?? 'unknown';
    if (tui) {
      tui.appendLog(chalk.bold.cyan(`[Forge] building (${model})`));
      if (tui.setTaskModel) tui.setTaskModel(model);
    }
  });

  emitter.on(
    'assistant',
    (event: {
      message?: {
        model?: string;
        content?: Array<{
          type: string;
          text?: string;
          name?: string;
          input?: Record<string, unknown>;
          content?: string;
        }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
    }) => {
      const msg = event.message;
      if (!msg?.content) return;

      // Update model from actual response (detects fallback)
      if (tui && tui.setTaskModel && msg.model) {
        tui.setTaskModel(msg.model);
      }

      for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
          if (tui) {
            const lines = block.text.split('\n').filter((l) => l);
            for (const line of lines) {
              if (!inThinkingBlock) {
                inThinkingBlock = true;
                tui.appendLog(chalk.dim('  ─'));
                tui.appendLog(
                  chalk.bold.cyan('[Forge]') + ' ' + chalk.white(line),
                );
              } else {
                tui.appendLog('        ' + chalk.white(line));
              }
            }
          }
        }

        if (block.type === 'tool_use') {
          closeThinkingBlock();
          const name = block.name ?? '';
          let label: string;

          if (name === 'Read') {
            const filePath =
              (block.input?.['file_path'] as string | undefined) ??
              (block.input?.['path'] as string | undefined) ??
              '';
            const short = filePath
              ? filePath.replace(process.cwd() + '/', '')
              : '';
            label = chalk.blue(`[Read]`) + ` ${chalk.blue(short)}`;
          } else if (name === 'Edit') {
            const filePath =
              (block.input?.['file_path'] as string | undefined) ??
              (block.input?.['path'] as string | undefined) ??
              '';
            const short = filePath
              ? filePath.replace(process.cwd() + '/', '')
              : '';
            if (short && !ctx.stats.filesModified.includes(short)) {
              ctx.stats.filesModified.push(short);
            }
            label = chalk.yellow(`[Edit]`) + ` ${chalk.yellow(short)}`;
          } else if (name === 'Write') {
            const filePath =
              (block.input?.['file_path'] as string | undefined) ??
              (block.input?.['path'] as string | undefined) ??
              '';
            const short = filePath
              ? filePath.replace(process.cwd() + '/', '')
              : '';
            if (short && !ctx.stats.filesModified.includes(short)) {
              ctx.stats.filesModified.push(short);
            }
            label = chalk.green(`[Write]`) + ` ${chalk.green(short)}`;
          } else if (name === 'Bash') {
            const cmd = (block.input?.['command'] as string | undefined) ?? '';
            const preview = cmd.slice(0, 60).replace(/\n/g, ' ');
            label = chalk.magenta(`[Bash]`) + ` ${chalk.dim(preview)}`;
          } else if (name === 'Glob' || name === 'Grep') {
            const pattern =
              (block.input?.['pattern'] as string | undefined) ??
              (block.input?.['glob'] as string | undefined) ??
              '';
            label = chalk.cyan(`[${name}]`) + ` ${chalk.dim(pattern)}`;
          } else {
            label = chalk.dim(`[${name}]`);
          }

          if (tui) {
            tui.appendLog(label);
          }
        }

        if (block.type === 'tool_result') {
          closeThinkingBlock();
          if (tui && block.content && typeof block.content === 'string') {
            const lines = block.content.split('\n');
            const maxLines = 8;
            const shown = lines.slice(0, maxLines);
            for (const line of shown) {
              tui.appendLog(chalk.dim('  ' + line.slice(0, 120)));
            }
            if (lines.length > maxLines) {
              tui.appendLog(
                chalk.dim(`  ... (${lines.length - maxLines} more lines)`),
              );
            }
          }
        }
      }

      // Track token usage from message
      if (msg.usage) {
        ctx.stats.inputTokens += msg.usage.input_tokens ?? 0;
        ctx.stats.outputTokens += msg.usage.output_tokens ?? 0;
      }
    },
  );

  emitter.on(
    'result',
    (event: {
      duration_ms?: number;
      total_cost_usd?: number;
      is_error?: boolean;
      usage?: { input_tokens?: number; output_tokens?: number };
    }) => {
      ctx.stats.durationMs = event.duration_ms ?? 0;
      ctx.stats.cost = event.total_cost_usd ?? 0;

      if (event.usage) {
        ctx.stats.inputTokens =
          event.usage.input_tokens ?? ctx.stats.inputTokens;
        ctx.stats.outputTokens =
          event.usage.output_tokens ?? ctx.stats.outputTokens;
      }

      if (tui) {
        const status = event.is_error
          ? chalk.red('Error')
          : chalk.green('Completed');
        tui.appendLog(
          `${status} — ${(ctx.stats.durationMs / 1000).toFixed(1)}s | $${ctx.stats.cost.toFixed(4)}`,
        );
      }
    },
  );

  emitter.on('error', (err: { message?: string } | Error) => {
    const msg = err instanceof Error ? err.message : (err.message ?? String(err));
    if (tui) {
      tui.appendLog(chalk.red(`Error: ${msg}`));
    }
  });

  return ctx;
}
