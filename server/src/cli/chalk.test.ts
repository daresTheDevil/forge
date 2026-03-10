import { describe, it, expect } from 'vitest';
import { chalk } from './chalk.js';

const CHALK_COLOR_METHODS = ['red', 'green', 'yellow', 'cyan'] as const;

describe('chalk re-export', () => {
  it('exports chalk as a named export', () => {
    expect(chalk).toBeDefined();
  });

  it('chalk is callable', () => {
    expect(typeof chalk).toBe('function');
  });

  it.each(CHALK_COLOR_METHODS)('chalk.%s is a function', (color) => {
    expect(typeof (chalk as unknown as Record<string, unknown>)[color]).toBe('function');
  });

  it('chalk.bold.cyan supports modifier chaining', () => {
    expect(typeof chalk.bold.cyan).toBe('function');
  });

  it('chalk.red produces a string containing the input', () => {
    const result = chalk.red('hello');
    expect(typeof result).toBe('string');
    expect(result).toContain('hello');
  });
});
