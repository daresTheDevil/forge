import { chalk } from './chalk.js';

const ESC = '\x1b';
const write = (s: string) => process.stdout.write(s);

// ANSI helpers
const altScreenOn = () => write(`${ESC}[?1049h`);
const altScreenOff = () => write(`${ESC}[?1049l`);
const mouseOn = () => write(`${ESC}[?1000h${ESC}[?1006h`);
const mouseOff = () => write(`${ESC}[?1000l${ESC}[?1006l`);
const cursorHide = () => write(`${ESC}[?25l`);
const cursorShow = () => write(`${ESC}[?25h`);
const moveTo = (row: number, col = 1) => write(`${ESC}[${row};${col}H`);
const clearLine = () => write(`${ESC}[K`);
const setScrollRegion = (top: number, bottom: number) => write(`${ESC}[${top};${bottom}r`);
const resetScrollRegion = () => write(`${ESC}[r`);
const saveCursor = () => write(`${ESC}7`);
const restoreCursor = () => write(`${ESC}8`);

export const HEADER_LINES = 6;

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskItem {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'blocked' | 'skipped';
}

export interface Tui {
  init(taskData: {
    taskId: string;
    taskTitle: string;
    stage: string;
    done: number;
    total: number;
    tasks?: TaskItem[];
  }): void;
  updateTask(data: Partial<{
    taskId: string;
    taskTitle: string;
    stage: string;
    done: number;
    total: number;
    attempt: number;
    maxAttempts: number;
    tasks: TaskItem[];
  }>): void;
  appendLog(line: string): void;
  destroy(): void;
}

// ─── Phase helpers (pure, exported for testing) ───────────────────────────────

const PHASE_COLORS: Record<string, (s: string) => string> = {
  RED: chalk.red,
  GREEN: chalk.green,
  REFACTOR: chalk.cyan,
  SECURE: chalk.yellow,
  CHECKPOINT: chalk.dim,
};

function phaseColor(stage: string): (s: string) => string {
  return PHASE_COLORS[(stage ?? '').toUpperCase()] ?? chalk.dim;
}

/** Returns a colored [PHASE] badge, or '' when stage is falsy. */
export function phaseBadge(stage: string): string {
  if (!stage) return '';
  return phaseColor(stage)(`[${stage.toUpperCase()}]`);
}

/** Dot chars colored by attempt count: ● = used, ○ = unused. */
export function attemptDots(attempt: number, maxAttempts: number): string {
  const colorFn =
    attempt >= 3 ? chalk.red : attempt === 2 ? chalk.yellow : chalk.green;
  return Array.from({ length: maxAttempts }, (_, i) =>
    colorFn(i < attempt ? '●' : '○'),
  ).join(' ');
}

/**
 * Phase-level segmented progress bar.
 * phaseIndex: 0=RED 1=GREEN 2=REFACTOR 3=SECURE
 */
export function segmentedBar(
  completedTasks: number,
  currentPhaseIndex: number,
  totalTasks: number,
  width: number,
): string {
  if (totalTasks === 0) return '░'.repeat(width);

  const phaseColors = [chalk.red, chalk.green, chalk.cyan, chalk.yellow];
  const totalSegments = totalTasks * 4;

  // Fallback: not enough width for 4 segments per task → one char per task section
  if (totalSegments > width) {
    const taskWidth = Math.max(1, Math.floor(width / totalTasks));
    const chars: string[] = [];
    for (let t = 0; t < totalTasks; t++) {
      const ch =
        t < completedTasks
          ? chalk.green('█')
          : t === completedTasks
          ? (phaseColors[currentPhaseIndex] ?? chalk.green)('█')
          : '░';
      for (let c = 0; c < taskWidth && chars.length < width; c++) {
        chars.push(ch);
      }
    }
    while (chars.length < width) chars.push('░');
    return chars.join('');
  }

  // Normal: char-by-char, charsPerSegment may be fractional
  const charsPerSegment = width / totalSegments;
  let result = '';
  for (let i = 0; i < width; i++) {
    const segmentIndex = Math.floor(i / charsPerSegment);
    const taskIndex = Math.floor(segmentIndex / 4);
    const phaseIndex = segmentIndex % 4;

    if (taskIndex < completedTasks) {
      result += chalk.green('█');
    } else if (taskIndex === completedTasks) {
      if (phaseIndex <= currentPhaseIndex) {
        result += (phaseColors[phaseIndex] ?? chalk.green)('█');
      } else {
        result += '░';
      }
    } else {
      result += '░';
    }
  }
  return result;
}

