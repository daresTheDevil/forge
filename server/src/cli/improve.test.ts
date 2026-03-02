import { describe, it, expect } from 'vitest';
import { buildImprovePrompt, calcDelta, resolveScope } from './improve.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

describe('buildImprovePrompt', () => {
  it('mentions the scope files in the prompt', () => {
    const prompt = buildImprovePrompt(['src/foo.ts', 'src/bar.ts'], 1, 3);
    expect(prompt).toContain('src/foo.ts');
    expect(prompt).toContain('src/bar.ts');
  });

  it('includes quality bar language', () => {
    const prompt = buildImprovePrompt(['src/foo.ts'], 1, 1);
    expect(prompt.toLowerCase()).toContain('refactor');
    expect(prompt.toLowerCase()).toContain('behavior');
  });

  it('includes iteration context', () => {
    const prompt = buildImprovePrompt(['src/foo.ts'], 2, 5);
    expect(prompt).toContain('2');
    expect(prompt).toContain('5');
  });
});

describe('calcDelta', () => {
  it('returns 0 for identical sizes', () => {
    const before = new Map([['a.ts', 100], ['b.ts', 200]]);
    const after = new Map([['a.ts', 100], ['b.ts', 200]]);
    expect(calcDelta(before, after)).toBe(0);
  });

  it('returns >0 when files changed', () => {
    const before = new Map([['a.ts', 100]]);
    const after = new Map([['a.ts', 120]]);
    expect(calcDelta(before, after)).toBeGreaterThan(0);
  });

  it('returns 0 for empty map', () => {
    expect(calcDelta(new Map(), new Map())).toBe(0);
  });

  it('handles file with zero bytes gracefully', () => {
    const before = new Map([['empty.ts', 0]]);
    const after = new Map([['empty.ts', 0]]);
    expect(calcDelta(before, after)).toBe(0);
  });
});

describe('resolveScope', () => {
  it('returns existing file paths unchanged', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-scope-'));
    const file = path.join(tmpDir, 'foo.ts');
    fs.writeFileSync(file, 'hello');
    const result = resolveScope([file]);
    expect(result).toContain(file);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('expands a directory to all .ts files within it', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-scope-'));
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'a');
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'b');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# ignore');
    const result = resolveScope([tmpDir]);
    expect(result.some(f => f.endsWith('a.ts'))).toBe(true);
    expect(result.some(f => f.endsWith('b.ts'))).toBe(true);
    expect(result.some(f => f.endsWith('README.md'))).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty array for nonexistent paths', () => {
    const result = resolveScope(['/nonexistent/path/to/file.ts']);
    expect(result).toEqual([]);
  });
});

describe('runImprove', () => {
  it('exports runImprove function', async () => {
    const mod = await import('./improve.js');
    expect(typeof mod.runImprove).toBe('function');
  });

  it('returns early with 0 iterations when scope is empty', async () => {
    const { runImprove } = await import('./improve.js');
    const result = await runImprove({
      scope: [],
      maxIterations: 10,
      threshold: 0.05,
      standalone: false,
    });
    expect(result.iterations).toBe(0);
    expect(result.filesChanged).toEqual([]);
  });
});
