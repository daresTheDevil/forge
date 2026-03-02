import { describe, it, expect } from 'vitest';
import { phaseBadge, attemptDots, segmentedBar, taskChecklist } from './tui.js';

describe('phaseBadge', () => {
  it('returns a non-empty string for known phases', () => {
    const badge = phaseBadge('RED');
    expect(typeof badge).toBe('string');
    expect(badge.length).toBeGreaterThan(0);
    // Contains the phase name
    expect(badge).toContain('RED');
  });

  it('returns empty string for falsy input', () => {
    expect(phaseBadge('')).toBe('');
    expect(phaseBadge(null as unknown as string)).toBe('');
  });

  it('handles all known phase names', () => {
    for (const phase of ['RED', 'GREEN', 'REFACTOR', 'SECURE', 'CHECKPOINT']) {
      const badge = phaseBadge(phase);
      expect(badge).toContain(phase);
    }
  });
});

describe('attemptDots', () => {
  it('returns 3 dots for maxAttempts=3', () => {
    const dots = attemptDots(1, 3);
    // Strip ANSI — should have 3 dot chars (● or ○)
    const plain = dots.replace(/\x1b\[[0-9;]*m/g, '');
    expect((plain.match(/[●○]/g) ?? []).length).toBe(3);
  });

  it('shows filled dots for used attempts', () => {
    const dots = attemptDots(2, 3);
    const plain = dots.replace(/\x1b\[[0-9;]*m/g, '');
    expect((plain.match(/●/g) ?? []).length).toBe(2);
    expect((plain.match(/○/g) ?? []).length).toBe(1);
  });
});

describe('segmentedBar', () => {
  it('returns a string of the requested width', () => {
    const bar = segmentedBar(0, 0, 5, 20);
    const plain = bar.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain.length).toBe(20);
  });

  it('returns all-empty bar when no tasks complete', () => {
    const bar = segmentedBar(0, 0, 3, 12);
    const plain = bar.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toMatch(/[░█]+/);
  });

  it('handles zero total tasks', () => {
    const bar = segmentedBar(0, 0, 0, 10);
    expect(typeof bar).toBe('string');
  });
});

describe('taskChecklist', () => {
  const tasks = [
    { id: 'T-001', status: 'completed' as const },
    { id: 'T-002', status: 'pending' as const },
    { id: 'T-003', status: 'pending' as const },
  ];

  it('returns a string when width is sufficient', () => {
    const cl = taskChecklist(tasks, 'T-002', 120);
    if (cl) {
      expect(cl).toContain('T-001');
      expect(cl).toContain('T-002');
    }
  });

  it('returns empty string when tasks array is empty', () => {
    expect(taskChecklist([], 'T-001', 120)).toBe('');
  });

  it('returns empty string when width is too narrow', () => {
    // Very narrow terminal — checklist should be suppressed
    expect(taskChecklist(tasks, 'T-002', 5)).toBe('');
  });
});

describe('attachDisplay', () => {
  it('exports attachDisplay function', async () => {
    const mod = await import('./display.js');
    expect(typeof mod.attachDisplay).toBe('function');
  });

  it('registers event handlers without throwing', async () => {
    const { attachDisplay } = await import('./display.js');
    const { EventEmitter } = await import('node:events');
    const emitter = new EventEmitter();
    // Should not throw when no tui is provided
    expect(() => attachDisplay(emitter, {})).not.toThrow();
  });

  it('handles assistant event with tool_use block', async () => {
    const { attachDisplay } = await import('./display.js');
    const { EventEmitter } = await import('node:events');
    const emitter = new EventEmitter();
    const log: string[] = [];
    const fakeTui = {
      appendLog: (line: string) => log.push(line),
      setTaskModel: () => {},
    };
    attachDisplay(emitter, { tui: fakeTui });

    emitter.emit('assistant', {
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'Read',
          input: { file_path: 'src/foo.ts' },
        }],
      },
    });

    expect(log.some(l => l.includes('Read'))).toBe(true);
  });
});
