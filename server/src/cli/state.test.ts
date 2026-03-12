import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createEmptyState,
  loadState,
  saveState,
  loadCompletedSlugs,
  updateStateFile,
  loadRegistry,
  saveRegistry,
  registerCR,
  unregisterCR,
  isWorktree,
  findRootRepo,
  discoverWorktrees,
  acquireBuildLock,
  releaseBuildLock,
  migrateFromCurrentMd,
} from './state.js';
import type { ForgeState } from './state.js';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `forge-${prefix}-`));
}

// ── State read/write ────────────────────────────────────────────────────────

describe('loadState', () => {
  it('returns empty state when file does not exist', () => {
    const dir = tmpDir('load');
    const state = loadState(dir);
    expect(state.version).toBe(2);
    expect(state.phase).toBe('none');
    expect(state.build.completed_plans).toEqual([]);
    fs.rmSync(dir, { recursive: true });
  });

  it('loads a v2 state file', () => {
    const dir = tmpDir('load-v2');
    const v2: ForgeState = {
      version: 2,
      phase: 'building',
      cr_id: 'CR-2026-001',
      task: 'api-setup',
      last_action: 'build started',
      next_action: 'run forge build',
      updated_at: '2026-03-12T00:00:00Z',
      build: {
        completed_plans: ['api-server', 'frontend'],
        blocked_plan: null,
        last_build_at: '2026-03-12T00:00:00Z',
      },
    };
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(v2));
    const state = loadState(dir);
    expect(state.version).toBe(2);
    expect(state.cr_id).toBe('CR-2026-001');
    expect(state.build.completed_plans).toEqual(['api-server', 'frontend']);
    fs.rmSync(dir, { recursive: true });
  });

  it('migrates v1 state (no version field) to v2', () => {
    const dir = tmpDir('load-v1');
    const v1 = {
      phase: 'building',
      build: { completed_tasks: ['docker-compose', 'drizzle-schema'] },
    };
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(v1));
    const state = loadState(dir);
    expect(state.version).toBe(2);
    expect(state.phase).toBe('building');
    expect(state.build.completed_plans).toEqual(['docker-compose', 'drizzle-schema']);
    expect(state.cr_id).toBeNull();
    fs.rmSync(dir, { recursive: true });
  });

  it('returns empty state for malformed JSON', () => {
    const dir = tmpDir('load-bad');
    fs.writeFileSync(path.join(dir, 'state.json'), 'not json');
    const state = loadState(dir);
    expect(state.version).toBe(2);
    expect(state.phase).toBe('none');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('saveState', () => {
  it('writes state and sets updated_at', () => {
    const dir = tmpDir('save');
    const state = createEmptyState();
    state.phase = 'building';
    state.build.completed_plans = ['slug-a'];
    saveState(dir, state);
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf-8'));
    expect(raw.version).toBe(2);
    expect(raw.phase).toBe('building');
    expect(raw.build.completed_plans).toEqual(['slug-a']);
    expect(raw.updated_at).toBeTruthy();
    fs.rmSync(dir, { recursive: true });
  });

  it('creates directory if it does not exist', () => {
    const dir = path.join(tmpDir('save-mkdir'), 'nested', '.forge');
    const state = createEmptyState();
    saveState(dir, state);
    expect(fs.existsSync(path.join(dir, 'state.json'))).toBe(true);
    fs.rmSync(path.dirname(path.dirname(dir)), { recursive: true });
  });
});

describe('loadCompletedSlugs', () => {
  it('returns slugs from v2 state', () => {
    const dir = tmpDir('slugs');
    const state = createEmptyState();
    state.build.completed_plans = ['a', 'b', 'c'];
    saveState(dir, state);
    expect(loadCompletedSlugs(dir)).toEqual(new Set(['a', 'b', 'c']));
    fs.rmSync(dir, { recursive: true });
  });

  it('returns slugs from v1 state (migration)', () => {
    const dir = tmpDir('slugs-v1');
    fs.writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({ phase: 'building', build: { completed_tasks: ['x', 'y'] } }),
    );
    expect(loadCompletedSlugs(dir)).toEqual(new Set(['x', 'y']));
    fs.rmSync(dir, { recursive: true });
  });
});

describe('updateStateFile', () => {
  it('creates v2 state with completed slugs', () => {
    const dir = tmpDir('update');
    updateStateFile(dir, ['slug-a', 'slug-b']);
    const state = loadState(dir);
    expect(state.version).toBe(2);
    expect(state.phase).toBe('building');
    expect(state.build.completed_plans).toEqual(['slug-a', 'slug-b']);
    expect(state.build.last_build_at).toBeTruthy();
    fs.rmSync(dir, { recursive: true });
  });

  it('merges with existing completed plans without duplicates', () => {
    const dir = tmpDir('update-merge');
    updateStateFile(dir, ['a']);
    updateStateFile(dir, ['a', 'b']);
    const state = loadState(dir);
    expect(state.build.completed_plans).toEqual(['a', 'b']);
    fs.rmSync(dir, { recursive: true });
  });

  it('sets blocked plan', () => {
    const dir = tmpDir('update-blocked');
    updateStateFile(dir, ['a'], { blocked: 'b' });
    const state = loadState(dir);
    expect(state.build.blocked_plan).toBe('b');
    fs.rmSync(dir, { recursive: true });
  });

  it('migrates v1 on update', () => {
    const dir = tmpDir('update-v1');
    fs.writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({ phase: 'building', build: { completed_tasks: ['old'] } }),
    );
    updateStateFile(dir, ['new']);
    const state = loadState(dir);
    expect(state.version).toBe(2);
    expect(state.build.completed_plans).toEqual(['old', 'new']);
    fs.rmSync(dir, { recursive: true });
  });

  it('round-trips with loadCompletedSlugs', () => {
    const dir = tmpDir('roundtrip');
    updateStateFile(dir, ['x', 'y']);
    expect(loadCompletedSlugs(dir)).toEqual(new Set(['x', 'y']));
    fs.rmSync(dir, { recursive: true });
  });
});

