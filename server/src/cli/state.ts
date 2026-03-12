import { z } from 'zod';
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// ── State schema (v2) ───────────────────────────────────────────────────────

export const ForgeStateSchema = z.object({
  version: z.literal(2),
  phase: z.string(),
  cr_id: z.string().nullable().default(null),
  task: z.string().nullable().default(null),
  last_action: z.string().nullable().default(null),
  next_action: z.string().nullable().default(null),
  updated_at: z.string(),
  build: z.object({
    completed_plans: z.array(z.string()),
    blocked_plan: z.string().nullable().default(null),
    last_build_at: z.string().nullable().default(null),
  }),
});

export type ForgeState = z.infer<typeof ForgeStateSchema>;

// ── Registry schema ─────────────────────────────────────────────────────────

export const RegistryEntrySchema = z.object({
  id: z.string(),
  branch: z.string(),
  worktree: z.string(),
  created_at: z.string(),
});

export const ForgeRegistrySchema = z.object({
  version: z.literal(1),
  crs: z.array(RegistryEntrySchema),
});

export type ForgeRegistry = z.infer<typeof ForgeRegistrySchema>;
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

// ── State defaults ──────────────────────────────────────────────────────────

export function createEmptyState(): ForgeState {
  return {
    version: 2,
    phase: 'none',
    cr_id: null,
    task: null,
    last_action: null,
    next_action: null,
    updated_at: new Date().toISOString(),
    build: {
      completed_plans: [],
      blocked_plan: null,
      last_build_at: null,
    },
  };
}

// ── v1 → v2 migration ──────────────────────────────────────────────────────

/**
 * Upgrade a v1 state.json (no version field, `completed_tasks` array) to v2.
 * Preserves completed plan slugs and phase.
 */
function migrateV1(raw: Record<string, unknown>): ForgeState {
  const build = raw['build'] as Record<string, unknown> | undefined;
  const completedTasks = Array.isArray(build?.['completed_tasks'])
    ? (build!['completed_tasks'] as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  return {
    version: 2,
    phase: typeof raw['phase'] === 'string' ? raw['phase'] : 'unknown',
    cr_id: null,
    task: null,
    last_action: null,
    next_action: null,
    updated_at: new Date().toISOString(),
    build: {
      completed_plans: completedTasks,
      blocked_plan: null,
      last_build_at: null,
    },
  };
}

// ── State read/write ────────────────────────────────────────────────────────

/**
 * Load forge state from .forge/state.json.
 * Handles missing files, malformed JSON, and v1 → v2 migration.
 */
export function loadState(forgeDir: string): ForgeState {
  const filePath = path.join(forgeDir, 'state.json');
  if (!existsSync(filePath)) return createEmptyState();

  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));

    if (raw?.version === 2) {
      return ForgeStateSchema.parse(raw);
    }

    // v1 format (no version field) — migrate
    return migrateV1(raw);
  } catch {
    return createEmptyState();
  }
}

/**
 * Write forge state to .forge/state.json.
 * Always sets updated_at to now.
 */
export function saveState(forgeDir: string, state: ForgeState): void {
  mkdirSync(forgeDir, { recursive: true });
  state.updated_at = new Date().toISOString();
  writeFileSync(
    path.join(forgeDir, 'state.json'),
    JSON.stringify(state, null, 2) + '\n'
  );
}

/**
 * Convenience: return completed plan slugs as a Set.
 * Used by selectPlan() and runBuildStatus() for dependency resolution.
 */
export function loadCompletedSlugs(forgeDir: string): Set<string> {
  const state = loadState(forgeDir);
  return new Set(state.build.completed_plans);
}

/**
 * Add completed plan slugs to state and write back.
 * Merges with existing completed_plans (no duplicates).
 */
export function updateStateFile(
  forgeDir: string,
  completedSlugs: string[],
  opts?: { blocked?: string | null; phase?: string },
): void {
  const state = loadState(forgeDir);
  state.phase = opts?.phase ?? 'building';
  state.build.last_build_at = new Date().toISOString();

  for (const slug of completedSlugs) {
    if (!state.build.completed_plans.includes(slug)) {
      state.build.completed_plans.push(slug);
    }
  }

  if (opts?.blocked !== undefined) {
    state.build.blocked_plan = opts.blocked;
  }

  saveState(forgeDir, state);
}

// ── Registry read/write ─────────────────────────────────────────────────────

export function loadRegistry(rootDir: string): ForgeRegistry {
  const filePath = path.join(rootDir, '.forge', 'registry.json');
  if (!existsSync(filePath)) return { version: 1, crs: [] };

  try {
    return ForgeRegistrySchema.parse(JSON.parse(readFileSync(filePath, 'utf-8')));
  } catch {
    return { version: 1, crs: [] };
  }
}

export function saveRegistry(rootDir: string, registry: ForgeRegistry): void {
  const forgeDir = path.join(rootDir, '.forge');
  mkdirSync(forgeDir, { recursive: true });
  writeFileSync(
    path.join(forgeDir, 'registry.json'),
    JSON.stringify(registry, null, 2) + '\n'
  );
}

/**
 * Add a CR entry to the registry. Idempotent — skips if id already exists.
 */
export function registerCR(rootDir: string, entry: RegistryEntry): void {
  const reg = loadRegistry(rootDir);
  if (reg.crs.some(c => c.id === entry.id)) return;
  reg.crs.push(entry);
  saveRegistry(rootDir, reg);
}

/**
 * Remove a CR entry from the registry by id.
 */
