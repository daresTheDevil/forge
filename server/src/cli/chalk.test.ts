import { describe, it, expect } from 'vitest';

describe('chalk re-export', () => {
  it('exports chalk as a named export', async () => {
    const mod = await import('./chalk.js');
    expect(mod.chalk).toBeDefined();
  });

  it('chalk is a function or callable object', async () => {
    const { chalk } = await import('./chalk.js');
    expect(typeof chalk).toBe('function');
  });

  it('chalk.red is available', async () => {
    const { chalk } = await import('./chalk.js');
    expect(typeof chalk.red).toBe('function');
  });

  it('chalk.green is available', async () => {
    const { chalk } = await import('./chalk.js');
    expect(typeof chalk.green).toBe('function');
  });

  it('chalk.yellow is available', async () => {
    const { chalk } = await import('./chalk.js');
    expect(typeof chalk.yellow).toBe('function');
  });

  it('chalk.cyan is available', async () => {
    const { chalk } = await import('./chalk.js');
    expect(typeof chalk.cyan).toBe('function');
  });

  it('chalk.bold.cyan is available (chained modifier)', async () => {
    const { chalk } = await import('./chalk.js');
    expect(typeof chalk.bold.cyan).toBe('function');
  });

  it('chalk.red returns a string when called with text', async () => {
    const { chalk } = await import('./chalk.js');
    const result = chalk.red('hello');
    expect(typeof result).toBe('string');
    expect(result).toContain('hello');
  });
});
