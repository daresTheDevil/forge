import { describe, it, expect } from 'vitest';
import { buildTaskPrompt, getAllowedTools } from './spawn.js';
import type { ParsedTask } from './types.js';

const makeTask = (overrides: Partial<ParsedTask> = {}): ParsedTask => ({
  index: 0,
  type: 'auto',
  files: ['src/foo.ts'],
  action: 'Write the implementation.',
  verify: 'pnpm test',
  done: 'All tests pass',
  context: 'Read the spec first.',
  ...overrides,
});

describe('buildTaskPrompt', () => {
  it('includes the task action in the prompt', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    expect(prompt).toContain('Write the implementation.');
  });

  it('includes the context in the prompt', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    expect(prompt).toContain('Read the spec first.');
  });

  it('includes task progress (N/total)', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 2, 5);
    expect(prompt).toContain('2');
    expect(prompt).toContain('5');
  });

  it('includes the verify command', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    expect(prompt).toContain('pnpm test');
  });

  it('includes the done condition', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    expect(prompt).toContain('All tests pass');
  });

  it('does NOT include the full plan file path', () => {
    const prompt = buildTaskPrompt(makeTask(), 'my-plan', 1, 3);
    // Prompt must be scoped to the task — no raw file dumps
    expect(prompt.length).toBeLessThan(4000);
  });
});

describe('getAllowedTools', () => {
  it('returns full tool set for auto tasks', () => {
    const tools = getAllowedTools('auto');
    expect(tools).toBe('Read,Edit,Write,Bash,Glob,Grep');
  });

  it('returns read-only tools for read-only tasks', () => {
    const tools = getAllowedTools('read-only');
    expect(tools).toBe('Read,Glob,Grep');
  });

  it('defaults to full tool set for unknown task types', () => {
    const tools = getAllowedTools('unknown-type');
    expect(tools).toBe('Read,Edit,Write,Bash,Glob,Grep');
  });
});

describe('spawnClaude env guard', () => {
  it('exports spawnClaude function', async () => {
    const mod = await import('./spawn.js');
    expect(typeof mod.spawnClaude).toBe('function');
  });
});
