import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Resolve paths relative to the repo root (3 levels up from server/src/cli/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const INSTALL_SH = resolve(REPO_ROOT, 'install.sh');

const BUILD_DISPATCH_PATTERN = /build\)\s*\n\s*shift\s*\n\s*exec node.*cli\/index\.js.*build/m;
const IMPROVE_DISPATCH_PATTERN = /improve\)\s*\n\s*shift\s*\n\s*exec node.*cli\/index\.js.*improve/m;

describe('install.sh dispatcher heredoc', () => {
  let installShSource: string;

  beforeAll(() => {
    installShSource = readFileSync(INSTALL_SH, 'utf8');
  });

  it('install.sh is readable', () => {
    expect(installShSource.length).toBeGreaterThan(0);
  });

  it('dispatcher contains build) case', () => {
    expect(installShSource).toContain('build)');
  });

  it('dispatcher contains improve) case', () => {
    expect(installShSource).toContain('improve)');
  });

  it('dispatcher routes build and improve to cli/index.js', () => {
    expect(installShSource).toContain('server/dist/cli/index.js');
  });

  it('dispatcher routes build through node with shift', () => {
    expect(installShSource).toMatch(BUILD_DISPATCH_PATTERN);
  });

  it('dispatcher routes improve through node with shift', () => {
    expect(installShSource).toMatch(IMPROVE_DISPATCH_PATTERN);
  });

  it('dispatcher preserves update) and uninstall) cases', () => {
    expect(installShSource).toContain('update)');
    expect(installShSource).toContain('uninstall)');
  });

  it('dispatcher has help text mentioning forge build and forge improve', () => {
    expect(installShSource).toContain('forge build');
    expect(installShSource).toContain('forge improve');
  });

  it('install.sh passes bash -n syntax check', () => {
    expect(() => {
      execSync(`bash -n ${INSTALL_SH}`, { stdio: 'pipe' });
    }).not.toThrow();
  });
});

describe('dispatcher smoke test (temp script)', () => {
  const TEMP_DISPATCHER_PATH = '/tmp/forge-dispatcher-test.sh';

  beforeAll(() => {
    const dispatcherContent = `#!/usr/bin/env bash
FORGE_DIR="${REPO_ROOT}"
case "\${1:-}" in
  build)
    shift
    exec node "$FORGE_DIR/server/dist/cli/index.js" build "$@"
    ;;
  improve)
    shift
    exec node "$FORGE_DIR/server/dist/cli/index.js" improve "$@"
    ;;
  update)    exec "$FORGE_DIR/update.sh" ;;
  uninstall) exec "$FORGE_DIR/uninstall.sh" ;;
  *)
    echo "forge — AI development workflow"
    ;;
esac`;
    writeFileSync(TEMP_DISPATCHER_PATH, dispatcherContent, { mode: 0o755 });
  });

  afterAll(() => {
    unlinkSync(TEMP_DISPATCHER_PATH);
  });

  it('temp dispatcher passes bash -n syntax check', () => {
    expect(() => {
      execSync(`bash -n ${TEMP_DISPATCHER_PATH}`, { stdio: 'pipe' });
    }).not.toThrow();
  });

  it('temp dispatcher prints help text when called with no args', () => {
    const output = execSync(`bash ${TEMP_DISPATCHER_PATH}`, { encoding: 'utf8' });
    expect(output).toContain('forge');
  });
});