/** Compact task checklist: ✓ TASK-001  ▶ TASK-002  · TASK-003 */
export function taskChecklist(
  tasks: TaskItem[],
  currentTaskId: string,
  maxWidth: number,
): string {
  if (!tasks || tasks.length === 0) return '';
  const items = tasks.map((t) => {
    const isDone = t.status === 'completed';
    const isCurrent = t.id === currentTaskId && !isDone;
    const symbol = isDone
      ? chalk.green('✓')
      : isCurrent
      ? chalk.cyan('▶')
      : chalk.dim('·');
    const label = isDone
      ? chalk.dim(t.id)
      : isCurrent
      ? chalk.white(t.id)
      : chalk.dim(t.id);
    return `${symbol} ${label}`;
  });
  const line = ' ' + items.join('  ');
  return stripAnsi(line).length > maxWidth ? '' : line;
}

// ─── Phase name → segmentedBar phase index ───────────────────────────────────
const PHASE_INDEX: Record<string, number> = {
  RED: 0,
  GREEN: 1,
  REFACTOR: 2,
  SECURE: 3,
  CHECKPOINT: 3,
};

// ─── Word wrap ────────────────────────────────────────────────────────────────

function wordWrap(str: string, maxWidth: number, indent = 0): string[] {
  if (maxWidth <= 0) return [str];
  const visible = stripAnsi(str);
  if (visible.length <= maxWidth) return [str];

  const lines: string[] = [];
  let visPos = 0;
  let strPos = 0;
  let lineStart = 0;
  let lineVisStart = 0;
  let lastSpaceVis = -1;
  let lastSpaceStr = -1;
  const prefix = ' '.repeat(indent);

  while (strPos < str.length) {
    // Skip ANSI sequences
    const ansiMatch = str.slice(strPos).match(/^\x1b\[[0-9;]*m/);
    if (ansiMatch) {
      strPos += ansiMatch[0].length;
      continue;
    }

    if (str[strPos] === ' ') {
      lastSpaceVis = visPos;
      lastSpaceStr = strPos;
    }

    visPos++;
    strPos++;

    const lineWidth = lines.length === 0 ? maxWidth : maxWidth - indent;
    if (visPos - lineVisStart >= lineWidth) {
      if (lastSpaceStr > lineStart) {
        lines.push(str.slice(lineStart, lastSpaceStr));
        lineStart = lastSpaceStr + 1;
        lineVisStart = lastSpaceVis + 1;
      } else {
        lines.push(str.slice(lineStart, strPos));
        lineStart = strPos;
        lineVisStart = visPos;
      }
      lastSpaceVis = -1;
      lastSpaceStr = -1;
    }
  }

  if (lineStart < str.length) {
    lines.push(str.slice(lineStart));
  }

  return lines.map((l, i) => (i === 0 ? l : prefix + l));
}

// ─── createTui ────────────────────────────────────────────────────────────────

export function createTui(): Tui {
  let rows = process.stdout.rows ?? 24;
  let cols = process.stdout.columns ?? 80;
  let timer: ReturnType<typeof setInterval> | null = null;
  let startTime = Date.now();
  let destroyed = false;
  let resizeHandler: (() => void) | null = null;
  let stdinDataHandler: ((data: Buffer) => void) | null = null;

  // State for header
  const state = {
    taskId: '',
    taskTitle: '',
    stage: '',
    done: 0,
    total: 0,
    attempt: 0,
    maxAttempts: 0,
    tasks: [] as TaskItem[],
  };

  function formatElapsed(): string {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }

  function drawHeader(): void {
    if (destroyed) return;
    saveCursor();

    const currentPhaseIndex = PHASE_INDEX[(state.stage ?? '').toUpperCase()] ?? 0;
    const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
    const barWidth = Math.min(20, Math.max(4, cols - 40));

    // Line 1: FORGE BUILD + segmentedBar + N/total (pct%)
    moveTo(1);
    clearLine();
    write(
      ` ${chalk.bold.cyan('FORGE BUILD')}  ${segmentedBar(
        state.done,
        currentPhaseIndex,
        state.total,
        barWidth,
      )}  ${state.done}/${state.total} (${pct}%)`,
    );

    // Line 2: [BADGE] taskLabel (truncated) | attemptDots + timer
    moveTo(2);
    clearLine();
    const badge = phaseBadge(state.stage);
    const badgeVisLen = stripAnsi(badge).length;
    const elapsed = formatElapsed();
    const showAttempt = state.maxAttempts > 1 || state.attempt > 1;
    const dotsStr = showAttempt ? attemptDots(state.attempt, state.maxAttempts) : '';
    const dotsVisLen = showAttempt ? stripAnsi(dotsStr).length : 0;
    const rightLen = (showAttempt ? dotsVisLen + 2 : 0) + 2 + elapsed.length;
    const taskLabel = state.taskId
      ? `Task ${state.taskId}: ${state.taskTitle}`
      : '';
    const prefixLen = 1 + badgeVisLen + (badge ? 1 : 0);
    const maxTitleWidth = Math.max(10, cols - prefixLen - rightLen - 2);
    const truncTitle = taskLabel.slice(0, maxTitleWidth);
    const gap = Math.max(1, cols - prefixLen - truncTitle.length - rightLen);
    const rightSide =
      (showAttempt ? dotsStr + '  ' : '') +
      chalk.dim('⏱') +
      ' ' +
      chalk.yellow(elapsed);
    write(
      ` ${badge}${badge ? ' ' : ''}${chalk.white(truncTitle)}${' '.repeat(gap)}${rightSide}`,
    );

    // Line 3: separator
    moveTo(3);
    clearLine();

    // Line 4: separator
    moveTo(4);
    clearLine();

    // Line 5: task checklist (omitted entirely when cols < 50)
    moveTo(5);
    clearLine();
    if (cols >= 50) {
      const cl = taskChecklist(state.tasks, state.taskId, cols);
      if (cl) write(cl);
    }

    // Line 6: separator
    moveTo(HEADER_LINES);
    clearLine();
    write(chalk.dim('─'.repeat(cols)));

    restoreCursor();
  }

  function setupScrollRegion(): void {
    rows = process.stdout.rows ?? 24;
    cols = process.stdout.columns ?? 80;
    setScrollRegion(HEADER_LINES, rows);
    moveTo(rows);
  }

  const tui: Tui = {
    init(taskData) {
      startTime = Date.now();

      state.taskId = taskData.taskId ?? '';
      state.taskTitle = taskData.taskTitle ?? '';
      state.stage = taskData.stage ?? '';
      state.done = taskData.done ?? 0;
      state.total = taskData.total ?? 0;
      if (taskData.tasks) state.tasks = taskData.tasks;

      altScreenOn();
      cursorHide();
      mouseOn();

      if (process.stdin.isTTY && !process.stdin.isRaw) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        // Capture as named reference so destroy() removes only this listener
        stdinDataHandler = (data: Buffer) => {
          if (data[0] === 3) process.emit('SIGINT');
        };
        process.stdin.on('data', stdinDataHandler);
      }

      setupScrollRegion();
      drawHeader();

      timer = setInterval(() => drawHeader(), 1000);

      // Capture as named reference so destroy() removes only this listener
      resizeHandler = () => {
        setupScrollRegion();
        drawHeader();
      };
      process.stdout.on('resize', resizeHandler);
    },

    updateTask(taskData) {
      if (taskData.taskId !== undefined) state.taskId = taskData.taskId;
      if (taskData.taskTitle !== undefined) state.taskTitle = taskData.taskTitle;
      if (taskData.stage !== undefined) state.stage = taskData.stage;
      if (taskData.done !== undefined) state.done = taskData.done;
      if (taskData.total !== undefined) state.total = taskData.total;
      if (taskData.attempt !== undefined) state.attempt = taskData.attempt;
      if (taskData.maxAttempts !== undefined)
        state.maxAttempts = taskData.maxAttempts;
      if (taskData.tasks !== undefined) state.tasks = taskData.tasks;
      drawHeader();
    },

    appendLog(line) {
      if (destroyed) return;
      const maxWidth = cols - 2;
      const wrapped = wordWrap(line, maxWidth, 8);
      for (const wl of wrapped) {
        moveTo(rows);
        write('\n' + wl);
      }
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (timer) clearInterval(timer);
      // Remove only the listeners registered by this TUI instance
      if (resizeHandler) {
        process.stdout.off('resize', resizeHandler);
        resizeHandler = null;
      }
      mouseOff();
      if (process.stdin.isTTY && process.stdin.isRaw) {
        process.stdin.setRawMode(false);
        if (stdinDataHandler) {
          process.stdin.off('data', stdinDataHandler);
          stdinDataHandler = null;
        }
        process.stdin.pause();
      }
      resetScrollRegion();
      altScreenOff();
      cursorShow();
    },
  };

  return tui;
}