export function unregisterCR(rootDir: string, crId: string): void {
  const reg = loadRegistry(rootDir);
  reg.crs = reg.crs.filter(c => c.id !== crId);
  saveRegistry(rootDir, reg);
}

// ── Worktree detection ──────────────────────────────────────────────────────

/**
 * Check if cwd is inside a git worktree (as opposed to the main repo).
 * Worktrees have a .git *file* (not directory) pointing to the main repo.
 */
export function isWorktree(cwd: string): boolean {
  const gitPath = path.join(cwd, '.git');
  if (!existsSync(gitPath)) return false;
  try {
    return lstatSync(gitPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Find the root repo path from a worktree.
 * Reads the .git file's `gitdir:` pointer and walks up to the repo root.
 * Returns cwd itself if it's already the root repo.
 * Returns null if detection fails.
 */
export function findRootRepo(cwd: string): string | null {
  const gitPath = path.join(cwd, '.git');
  if (!existsSync(gitPath)) return null;

  try {
    const stat = lstatSync(gitPath);

    // Regular .git directory — this IS the root repo
    if (stat.isDirectory()) return cwd;

    // .git file — parse gitdir pointer
    // Format: "gitdir: /path/to/root/.git/worktrees/CR-2026-001"
    const content = readFileSync(gitPath, 'utf-8').trim();
    const match = content.match(/^gitdir:\s*(.+)/);
    if (!match?.[1]) return null;

    const gitdir = match[1];
    const worktreesIdx = gitdir.indexOf('/.git/worktrees/');
    if (worktreesIdx >= 0) {
      return gitdir.slice(0, worktreesIdx);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Auto-detect worktrees by scanning .claude/worktrees/ in the root repo.
 * Returns entries with worktree path and state loaded from each.
 * Falls back to registry.json if the directory doesn't exist.
 */
export function discoverWorktrees(rootDir: string): Array<{
  path: string;
  name: string;
  state: ForgeState;
}> {
  const worktreesDir = path.join(rootDir, '.claude', 'worktrees');
  if (!existsSync(worktreesDir)) return [];

  const results: Array<{ path: string; name: string; state: ForgeState }> = [];

  try {
    const entries = readdirSync(worktreesDir) as string[];
    for (const entry of entries) {
      const wtPath = path.join(worktreesDir, entry);
      try {
        if (!lstatSync(wtPath).isDirectory()) continue;
      } catch {
        continue;
      }
      const forgeDir = path.join(wtPath, '.forge');
      const state = loadState(forgeDir);
      results.push({ path: wtPath, name: entry, state });
    }
  } catch {
    // Can't read directory — return empty
  }

  return results;
}

// ── BUILD.lock ──────────────────────────────────────────────────────────────

export interface LockResult {
  acquired: boolean;
  existingPid?: number;
}

/**
 * Attempt to acquire a build lock. Returns { acquired: true } on success.
 * If another process holds the lock and is still running, returns
 * { acquired: false, existingPid }. Stale locks (dead PID) are cleaned up.
 */
export function acquireBuildLock(stateDir: string): LockResult {
  mkdirSync(stateDir, { recursive: true });
  const lockPath = path.join(stateDir, 'BUILD.lock');

  if (existsSync(lockPath)) {
    try {
      const pid = parseInt(readFileSync(lockPath, 'utf-8').trim(), 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0); // signal 0 = existence check, doesn't kill
          return { acquired: false, existingPid: pid };
        } catch {
          // Process not running — stale lock, fall through to acquire
        }
      }
    } catch {
      // Corrupt lock file — fall through to overwrite
    }
  }

  writeFileSync(lockPath, String(process.pid));
  return { acquired: true };
}

/**
 * Release the build lock.
 */
export function releaseBuildLock(stateDir: string): void {
  try {
    unlinkSync(path.join(stateDir, 'BUILD.lock'));
  } catch {
    // Already gone or never created
  }
}

// ── Migration from current.md ───────────────────────────────────────────────

/**
 * Attempt to extract state from the old .forge/state/current.md format.
 * Returns a ForgeState if the file exists and is parseable, null otherwise.
 * Does NOT write anything — caller decides whether to persist.
 */
export function migrateFromCurrentMd(forgeDir: string): ForgeState | null {
  const currentMdPath = path.join(forgeDir, 'state', 'current.md');
  if (!existsSync(currentMdPath)) return null;

  try {
    const content = readFileSync(currentMdPath, 'utf-8');
    const state = createEmptyState();

    const phaseMatch = content.match(/\*\*Phase\*\*:\s*(.+)/);
    if (phaseMatch) state.phase = phaseMatch[1]!.trim();

    const crMatch = content.match(/\*\*Active change request\*\*:\s*(.+)/);
    if (crMatch) {
      const cr = crMatch[1]!.trim();
      state.cr_id = cr !== 'none' ? cr : null;
    }

    const updatedMatch = content.match(/\*\*Last updated\*\*:\s*(.+)/);
    if (updatedMatch) state.updated_at = updatedMatch[1]!.trim();

    // Extract completed plan slugs from "- slug-name (wave N)" bullet lines
    // under a "### Completed" heading
    const completedSection = content.match(/### Completed[\s\S]*?((?:- .+\n?)+)/);
    if (completedSection?.[1]) {
      const lines = completedSection[1].split('\n');
      for (const line of lines) {
        const slugMatch = line.match(/^- (\S+)/);
        if (slugMatch?.[1]) {
          state.build.completed_plans.push(slugMatch[1]);
        }
      }
    }

    return state;
  } catch {
    return null;
  }
}
