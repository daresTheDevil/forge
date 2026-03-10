import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { parsePlanFiles } from './parser.js';
import { spawnClaude, buildTaskPrompt } from './spawn.js';
import { runImprove } from './improve.js';
import { createTui } from './tui.js';
import { attachDisplay } from './display.js';
import type { BuildState, PlanFile, TaskState } from './types.js';

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function groupByWave(plans: PlanFile[]): Map<number, PlanFile[]> {
  const map = new Map<number, PlanFile[]>();
  for (const plan of plans) {
    const wave = plan.frontmatter.wave;
    if (!map.has(wave)) map.set(wave, []);
    map.get(wave)!.push(plan);
  }
  return map;
}

export function writeBlocker(stateDir: string, taskState: TaskState): void {
  mkdirSync(stateDir, { recursive: true });
  const lines = [
    '# Build Blocker',
    '',
    `**Task**: ${taskState.planSlug} / task-${taskState.taskIndex}`,
    `**Failed at**: ${new Date().toISOString()}`,
    `**Attempts**: ${taskState.attempts}`,
    '',
    '## Failure Log',
    '',
    ...taskState.failureReasons.flatMap((reason, i) => [
      `### Attempt ${i + 1}`,
      reason,
      '',
    ]),
    '## Next Steps',
    '1. Review the failure log above',
    '2. Fix the blocking issue manually',
    '3. Delete `.forge/state/BLOCKER.md`',
    '4. Run `forge build` to retry',
  ];
  writeFileSync(path.join(stateDir, 'BLOCKER.md'), lines.join('\n'));
}

export function formatSummary(state: BuildState, improveRan: boolean): string {
  const elapsed = Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}m ${String(secs).padStart(2, '0')}s`;

  const lines: string[] = [
    '─'.repeat(50),
    '',
  ];

  if (state.blockedTask) {
    lines.push(`  BLOCKED`);
    lines.push(`  Task ${state.blockedTask.planSlug}/task-${state.blockedTask.taskIndex} failed ${state.blockedTask.attempts} attempts`);
    lines.push(`  See: .forge/state/BLOCKER.md`);
    if (state.completedTasks.length > 0) {
      lines.push('');
      lines.push(`  Also completed: ${state.completedTasks.length} task(s)`);
    }
    lines.push('');
    lines.push('  Next: resolve BLOCKER.md and re-run');
  } else {
    lines.push(`  Build complete`);
    lines.push(`  Tasks completed: ${state.completedTasks.length}/${state.totalTasks}`);
    lines.push(`  Files modified:  ${state.filesModified.length}`);
    lines.push(`  Time elapsed:    ${timeStr}`);
    if (improveRan) lines.push('  Improve pass:    ran');
    lines.push('');
    lines.push('  Next: run /forge:review');
  }

  lines.push('');
  lines.push('─'.repeat(50));
  return lines.join('\n');
}

// ── Async verify helper ───────────────────────────────────────────────────────

/**
 * Run the task's <verify> command asynchronously (non-blocking event loop).
 * Plan files are developer-controlled content; sh -c is used because verify
 * commands legitimately need shell features (&&, pipes, cd).
 * Trust boundary: forge plans are authored by the developer or by Claude
 * under developer supervision — they are not externally-sourced.
 */
function runVerify(
  cmd: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ status: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', cmd], {
      stdio: ['ignore', 'ignore', 'pipe'],
      cwd,
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString().slice(0, 500);
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve({ status: 124, stderr: '[verify command timed out]' });
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ status: code ?? 1, stderr });
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({ status: 1, stderr: err.message });
    });
  });
}

// ── Interactive plan selector ─────────────────────────────────────────────────

/**
 * Present an arrow-key selector when the user runs `forge build` with no args
 * and multiple plan files exist. Returns the selected PlanFile, or null if the
 * user cancels (Ctrl-C) or the environment is non-interactive.
 *
 * Falls back gracefully in non-TTY environments (CI, pipes) — returns null so
 * the caller can emit a helpful message instead of crashing.
 */
export async function selectPlan(plans: PlanFile[]): Promise<PlanFile | null> {
  if (plans.length === 0) return null;
  if (plans.length === 1) return plans[0]!;

  const { select } = await import('@inquirer/prompts');

  const choices = plans.map(p => ({
    name: `${path.basename(p.filePath).padEnd(45)} wave ${p.frontmatter.wave} · ${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'}`,
    value: p,
    short: path.basename(p.filePath),
  }));

  try {
    return await select<PlanFile>({
      message: 'Select a plan to build',
      choices,
    });
  } catch {
    // NonInteractiveError or Ctrl-C
    return null;
  }
}

// ── Build options ─────────────────────────────────────────────────────────────

