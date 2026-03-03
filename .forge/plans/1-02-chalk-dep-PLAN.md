---
phase: 1
plan: 02
slug: chalk-dep
type: chore
wave: 1
depends_on: []
files_modified:
  - server/package.json
  - server/src/cli/chalk.ts
autonomous: true
requirements:
  - REQ-003
  - REQ-005
must_haves:
  - "chalk is listed as a dependency in server/package.json"
  - "server/src/cli/chalk.ts re-exports chalk with a typed wrapper for the colors used by the TUI"
  - "pnpm build in server/ compiles without error after chalk is added"
  - "pnpm test in server/ still passes after chalk is added"
---

<objective>
Add `chalk` to the server package and verify the build stays clean. When complete:
- `chalk` is in `server/package.json` dependencies (not devDependencies)
- `server/src/cli/chalk.ts` provides a thin typed re-export so the TUI and display modules import from one place
- `pnpm --filter @forge/tools build` succeeds
- `pnpm --filter @forge/tools test` still passes (no regressions)
</objective>

<context>
Read these before starting:

1. `/Users/dkay/code/forge/server/package.json` — current deps; note it uses ESM (`"type": "module"`)
2. `/Users/dkay/code/forge/server/tsconfig.json` and `/Users/dkay/code/forge/tsconfig.base.json` — `module: Node16`, strict mode
3. `/Users/dkay/code/golem-cc/lib/chalk-shim.js` — reference for what chalk features are used: `chalk.red`, `chalk.green`, `chalk.yellow`, `chalk.cyan`, `chalk.blue`, `chalk.magenta`, `chalk.white`, `chalk.dim`, `chalk.bold`, combinations like `chalk.bold.cyan`, `chalk.red.bold`

Key constraints:
- Package manager is `pnpm` — use `pnpm add chalk` in the `server/` directory
- chalk v5 is ESM-only — this is correct for our ESM TypeScript setup
- Do NOT use `chalk-shim.js` from golem-cc — write a proper TypeScript ESM re-export
- Do NOT add chalk to devDependencies; it ships at runtime in the CLI entry point
- Do NOT modify the MCP server entry point (server/src/index.ts) — chalk is only used by CLI modules

Pattern to follow for chalk.ts:
```typescript
// Thin re-export so all CLI modules import from one canonical location.
// If chalk is unavailable (e.g. in test environments), provide no-op fallbacks.
export { default as chalk } from 'chalk';
```

The typecheck uses `module: Node16` which requires `.js` extensions on relative imports.
</context>

<tasks>
  <task type="auto">
    <files>server/package.json,server/src/cli/chalk.ts</files>
    <action>
Step 1 — Add chalk to server/package.json dependencies.

Run in the server directory:
```
cd /Users/dkay/code/forge/server && pnpm add chalk
```

This installs chalk v5 (ESM-only) and updates package.json and pnpm-lock.yaml.

Step 2 — Create `server/src/cli/chalk.ts`:

```typescript
// Canonical chalk re-export for all CLI modules.
// chalk v5 is ESM-only — this is correct for our ESM TypeScript package.
export { default as chalk } from 'chalk';
```

Step 3 — Verify the build compiles:
```
cd /Users/dkay/code/forge/server && pnpm build
```

If the build fails with a type error about chalk's default export, add a type declaration:
- Check that `@types/chalk` is NOT needed (chalk v5 ships its own types)
- If tsc complains about `esModuleInterop` with `export { default }`, try:
  ```typescript
  import chalk from 'chalk';
  export { chalk };
  ```

Step 4 — Verify tests still pass:
```
cd /Users/dkay/code/forge/server && pnpm test
```

Step 5 — Run typecheck:
```
cd /Users/dkay/code/forge/server && pnpm typecheck
```

If typecheck fails with chalk import errors:
- Check tsconfig `moduleResolution: Node16` is compatible with chalk v5's exports field
- chalk v5 ships types at `chalk/index.d.ts` and uses `exports` in package.json
- If needed, verify `skipLibCheck: true` is set (it is in tsconfig.base.json)
    </action>
    <verify>cd /Users/dkay/code/forge/server && pnpm build && pnpm test</verify>
    <done>server/package.json contains chalk in dependencies, pnpm build exits 0, pnpm test exits 0</done>
  </task>
</tasks>

<verification>cd /Users/dkay/code/forge/server && pnpm build && pnpm test && node -e "import('/Users/dkay/code/forge/server/dist/cli/chalk.js').then(m => console.log('chalk ok:', typeof m.chalk))"</verification>
<success_criteria>
[REQ-003]: chalk is available for the TUI module (wave 2) to use for colored header rendering.
[REQ-005]: chalk is available for the display module (wave 2) to render color-coded tool call labels.
</success_criteria>
