import { describe, it, expect, vi } from 'vitest';
import { groupByWave, formatSummary, writeBlocker, hasSummary, updateStateFile } from './build.js';
import type { BuildState, TaskState } from './types.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

describe('hasSummary', () => {
  it('returns true when SUMMARY file exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-summary-'));
    const planPath = path.join(tmpDir, '1-01-test-PLAN.md');
    const summaryPath = path.join(tmpDir, '1-01-test-SUMMARY.md');
    fs.writeFileSync(planPath, '');
    fs.writeFileSync(summaryPath, '');
    expect(hasSummary(planPath)).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns false when SUMMARY file does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-summary-'));
    const planPath = path.join(tmpDir, '1-01-test-PLAN.md');
    fs.writeFileSync(planPath, '');
    expect(hasSummary(planPath)).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

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
    expect(summary).toContain('BLOCKED');    // status word
    expect(summary).toContain('BLOCKER.md'); // file reference
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
    expect(summary).toContain('Improve pass');
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

describe('updateStateFile', () => {
  it('creates state.json with completed slugs and phase=building', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-state-'));
    updateStateFile(tmpDir, ['docker-compose-stack']);
    const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'state.json'), 'utf-8'));
    expect(state.phase).toBe('building');
    expect(state.build.completed_tasks).toEqual(['docker-compose-stack']);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('appends to existing completed_tasks without duplicates', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-state-'));
    const stateFile = path.join(tmpDir, 'state.json');
    fs.writeFileSync(stateFile, JSON.stringify({
      phase: 'building',
      build: { completed_tasks: ['api-server'] },
    }));
    updateStateFile(tmpDir, ['api-server', 'docker-compose-stack']);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    expect(state.build.completed_tasks).toEqual(['api-server', 'docker-compose-stack']);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('recovers from malformed state.json', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-state-'));
    fs.writeFileSync(path.join(tmpDir, 'state.json'), 'not json');
    updateStateFile(tmpDir, ['my-slug']);
    const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'state.json'), 'utf-8'));
    expect(state.phase).toBe('building');
    expect(state.build.completed_tasks).toEqual(['my-slug']);
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
