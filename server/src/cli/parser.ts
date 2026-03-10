import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PlanFrontmatterSchema, type PlanFrontmatter, type PlanFile, type ParsedTask } from './types.js';

// ── Frontmatter parsing ──────────────────────────────────────────────────────

/**
 * Hand-rolled YAML frontmatter parser for simple key: value pairs.
 * Supports: scalars, booleans, numbers, and simple block lists (  - item).
 * Does NOT support nested objects — plan frontmatter never needs them.
 */
export function parseFrontmatter(markdown: string): PlanFrontmatter {
  const fmMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch || !fmMatch[1]) {
    throw new Error('No valid YAML frontmatter found');
  }

  const raw: Record<string, unknown> = {};
  const lines = fmMatch[1].split('\n');
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of lines) {
    const listItem = line.match(/^[ \t]+-\s+(.*)/);
    if (listItem && currentKey && currentList) {
      currentList.push(listItem[1]!.trim());
      continue;
    }

    const keyVal = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);
    if (!keyVal) continue;

    // Flush previous list
    if (currentKey && currentList) {
      raw[currentKey] = currentList;
    }

    const [, key, value] = keyVal;
    currentKey = key!;
    const v = value!.trim();

    if (v === '' || v === '[]') {
      currentList = [];
      if (v === '[]') { raw[currentKey] = []; currentKey = null; currentList = null; }
    } else if (v === 'true') {
      raw[currentKey] = true; currentList = null; currentKey = null;
    } else if (v === 'false') {
      raw[currentKey] = false; currentList = null; currentKey = null;
    } else if (/^\d+$/.test(v)) {
      raw[currentKey] = parseInt(v, 10); currentList = null; currentKey = null;
    } else {
      raw[currentKey] = v; currentList = null; currentKey = null;
    }
  }

  // Flush any trailing list
  if (currentKey && currentList) {
    raw[currentKey] = currentList;
  }

  return PlanFrontmatterSchema.parse(raw);
}

// ── XML task extraction ──────────────────────────────────────────────────────

function extractBetweenTags(content: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return content.match(re)?.[1]?.trim() ?? '';
}

function extractContext(body: string): string {
  return extractBetweenTags(body, 'context');
}

/**
 * Extract the Nth <task> block (0-indexed) from plan markdown body.
 * Returns null if no task at that index exists.
 */
export function extractTask(markdown: string, index: number): ParsedTask | null {
  const bodyStart = markdown.indexOf('\n---\n');
  const body = bodyStart >= 0 ? markdown.slice(bodyStart + 5) : markdown;

  const context = extractContext(body);

  // Extract all <task> blocks
  const taskRe = /<task([^>]*)>([\s\S]*?)<\/task>/gi;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = taskRe.exec(body)) !== null) {
    if (i === index) {
      const attrs = match[1] ?? '';
      const inner = match[2] ?? '';
      const typeMatch = attrs.match(/type="([^"]+)"/);
      const taskType = typeMatch?.[1] ?? 'auto';

      const filesRaw = extractBetweenTags(inner, 'files');
      const files = filesRaw
        ? filesRaw.split(',').map(f => f.trim()).filter(Boolean)
        : [];

      return {
        index,
        type: taskType,
        files,
        action: extractBetweenTags(inner, 'action'),
        verify: extractBetweenTags(inner, 'verify'),
        done: extractBetweenTags(inner, 'done'),
        context,
      };
    }
    i++;
  }

  return null;
}

// ── Plan file loading ────────────────────────────────────────────────────────

function parsePlanNumber(filename: string): number {
  // e.g. "1-02-slug-PLAN.md" → wave 1, plan 02 → sort key 1002
  const m = filename.match(/^(\d+)-(\d+)-/);
  if (!m) return 9999;
  return parseInt(m[1]!, 10) * 1000 + parseInt(m[2]!, 10);
}

export interface SkippedFile {
  filename: string;
  reason: string;
}

export interface PlanParseResult {
  plans: PlanFile[];
  skipped: SkippedFile[];
}

/**
 * Load and parse all *-PLAN.md files from a directory.
 * Returns plans sorted by wave then plan number, plus a list of skipped files
 * with human-readable reasons (wrong filename, bad frontmatter, no tasks).
 * Returns empty result if the directory does not exist.
 */
export function parsePlanFiles(plansDir: string): PlanParseResult {
  if (!existsSync(plansDir)) return { plans: [], skipped: [] };

  let allFiles: string[];
  try {
    allFiles = readdirSync(plansDir).filter(f => f.endsWith('.md'));
  } catch {
    return { plans: [], skipped: [] };
  }

  const skipped: SkippedFile[] = [];
  const validFilenames = allFiles.filter(f => {
    if (f === 'MANIFEST.md' || f.startsWith('_')) return false;
    if (!f.endsWith('-PLAN.md')) {
      skipped.push({ filename: f, reason: 'filename does not end in -PLAN.md' });
      return false;
    }
    return true;
  });

  validFilenames.sort((a, b) => parsePlanNumber(a) - parsePlanNumber(b));

  const plans: PlanFile[] = [];

  for (const filename of validFilenames) {
    const filePath = path.join(plansDir, filename);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (e) {
      skipped.push({ filename, reason: `could not read file: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    let frontmatter: PlanFrontmatter;
    try {
      frontmatter = parseFrontmatter(content);
    } catch (e) {
      skipped.push({ filename, reason: `frontmatter parse error: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    // Extract body (after frontmatter)
    const bodyStart = content.indexOf('\n---\n');
    const body = bodyStart >= 0 ? content.slice(bodyStart + 5) : content;

    // Extract all tasks
    const tasks: ParsedTask[] = [];
    let taskIndex = 0;
    let task = extractTask(content, taskIndex);
    while (task !== null) {
      tasks.push(task);
      taskIndex++;
      task = extractTask(content, taskIndex);
    }

    if (tasks.length === 0) {
      skipped.push({ filename, reason: 'no <task> blocks found in file body' });
      continue;
    }

    plans.push({ filePath, frontmatter, body, tasks });
  }

  return { plans, skipped };
}
