import { describe, it, expect } from 'vitest';
import { parseFrontmatter, parsePlanFiles, extractTask } from './parser.js';
import { PlanFrontmatterSchema } from './types.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const md = `---
phase: 1
plan: 01
slug: my-slug
type: feature
wave: 1
depends_on: []
files_modified:
  - server/src/foo.ts
autonomous: true
requirements:
  - REQ-001
must_haves:
  - "some thing"
---

# Content here
`;
    const result = parseFrontmatter(md);
    expect(result.slug).toBe('my-slug');
    expect(result.wave).toBe(1);
    expect(result.autonomous).toBe(true);
    expect(result.files_modified).toEqual(['server/src/foo.ts']);
  });

  it('throws on missing required fields', () => {
    const md = `---
slug: only-slug
---
# body
`;
    expect(() => parseFrontmatter(md)).toThrow();
  });

  it('returns autonomous: false when set', () => {
    const md = `---
phase: 2
plan: 02
slug: manual-task
type: feature
wave: 2
depends_on: []
files_modified: []
autonomous: false
requirements: []
must_haves: []
---
`;
    const result = parseFrontmatter(md);
    expect(result.autonomous).toBe(false);
  });
});

describe('parsePlanFiles', () => {
  it('returns empty array when plans dir does not exist', () => {
    const plans = parsePlanFiles('/nonexistent/path');
    expect(plans).toEqual([]);
  });

  it('sorts by wave then plan number', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
    const plan1 = `---
phase: 1
plan: 02
slug: second
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
must_haves: []
---
<tasks><task type="auto"><files>foo.ts</files><action>do it</action><verify>true</verify><done>done</done></task></tasks>
`;
    const plan2 = `---
phase: 1
plan: 01
slug: first
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
must_haves: []
---
<tasks><task type="auto"><files>bar.ts</files><action>do it</action><verify>true</verify><done>done</done></task></tasks>
`;
    fs.writeFileSync(path.join(tmpDir, '1-02-second-PLAN.md'), plan1);
    fs.writeFileSync(path.join(tmpDir, '1-01-first-PLAN.md'), plan2);
    const result = parsePlanFiles(tmpDir);
    expect(result[0]?.frontmatter.slug).toBe('first');
    expect(result[1]?.frontmatter.slug).toBe('second');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('skips non-PLAN.md files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-test-'));
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# ignore me');
    const result = parsePlanFiles(tmpDir);
    expect(result).toEqual([]);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('extractTask', () => {
  it('extracts a single task block with context', () => {
    const content = `---
phase: 1
plan: 01
slug: my-plan
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
must_haves: []
---

<context>
Read the docs.
</context>

<tasks>
  <task type="auto">
    <files>src/foo.ts</files>
    <action>
Do the thing.
    </action>
    <verify>pnpm test</verify>
    <done>Tests pass</done>
  </task>
</tasks>
`;
    const task = extractTask(content, 0);
    expect(task).not.toBeNull();
    expect(task?.action).toContain('Do the thing');
    expect(task?.verify).toBe('pnpm test');
    expect(task?.files).toEqual(['src/foo.ts']);
    expect(task?.context).toContain('Read the docs');
  });

  it('returns null for out-of-range index', () => {
    const content = `---
phase: 1
plan: 01
slug: x
type: feature
wave: 1
depends_on: []
files_modified: []
autonomous: true
requirements: []
must_haves: []
---
<tasks><task type="auto"><files>a.ts</files><action>x</action><verify>true</verify><done>d</done></task></tasks>
`;
    expect(extractTask(content, 5)).toBeNull();
  });
});