// ── Registry ────────────────────────────────────────────────────────────────

describe('registry', () => {
  it('returns empty registry when file does not exist', () => {
    const dir = tmpDir('reg-empty');
    const reg = loadRegistry(dir);
    expect(reg.version).toBe(1);
    expect(reg.crs).toEqual([]);
    fs.rmSync(dir, { recursive: true });
  });

  it('round-trips save and load', () => {
    const dir = tmpDir('reg-roundtrip');
    saveRegistry(dir, {
      version: 1,
      crs: [{ id: 'CR-001', branch: 'forge/CR-001', worktree: '.claude/worktrees/CR-001', created_at: '2026-01-01' }],
    });
    const reg = loadRegistry(dir);
    expect(reg.crs).toHaveLength(1);
    expect(reg.crs[0]!.id).toBe('CR-001');
    fs.rmSync(dir, { recursive: true });
  });

  it('registerCR adds entry and is idempotent', () => {
    const dir = tmpDir('reg-add');
    const entry = { id: 'CR-001', branch: 'forge/CR-001', worktree: '.claude/worktrees/CR-001', created_at: '2026-01-01' };
    registerCR(dir, entry);
    registerCR(dir, entry); // duplicate — should not add
    const reg = loadRegistry(dir);
    expect(reg.crs).toHaveLength(1);
    fs.rmSync(dir, { recursive: true });
  });

  it('unregisterCR removes entry', () => {
    const dir = tmpDir('reg-remove');
    registerCR(dir, { id: 'CR-001', branch: 'b', worktree: 'w', created_at: 't' });
    registerCR(dir, { id: 'CR-002', branch: 'b2', worktree: 'w2', created_at: 't' });
    unregisterCR(dir, 'CR-001');
    const reg = loadRegistry(dir);
    expect(reg.crs).toHaveLength(1);
    expect(reg.crs[0]!.id).toBe('CR-002');
    fs.rmSync(dir, { recursive: true });
  });
});

// ── Worktree detection ──────────────────────────────────────────────────────

