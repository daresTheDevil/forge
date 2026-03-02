import { describe, it, expect } from 'vitest';
import { parseCliArgs } from './index.js';

describe('parseCliArgs', () => {
  it('parses the build command', () => {
    const result = parseCliArgs(['build']);
    expect(result.command).toBe('build');
    expect(result.args).toEqual([]);
  });

  it('parses the improve command with no args', () => {
    const result = parseCliArgs(['improve']);
    expect(result.command).toBe('improve');
    expect(result.args).toEqual([]);
  });

  it('parses the improve command with file args', () => {
    const result = parseCliArgs(['improve', 'src/foo.ts', 'src/bar.ts']);
    expect(result.command).toBe('improve');
    expect(result.args).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('returns null command for empty args', () => {
    const result = parseCliArgs([]);
    expect(result.command).toBeNull();
  });

  it('returns unknown command for unrecognized subcommands', () => {
    const result = parseCliArgs(['deploy']);
    expect(result.command).toBe('unknown');
    expect(result.raw).toBe('deploy');
  });
});

describe('CLI module', () => {
  it('can be imported without throwing', async () => {
    // The module must not auto-execute when imported in test context
    // (it only runs when process.argv[1] matches the module file path)
    await expect(import('./index.js')).resolves.toBeDefined();
  });

  it('exports parseCliArgs', async () => {
    const mod = await import('./index.js');
    expect(typeof mod.parseCliArgs).toBe('function');
  });
});