export interface BuildOptions {
  plansDir?: string;
  cwd?: string;
  /** Specific plan filename (basename) to run — skips interactive selector */
  planFile?: string;
  /** Skip TUI and actual claude invocation — for testing */
  dryRun?: boolean;
}

// ── Main build loop ───────────────────────────────────────────────────────────

export async function runBuild(opts: BuildOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const plansDir = opts.plansDir ?? path.join(cwd, '.forge', 'plans');
  const stateDir = path.join(cwd, '.forge', 'state');

  // CLAUDECODE guard — fail fast before any file I/O or TUI initialization.
  // forge build cannot run inside an active Claude Code session.
  if (!opts.dryRun && process.env['CLAUDECODE']) {
    process.stderr.write(
      '[forge] forge build cannot run inside an active Claude Code session.\n' +
      '[forge] Open a separate terminal outside Claude Code and run: forge build\n'
    );
    return 1;
  }

  // Check plans directory exists
  if (!existsSync(plansDir)) {
    process.stderr.write(
      `[forge] No plans directory found at ${plansDir}\n` +
      `[forge] Run /forge:plan inside Claude Code to create a plan first.\n`
    );
    return 1;
  }

  // Load plans
  const { plans: allPlans, skipped } = parsePlanFiles(plansDir);

  // Always report skipped files so the user knows what was ignored and why
  if (skipped.length > 0) {
    process.stdout.write(`[forge] Skipped ${skipped.length} file(s) in ${plansDir}:\n`);
    for (const s of skipped) {
      process.stdout.write(`  SKIP: ${s.filename} — ${s.reason}\n`);
    }
    process.stdout.write('\n');
  }

  // Filter to a specific plan file if one was passed as an argument
  let planPool = allPlans;
  if (opts.planFile) {
    const target = opts.planFile;
    planPool = allPlans.filter(p => path.basename(p.filePath) === target);
    if (planPool.length === 0) {
      process.stderr.write(
        `[forge] Plan file not found: ${target}\n` +
        `[forge] Available plans: ${allPlans.map(p => path.basename(p.filePath)).join(', ') || 'none'}\n`
      );
      return 1;
    }
  } else if (!opts.dryRun && allPlans.length > 1) {
    // Multiple plans, no file specified — present interactive selector
    const selected = await selectPlan(allPlans);
    if (!selected) {
      process.stdout.write('[forge] No plan selected.\n');
      return 0;
    }
    planPool = [selected];
  }

  const autonomousPlans = planPool.filter(p => p.frontmatter.autonomous);
  const nonAutonomousPlans = planPool.filter(p => !p.frontmatter.autonomous);

  if (autonomousPlans.length === 0) {
    if (nonAutonomousPlans.length > 0) {
      process.stdout.write(
        `[forge] ${nonAutonomousPlans.length} plan(s) loaded but none are marked autonomous: true\n` +
        `[forge] Plans: ${nonAutonomousPlans.map(p => p.frontmatter.slug).join(', ')}\n` +
        `[forge] Set autonomous: true in the plan frontmatter to include them in the build.\n`
      );
    } else if (allPlans.length === 0 && skipped.length === 0) {
      process.stdout.write(
        `[forge] No plan files found in ${plansDir}\n` +
        `[forge] Run /forge:plan inside Claude Code to create a plan first.\n`
      );
    } else {
      process.stdout.write('[forge] No autonomous tasks found — nothing to run.\n');
    }
    return 0;
  }

  // Count total autonomous tasks (build-wide, used for progress display)
  const totalTasks = autonomousPlans.reduce((sum, p) => sum + p.tasks.length, 0);

  if (opts.dryRun) return 0;

  // Initialize build state
  const buildState: BuildState = {
    startedAt: new Date().toISOString(),
    completedTasks: [],
    blockedTask: null,
    filesModified: [],
    totalTasks,
    doneCount: 0,
  };

  // Initialize TUI
  const tui = createTui();
  const firstPlan = autonomousPlans[0]!;
  tui.init({
    taskId: firstPlan.frontmatter.slug,
    taskTitle: firstPlan.frontmatter.slug,
    stage: 'RED',
    done: 0,
    total: totalTasks,
  });

  let improveRan = false;
  let interrupted = false;

  process.once('SIGINT', () => {
    interrupted = true;
    tui.destroy();
    process.stdout.write('\n[forge] Build interrupted.\n');
    process.exit(130);
  });

  try {
    // Execute waves in order
    const waveMap = groupByWave(autonomousPlans);
    const waveNumbers = [...waveMap.keys()].sort((a, b) => a - b);

    waveLoop: for (const waveNum of waveNumbers) {
      if (interrupted) break;
      const wavePlans = waveMap.get(waveNum)!;

      tui.appendLog(`\n  Wave ${waveNum}`);

      for (const plan of wavePlans) {
        if (interrupted) break waveLoop;

        for (let taskIndex = 0; taskIndex < plan.tasks.length; taskIndex++) {
          if (interrupted) break waveLoop;

          const task = plan.tasks[taskIndex]!;
          const planSlug = plan.frontmatter.slug;
          const MAX_ATTEMPTS = 3;
          let taskDone = false;
          const failureReasons: string[] = [];

          tui.appendLog(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          tui.appendLog(`  Task ${buildState.doneCount + 1}/${totalTasks} — ${planSlug}`);

          tui.updateTask({
            taskId: `${planSlug}/${taskIndex}`,
            taskTitle: task.action.slice(0, 60),
            stage: 'RED',
            done: buildState.doneCount,
            total: totalTasks,
            attempt: 1,
            maxAttempts: MAX_ATTEMPTS,
          });

          for (let attempt = 1; attempt <= MAX_ATTEMPTS && !taskDone && !interrupted; attempt++) {
            if (attempt > 1) {
              tui.appendLog(`  ↻ Retry attempt ${attempt}/${MAX_ATTEMPTS}`);
            }
            tui.updateTask({ attempt, maxAttempts: MAX_ATTEMPTS });

            // Build-wide task number (N/total) for the Claude prompt
            const prompt = buildTaskPrompt(
              task,
              planSlug,
              buildState.doneCount + 1,
              totalTasks,
            );
            const emitter = new EventEmitter();
            const ctx = attachDisplay(emitter, { tui });

            const exitCode = await spawnClaude(prompt, emitter, {
              cwd,
              taskType: task.type,
            });

            // Release emitter listeners — prevent accumulation across retries
            emitter.removeAllListeners();

            // Accumulate modified files from display context
            for (const f of ctx.stats.filesModified) {
              if (!buildState.filesModified.includes(f)) {
                buildState.filesModified.push(f);
              }
            }

            // Verify using the task's <verify> command (async — does not block event loop)
            const verifyResult = await runVerify(task.verify, cwd, 60_000);

            if (verifyResult.status === 0) {
              taskDone = true;
              buildState.doneCount++;
              const taskState: TaskState = {
                planSlug,
                taskIndex,
                status: 'completed',
                attempts: attempt,
                failureReasons: [],
              };
              buildState.completedTasks.push(taskState);
              tui.updateTask({ done: buildState.doneCount, stage: 'CHECKPOINT' });
              tui.appendLog(`  ✓ Task ${taskIndex + 1} complete`);
            } else {
              const claudeFailed = exitCode !== 0;
              const reason = claudeFailed
                ? `claude exited with code ${exitCode}`
                : `verify command failed (exit ${verifyResult.status}): ${verifyResult.stderr.slice(0, 200)}`;
              failureReasons.push(reason);
              tui.appendLog(`  ⚠ Attempt ${attempt} failed — ${reason.slice(0, 100)}`);
            }
          }

          if (!taskDone && !interrupted) {
            const taskState: TaskState = {
              planSlug,
              taskIndex,
              status: 'blocked',
              attempts: MAX_ATTEMPTS,
              failureReasons,
            };
            buildState.blockedTask = taskState;
            writeBlocker(stateDir, taskState);
            tui.appendLog(`\n  BLOCKED: task-${taskIndex + 1} of ${planSlug} failed ${MAX_ATTEMPTS} attempts`);
            tui.appendLog('  Blocker report: .forge/state/BLOCKER.md');
            break waveLoop;
          }
        }
      }
    }

    // Auto-improve pass on files touched by the build (REQ-006).
    // Non-fatal: improve failure does not invalidate a successful build.
    if (!buildState.blockedTask && buildState.filesModified.length > 0 && !interrupted) {
      tui.appendLog('\n  Running improve pass...');
      try {
        const improveResult = await runImprove({
          scope: buildState.filesModified,
          maxIterations: 10,
          threshold: 0.05,
          standalone: false,
          cwd,
          tui,
        });
        improveRan = !improveResult.error;
        if (improveResult.error) {
          tui.appendLog(`  Improve pass failed (non-fatal): ${improveResult.error}`);
        } else {
          tui.appendLog(`  Improve pass complete — ${improveResult.iterations} iteration(s)`);
        }
      } catch (err) {
        tui.appendLog(`  Improve pass error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

  } finally {
    tui.destroy();
  }

  // Write last-build.json for `forge improve` with no args
  if (!buildState.blockedTask && buildState.filesModified.length > 0) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      path.join(stateDir, 'last-build.json'),
      JSON.stringify({ filesModified: buildState.filesModified, completedAt: new Date().toISOString() }, null, 2)
    );
  }

  // Print post-TUI summary
  process.stdout.write(formatSummary(buildState, improveRan) + '\n');

  return buildState.blockedTask ? 1 : 0;
}
