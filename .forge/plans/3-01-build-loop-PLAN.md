---
phase: 3
plan: 01
slug: build-loop
type: feature
wave: 3
depends_on:
  - spawn-stream
  - tui
  - types-and-plan-parser
files_modified:
  - server/src/cli/build.ts
  - server/src/cli/build.test.ts
autonomous: true
requirements:
  - REQ-001
  - REQ-003
  - REQ-004
  - REQ-008
  - REQ-009
must_haves:
  - "runBuild() reads .forge/plans/ and exits with a clear error if the directory does not exist"
  - "runBuild() exits with a message (code 0) when no autonomous:true tasks are found"
  - "Tasks execute in wave order — all wave N tasks complete before any wave N+1 task begins"
  - "Each task gets up to 3 attempts; on 3 consecutive failures BLOCKER.md is written and runBuild returns exit code 1"
  - "Task success is determined by running the task's <verify> command (exit code 0 = success)"
  - "BLOCKER.md is written to .forge/state/BLOCKER.md with task ID, failure reason per attempt, last stdout/stderr excerpt"
  - "post-TUI summary prints: tasks completed count, time elapsed, files modified count, whether improve ran, blocked task if any"
  - "Summary prints 'Next: run /forge:review' on success or 'Next: resolve BLOCKER.md and re-run' on failure"
  - "runBuild() exits with code 0 on full success, code 1 on any blocked task"
  - "After all tasks complete successfully, writes .forge/state/last-build.json with { filesModified, completedAt } so forge improve with no args has a scope"
---

<objective>
Implement the main build loop orchestrator. When complete:
- `server/src/cli/build.ts` exports `runBuild()` which orchestrates the full build lifecycle
- `server/src/cli/build.test.ts` passes — covering the loop logic, BLOCKER.md writing, and summary output
- The three-strike retry mechanism works correctly
- Wave ordering is enforced
</objective>

<context>
Read these before starting:

1. `/Users/dkay/code/golem-cc/lib/build.js` — the reference implementation. The forge build loop is structurally similar but uses the forge plan format instead of golem state.json.
2. `/Users/dkay/code/forge/.forge/specs/forge-build-cli-SPEC.md` — REQ-001, REQ-004, REQ-008, REQ-009 acceptance criteria
3. `/Users/dkay/code/forge/server/src/cli/types.ts` — BuildState, PlanFile, ParsedTask types
4. `/Users/dkay/code/forge/server/src/cli/parser.ts` — parsePlanFiles(), extractTask()
5. `/Users/dkay/code/forge/server/src/cli/spawn.ts` — spawnClaude(), buildTaskPrompt()
6. `/Users/dkay/code/forge/server/src/cli/tui.ts` — createTui(), Tui interface
7. `/Users/dkay/code/forge/server/src/cli/display.ts` — attachDisplay()

Key design decisions (different from golem-cc):
- Task success = `<verify>` command exits 0 (not state.json update)
- Wave grouping: group plans by `frontmatter.wave`, execute each wave group sequentially
- BLOCKER.md path: `.forge/state/BLOCKER.md` (not `.golem/BLOCKER.md`)
- Plans directory: `.forge/plans/` (resolved relative to `process.cwd()`)
- `runBuild()` takes an optional `opts` argument: `{ plansDir?: string; cwd?: string }`
- The TUI must be initialized before any task starts and destroyed in a `finally` block

Verify command execution:
```typescript
// Use node:child_process spawnSync to run the verify command
// Parse the command string as shell words (split on spaces — good enough for forge verify commands)
const result = spawnSync('sh', ['-c', task.verify], { cwd, encoding: 'utf-8' });
const success = result.status === 0;
```

BLOCKER.md format:
```markdown
# Build Blocker

**Task**: plan-slug / task-index
**Failed at**: <ISO timestamp>
**Attempts**: 3

## Failure Log

### Attempt 1
<failure reason or 'verify command failed'>

### Attempt 2
...

## Next Steps
1. Review the failure log above
2. Fix the blocking issue manually
3. Delete `.forge/state/BLOCKER.md`
4. Run `forge build` to retry
```

Test strategy:
- Write unit tests for pure helper functions: `groupByWave()`, `formatSummary()`
- Write integration-style tests using temp directories with fixture plan files
- Mock spawnClaude and verify command execution — do NOT actually spawn claude in unit tests
- Test the three-strike counter increments and BLOCKER.md is written on third failure