describe('isWorktree', () => {
  it('returns false for a regular .git directory', () => {
    const dir = tmpDir('wt-dir');
    fs.mkdirSync(path.join(dir, '.git'));
    expect(isWorktree(dir)).toBe(false);
    fs.rmSync(dir, { recursive: true });
  });

  it('returns true for a .git file (worktree marker)', () => {
    const dir = tmpDir('wt-file');
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /some/path/.git/worktrees/foo');
    expect(isWorktree(dir)).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  it('returns false when no .git exists', () => {
    const dir = tmpDir('wt-none');
    expect(isWorktree(dir)).toBe(false);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('findRootRepo', () => {
  it('returns cwd for a regular .git directory', () => {
    const dir = tmpDir('root-dir');
    fs.mkdirSync(path.join(dir, '.git'));
    expect(findRootRepo(dir)).toBe(dir);
    fs.rmSync(dir, { recursive: true });
  });

  it('extracts root from worktree .git file', () => {
    const dir = tmpDir('root-wt');
    fs.writeFileSync(
      path.join(dir, '.git'),
      'gitdir: /Users/dkay/code/postgres-prod/.git/worktrees/CR-2026-001',
    );
    expect(findRootRepo(dir)).toBe('/Users/dkay/code/postgres-prod');
    fs.rmSync(dir, { recursive: true });
  });

  it('returns null for missing .git', () => {
    const dir = tmpDir('root-none');
    expect(findRootRepo(dir)).toBeNull();
    fs.rmSync(dir, { recursive: true });
  });
});

describe('discoverWorktrees', () => {
  it('returns empty when no worktrees directory exists', () => {
    const dir = tmpDir('discover-empty');
    expect(discoverWorktrees(dir)).toEqual([]);
    fs.rmSync(dir, { recursive: true });
  });

  it('discovers worktrees with their state', () => {
    const root = tmpDir('discover');
    const wtDir = path.join(root, '.claude', 'worktrees', 'CR-001');
    const forgeDir = path.join(wtDir, '.forge');
    fs.mkdirSync(forgeDir, { recursive: true });

    const state = createEmptyState();
    state.phase = 'building';
    state.cr_id = 'CR-001';
    state.build.completed_plans = ['plan-a'];
    saveState(forgeDir, state);

    const wts = discoverWorktrees(root);
    expect(wts).toHaveLength(1);
    expect(wts[0]!.name).toBe('CR-001');
    expect(wts[0]!.state.build.completed_plans).toEqual(['plan-a']);
    fs.rmSync(root, { recursive: true });
  });
});

// ── BUILD.lock ──────────────────────────────────────────────────────────────

describe('BUILD.lock', () => {
  it('acquires lock and writes PID', () => {
    const dir = tmpDir('lock-acquire');
    const result = acquireBuildLock(dir);
    expect(result.acquired).toBe(true);
    const pid = fs.readFileSync(path.join(dir, 'BUILD.lock'), 'utf-8').trim();
    expect(parseInt(pid, 10)).toBe(process.pid);
    releaseBuildLock(dir);
    fs.rmSync(dir, { recursive: true });
  });

  it('detects active lock from current process', () => {
    const dir = tmpDir('lock-active');
    // Write lock with our own PID (process.kill(ownPid, 0) will succeed)
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'BUILD.lock'), String(process.pid));
    const result = acquireBuildLock(dir);
    expect(result.acquired).toBe(false);
    expect(result.existingPid).toBe(process.pid);
    releaseBuildLock(dir);
    fs.rmSync(dir, { recursive: true });
  });

  it('cleans stale lock from dead PID', () => {
    const dir = tmpDir('lock-stale');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'BUILD.lock'), '999999999'); // almost certainly dead
    const result = acquireBuildLock(dir);
    expect(result.acquired).toBe(true);
    releaseBuildLock(dir);
    fs.rmSync(dir, { recursive: true });
  });

  it('releaseBuildLock is safe when no lock exists', () => {
    const dir = tmpDir('lock-release');
    fs.mkdirSync(dir, { recursive: true });
    expect(() => releaseBuildLock(dir)).not.toThrow();
    fs.rmSync(dir, { recursive: true });
  });
});

// ── Migration from current.md ───────────────────────────────────────────────

describe('migrateFromCurrentMd', () => {
  it('returns null when current.md does not exist', () => {
    const dir = tmpDir('migrate-none');
    expect(migrateFromCurrentMd(dir)).toBeNull();
    fs.rmSync(dir, { recursive: true });
  });

  it('extracts phase, CR, and completed plans from current.md', () => {
    const dir = tmpDir('migrate');
    const stateDir = path.join(dir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'current.md'), `# Current Forge State

**Project**: My Project
**Phase**: building
**Active change request**: CR-2026-001
**Last updated**: 2026-03-12T00:00:00Z

### Completed (2/4)
- api-server (wave 1)
- frontend-ui (wave 2)

### Remaining (2/4)
- backend-api (wave 3)
- e2e-tests (wave 4)
`);
    const state = migrateFromCurrentMd(dir);
    expect(state).not.toBeNull();
    expect(state!.phase).toBe('building');
    expect(state!.cr_id).toBe('CR-2026-001');
    expect(state!.build.completed_plans).toEqual(['api-server', 'frontend-ui']);
  });

  it('handles current.md with no completed section', () => {
    const dir = tmpDir('migrate-minimal');
    const stateDir = path.join(dir, 'state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'current.md'), `# Current State
**Phase**: released
**Active change request**: none
`);
    const state = migrateFromCurrentMd(dir);
    expect(state).not.toBeNull();
    expect(state!.phase).toBe('released');
    expect(state!.cr_id).toBeNull();
    expect(state!.build.completed_plans).toEqual([]);
  });
});
