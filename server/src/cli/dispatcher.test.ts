import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Resolve install.sh relative to the repo root (3 levels up from server/src/cli/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const INSTALL_SH = resolve(__dirname, '../../../install.sh');

describe('install.sh dispatcher heredoc', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(INSTALL_SH, 'utf8');
  });

  it('install.sh is readable', () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it('dispatcher contains build) case', () => {
    expect(content).toContain('build)');
  });

  it('dispatcher contains improve) case', () => {
    expect(content).toContain('improve)');
  });

  it('dispatcher routes build and improve to cli/index.js', () => {
    expect(content).toContain('server/dist/cli/index.js');
  });

  it('dispatcher routes build through node with shift', () => {
    expect(content).toMatch(/build\)\s*\n\s*shift\s*\n\s*exec node.*cli\/index\.js.*build/m);
  });

  it('dispatcher routes improve through node with shift', () => {
    expect(content).toMatch(/improve\)\s*\n\s*shift\s*\n\s*exec node.*cli\/index\.js.*improve/m);
  });

  it('dispatcher preserves update) and uninstall) cases', () => {
    expect(content).toContain('update)');
    expect(content).toContain('uninstall)');
  });

  it('dispatcher has help text mentioning forge build and forge improve', () => {
    expect(content).toContain('forge build');
    expect(content).toContain('forge improve');
  });

  it('install.sh passes bash -n syntax check', () => {
    expect(() => {
      execSync(`bash -n ${INSTALL_SH}`, { stdio: 'pipe' });
    }).not.toThrow();
  });
});

describe('dispatcher smoke test (temp script)', () => {
  const tmpFile = '/tmp/forge-dispatcher-test.sh';
  const forgeDir = resolve(__dirname, '../../../');

  beforeAll(() => {
    const dispatcherContent = [
      '#!/usr/bin/env bash',
      `FORGE_DIR="${forgeDir}"`,
      'case "${1:-}" in',
      '  build)',
      '    shift',
      '    exec node "$FORGE_DIR/server/dist/cli/index.js" build "$@"',
      '    ;;',
      '  improve)',
      '    shift',
      '    exec node "$FORGE_DIR/server/dist/cli/index.js" improve "$@"',
      '    ;;',
      '  update)    exec "$FORGE_DIR/update.sh" ;;',
      '  uninstall) exec "$FORGE_DIR/uninstall.sh" ;;',
      '  *)',
      '    echo "forge — AI development workflow"',
      '    ;;',
      'esac',
    ].join('\n');
    writeFileSync(tmpFile, dispatcherContent, { mode: 0o755 });
  });

  it('temp dispatcher passes bash -n syntax check', () => {
    expect(() => {
      execSync(`bash -n ${tmpFile}`, { stdio: 'pipe' });
    }).not.toThrow();
  });

  it('temp dispatcher prints help text when called with no args', () => {
    const output = execSync(`bash ${tmpFile}`, { encoding: 'utf8' });
    expect(output).toContain('forge');
  });

  it('cleanup temp file', () => {
    unlinkSync(tmpFile);
    expect(true).toBe(true);
  });
});