Do NOT:
- Read state.json to check task completion — forge uses the verify command
- Hardcode the plans directory path — always resolve from options or process.cwd()
- Skip the `finally` TUI cleanup — a crash must not leave the terminal in alternate screen mode
</context>

<tasks>
  <task type="auto">
    <files>server/src/cli/build.test.ts,server/src/cli/build.ts</files>
    <action>
Step 1 — Write failing tests FIRST (RED phase).

Create `server/src/cli/build.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { groupByWave, formatSummary, writeBlocker } from './build.js';
import type { BuildState, TaskState } from './types.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

describe('groupByWave', () => {
  it('groups plans by wave number', () => {
    const plans = [
      { frontmatter: { wave: 1, slug: 'a', autonomous: true }, tasks: [], filePath: '', body: '' },
      { frontmatter: { wave: 2, slug: 'b', autonomous: true }, tasks: [], filePath: '', body: '' },
      { frontmatter: { wave: 1, slug: 'c', autonomous: true }, tasks: [], filePath: '', body: '' },
    ] as any;
    const grouped = groupByWave(plans);
    expect(grouped.get(1)?.length).toBe(2);
    expect(grouped.get(2)?.length).toBe(1);
  });

  it('returns an empty map for empty input', () => {
    expect(groupByWave([])).toEqual(new Map());
  });
});

describe('formatSummary', () => {
  it('formats success summary with next step', () => {
    const state: BuildState = {
      startedAt: new Date().toISOString(),
      completedTasks: [
        { planSlug: 'my-plan', taskIndex: 0, status: 'completed', attempts: 1, failureReasons: [] },
      ],
      blockedTask: null,
      filesModified: ['src/foo.ts', 'src/bar.ts'],
      totalTasks: 1,
      doneCount: 1,
    };
    const summary = formatSummary(state, false);
    expect(summary).toContain('1');           // tasks completed
    expect(summary).toContain('/forge:review'); // next step
    expect(summary).toContain('2');           // files modified
  });

  it('formats blocked summary with blocker instruction', () => {
    const state: BuildState = {
      startedAt: new Date().toISOString(),
      completedTasks: [],
      blockedTask: { planSlug: 'my-plan', taskIndex: 0, status: 'blocked', attempts: 3, failureReasons: ['verify failed'] },
      filesModified: [],
      totalTasks: 3,
      doneCount: 0,
    };
    const summary = formatSummary(state, false);
    expect(summary).toContain('BLOCKER');
    expect(summary).toContain('BLOCKER.md');
    expect(summary).toContain('re-run');
  });

  it('mentions improve pass when it ran', () => {
    const state: BuildState = {
      startedAt: new Date().toISOString(),
      completedTasks: [{ planSlug: 'p', taskIndex: 0, status: 'completed', attempts: 1, failureReasons: [] }],
      blockedTask: null,
      filesModified: ['a.ts'],
      totalTasks: 1,
      doneCount: 1,
    };
    const summary = formatSummary(state, true); // improveRan = true
    expect(summary).toContain('improve');
  });
});

describe('writeBlocker', () => {
  it('writes BLOCKER.md to the specified directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-blocker-'));
    const taskState: TaskState = {
      planSlug: 'my-plan',
      taskIndex: 1,
      status: 'blocked',
      attempts: 3,
      failureReasons: ['verify failed attempt 1', 'claude exited 1', 'verify timed out'],
    };
    writeBlocker(tmpDir, taskState);
    const blockerPath = path.join(tmpDir, 'BLOCKER.md');
    expect(fs.existsSync(blockerPath)).toBe(true);
    const content = fs.readFileSync(blockerPath, 'utf-8');
    expect(content).toContain('my-plan');
    expect(content).toContain('verify failed attempt 1');
    expect(content).toContain('Attempt 1');
    expect(content).toContain('Attempt 2');
    expect(content).toContain('Attempt 3');
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('runBuild', () => {
  it('exports runBuild function', async () => {
    const mod = await import('./build.js');
    expect(typeof mod.runBuild).toBe('function');
  });

  it('exits non-zero when plans directory does not exist', async () => {
    const { runBuild } = await import('./build.js');
    const code = await runBuild({
      plansDir: '/nonexistent/path/to/plans',
      cwd: process.cwd(),
      dryRun: true,
    });
    expect(code).toBe(1);
  });

  it('exits 0 with message when no autonomous tasks found', async () => {
    const { runBuild } = await import('./build.js');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-plans-'));
    const planContent = `---
