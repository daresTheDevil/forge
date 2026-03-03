import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { ParsedTask, SpawnEvent } from './types.js';

// ── Tool set per task type ────────────────────────────────────────────────────

const TOOL_SETS: Record<string, string> = {
  'auto':      'Read,Edit,Write,Bash,Glob,Grep',
  'write':     'Read,Edit,Write,Glob,Grep',
  'read-only': 'Read,Glob,Grep',
};

export function getAllowedTools(taskType: string): string {
  // Explicit whitelist — unknown task types get the most restrictive set.
  return TOOL_SETS[taskType] ?? TOOL_SETS['read-only']!;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Build the minimal Claude prompt for a single task execution.
 * Injects only the task block and its context — NOT the full plan file.
 */
export function buildTaskPrompt(
  task: ParsedTask,
  planSlug: string,
  taskNumber: number,
  totalTasks: number
): string {
  const filesLine = task.files.length > 0
    ? `\n**Files to modify**: ${task.files.join(', ')}`
    : '';

  return `You are executing an autonomous TDD build task as part of the forge build loop.

## Task ${taskNumber}/${totalTasks} — Plan: ${planSlug}
${filesLine}

## Context
${task.context || '(no additional context)'}

## Your Task
${task.action}

## Workflow — Follow EXACTLY in order

### RED Phase
1. Write failing tests that verify the acceptance criteria
2. Run tests — confirm new tests FAIL (this proves the tests are correct)
3. Commit: git commit -m "test(task-${taskNumber}): write failing tests"

### GREEN Phase
4. Write minimum code to make the failing tests pass
5. Run tests — ALL tests must pass
6. Commit: git commit -m "feat(task-${taskNumber}): implement"

### REFACTOR Phase
7. Improve code structure without changing behavior
8. Run tests again — must still pass
9. Commit if changed: git commit -m "refactor(task-${taskNumber}): clean up"

## Verification
Run this command to verify completion: \`${task.verify}\`

## Done Condition
${task.done}

## Rules
- Work ONLY on this task — stop when done condition is met
- THREE-STRIKE RULE: If tests fail 3 consecutive times in GREEN phase, write a failure report to .forge/state/BLOCKER.md and STOP
- Never mark a task done without passing tests
- Always use conventional commit format`;
}

// ── Claude subprocess spawner ─────────────────────────────────────────────────

export interface SpawnOptions {
  cwd?: string;
  taskType?: string;
}

/**
 * Spawn claude with stream-json output and emit typed SpawnEvents.
 * Deletes CLAUDECODE from child env to allow nested invocation.
 * Returns the process exit code.
 */
export async function spawnClaude(
  prompt: string,
  emitter: EventEmitter,
  options: SpawnOptions = {}
): Promise<number> {
  // Strip CLAUDECODE from child env — claude -p refuses to run if it detects
  // an active parent Claude Code session via this variable.
  const childEnv: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (key !== 'CLAUDECODE' && val !== undefined) {
      childEnv[key] = val;
    }
  }

  const allowedTools = getAllowedTools(options.taskType ?? 'auto');

  const child = spawn('claude', [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions',
    '--allowedTools', allowedTools,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: options.cwd ?? process.cwd(),
    env: childEnv,
  });

  let buffer = '';

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      let event: SpawnEvent;
      try {
        event = JSON.parse(line) as SpawnEvent;
      } catch {
        // Non-JSON line — emit as raw text for logging
        emitter.emit('raw', line);
        continue;
      }
      emitter.emit(event.type, event);
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) emitter.emit('stderr', text);
  });

  return new Promise<number>((resolve) => {
    child.on('close', (code) => {
      resolve(code ?? 0);
    });
    child.on('error', (err: Error) => {
      emitter.emit('error', err);
      resolve(1);
    });
  });
}