phase: 1
plan: 01
slug: manual-only
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: false
requirements: []
must_haves: []
---
<tasks><task type="auto"><files>x.ts</files><action>x</action><verify>true</verify><done>done</done></task></tasks>
`;
    fs.writeFileSync(path.join(tmpDir, '1-01-manual-only-PLAN.md'), planContent);
    const code = await runBuild({ plansDir: tmpDir, cwd: process.cwd(), dryRun: true });
    expect(code).toBe(0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

Run: `cd /Users/dkay/code/forge/server && pnpm test` — tests MUST FAIL.

Step 2 — Create `server/src/cli/build.ts`.

Implement the following exports:

```typescript
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { parsePlanFiles } from './parser.js';
import { spawnClaude, buildTaskPrompt } from './spawn.js';
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

// ── Build options ─────────────────────────────────────────────────────────────

export interface BuildOptions {
  plansDir?: string;
  cwd?: string;
  /** Skip TUI and actual claude invocation — for testing */
  dryRun?: boolean;
}

// ── Main build loop ───────────────────────────────────────────────────────────

export async function runBuild(opts: BuildOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const plansDir = opts.plansDir ?? path.join(cwd, '.forge', 'plans');
  const stateDir = path.join(cwd, '.forge', 'state');

  // Check plans directory exists
  if (!existsSync(plansDir)) {
    process.stderr.write(
      `[forge] No plans directory found at ${plansDir}\n` +
      `[forge] Run /forge:plan inside Claude Code to create a plan first.\n`
    );
    return 1;
  }

  // Load plans
  const allPlans = parsePlanFiles(plansDir);
  const autonomousPlans = allPlans.filter(p => p.frontmatter.autonomous);

  if (autonomousPlans.length === 0) {
    process.stdout.write('[forge] No autonomous tasks found — nothing to run.\n');
    return 0;
  }

  // Count total autonomous tasks
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

  // Check for CLAUDECODE guard
  if (process.env['CLAUDECODE']) {
    process.stderr.write(
      '[forge] forge build cannot run inside an active Claude Code session.\n' +
      '[forge] Open a separate terminal outside Claude Code and run: forge build\n'
    );
    return 1;
  }

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

            const prompt = buildTaskPrompt(task, planSlug, taskIndex + 1, plan.tasks.length);
            const emitter = new EventEmitter();
            const ctx = attachDisplay(emitter, { tui });

            const exitCode = await spawnClaude(prompt, emitter, {
              cwd,
              taskType: task.type,
            });

            // Accumulate modified files from display context
            for (const f of ctx.stats.filesModified) {
              if (!buildState.filesModified.includes(f)) {
                buildState.filesModified.push(f);
              }
            }

            // Verify using the task's <verify> command
            const verifyResult = spawnSync('sh', ['-c', task.verify], {
              cwd,
              encoding: 'utf-8',
              timeout: 60_000,
            });

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
              const reason = exitCode !== 0
                ? `claude exited with code ${exitCode}`
                : `verify command failed (exit ${verifyResult.status}): ${verifyResult.stderr?.slice(0, 200) ?? ''}`;
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
```

Step 3 — Run tests to confirm GREEN:
`cd /Users/dkay/code/forge/server && pnpm test`

Step 4 — Typecheck:
`cd /Users/dkay/code/forge/server && pnpm typecheck`
    </action>
    <verify>cd /Users/dkay/code/forge/server && pnpm test 2>&1 | grep -E "passed|failed"</verify>
    <done>All build.test.ts tests pass and typecheck exits 0</done>
  </task>
</tasks>

<verification>cd /Users/dkay/code/forge/server && pnpm test && pnpm typecheck</verification>
<success_criteria>
[REQ-001]: runBuild() handles missing plans dir and no-autonomous-tasks cases with clear error messages and correct exit codes.
[REQ-003]: TUI is initialized before the first task and destroyed in a finally block.
[REQ-004]: Three-strike retry loop increments attempts, writes BLOCKER.md on third failure, exits code 1.
[REQ-008]: Plans are loaded with parsePlanFiles(), grouped by wave, and executed in wave order.
[REQ-009]: formatSummary() produces the required post-TUI output including task count, time, files, improve status, and next step.
</success_criteria>
