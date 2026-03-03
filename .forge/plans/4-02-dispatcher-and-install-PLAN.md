---
phase: 4
plan: 02
slug: dispatcher-and-install
type: feature
wave: 4
depends_on:
  - cli-entry
files_modified:
  - install.sh
autonomous: true
requirements:
  - REQ-001
  - REQ-007
must_haves:
  - "The forge dispatcher at ~/.local/bin/forge routes 'forge build' to node server/dist/cli/index.js build"
  - "The forge dispatcher routes 'forge improve [args...]' to node server/dist/cli/index.js improve [args...]"
  - "Existing dispatcher commands (update, uninstall) are preserved unchanged"
  - "install.sh generates the updated dispatcher with build and improve routing"
  - "Running 'forge build' from any directory (outside Claude Code) invokes the CLI entry point"
  - "Running 'forge improve src/foo.ts' from any directory invokes the CLI entry point"
  - "The dispatcher passes all remaining args to the CLI entry point"
---

<objective>
Wire the `forge build` and `forge improve` subcommands into the dispatcher script that
`install.sh` writes to `~/.local/bin/forge`. When complete:
- `install.sh` generates a dispatcher with `build` and `improve` cases that invoke
  `node $FORGE_DIR/server/dist/cli/index.js <subcommand> [args...]`
- Running `forge build` from a project directory outside Claude Code starts the build loop
- Running `forge improve src/foo.ts` runs the improve loop on that file
- All previously supported dispatcher commands (update, uninstall) still work
- The dispatcher correctly passes remaining args (e.g. file paths for `forge improve`)
</objective>

<context>
Read these before starting:

1. `/Users/dkay/code/forge/install.sh` — the current installer; focus on the "Install forge dispatcher"
   section (around line 187). This is the section that writes the `~/.local/bin/forge` script.
   You will modify only the heredoc that generates the dispatcher script.
2. `/Users/dkay/code/forge/server/src/cli/index.ts` (from plan 4-01) — the CLI entry point.
   It is invoked as: `node $FORGE_DIR/server/dist/cli/index.js <command> [args...]`
3. `/Users/dkay/code/cc-forge/bin/forge` — reference dispatcher (different project, for pattern
   reference only — do NOT copy its build.sh shell-script approach; forge uses the Node CLI entry)

Key decisions:
- The dispatcher must use `$FORGE_DIR/server/dist/cli/index.js` — this is the compiled output of
  `server/src/cli/index.ts` which is built during install.sh's "Building MCP tools server" step.
  The build already happens before the dispatcher is written, so the file will exist.
- Pass remaining args with `"$@"` after stripping the first arg (the subcommand)
- The node invocation must NOT use `--input-type=module` — the compiled output is already CJS/ESM
  as tsc produces it; just invoke with `node`
- Do NOT modify the MCP server case in the dispatcher — `forge-tools` MCP config is written
  separately via the `node --input-type=module` heredoc in install.sh

Dispatcher structure (the updated heredoc in install.sh):
```bash
case "${1:-}" in
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
    echo ""
    echo "Usage:"
    echo "  forge build               Run the autonomous build loop"
    echo "  forge improve [file ...]  Run the improve loop"
    echo "  forge update              Pull latest and rebuild"
    echo "  forge uninstall           Remove forge from this machine"
    echo ""
    echo "Inside Claude Code, use /forge:help to see all commands."
    ;;
esac
```

Test strategy:
- The primary test is: after running install.sh (or just writing the updated dispatcher manually),
  run `forge build` in a directory with no plans and confirm it exits with a useful error message
- Write a shell-based verify command that checks the dispatcher file contains 'build' and 'improve'
- The dispatcher is a bash script — no TypeScript test needed for this plan

Do NOT:
- Modify the MCP server configuration section of install.sh
- Change the `pnpm install` or `pnpm build` steps in install.sh
- Remove the update or uninstall cases from the dispatcher
- Add a dependency on node being in a specific PATH — use the same `node` that is already required
  by install.sh's prerequisite check
</context>

<tasks>
  <task type="auto">
    <files>install.sh</files>
    <action>
Step 1 — Read the current dispatcher section in install.sh.

Read `/Users/dkay/code/forge/install.sh` and locate the heredoc that writes the dispatcher
to `$FORGE_BIN`. It starts at approximately:

```bash
cat > "$FORGE_BIN" <<SHEOF
#!/usr/bin/env bash
# forge — dispatcher for forge commands
```

Step 2 — Update the dispatcher heredoc.

Replace the existing dispatcher heredoc with the updated version that adds `build` and `improve`
routing. The updated heredoc (inside the `cat > "$FORGE_BIN" <<SHEOF` block) should be:

```bash
#!/usr/bin/env bash
# forge — dispatcher for forge commands
# Installed from: $FORGE_DIR
FORGE_DIR="$FORGE_DIR"

case "\${1:-}" in
  build)
    shift
    exec node "\$FORGE_DIR/server/dist/cli/index.js" build "\$@"
    ;;
  improve)
    shift
    exec node "\$FORGE_DIR/server/dist/cli/index.js" improve "\$@"
    ;;
  update)    exec "\$FORGE_DIR/update.sh" ;;
  uninstall) exec "\$FORGE_DIR/uninstall.sh" ;;
  *)
    echo "forge — AI development workflow"
    echo ""
    echo "Usage:"
    echo "  forge build               Run the autonomous build loop"
    echo "  forge improve [file ...]  Run the improve loop"
    echo "  forge update              Pull latest and rebuild"
    echo "  forge uninstall           Remove forge from this machine"
    echo ""
    echo "Inside Claude Code, use /forge:help to see all commands."
    ;;
esac
```

IMPORTANT: The `<<SHEOF` heredoc uses an unquoted delimiter so `$FORGE_DIR` on the
`FORGE_DIR="$FORGE_DIR"` line is correctly interpolated at install time (baking the path).
All other variables (`\${1:-}`, `\$FORGE_DIR`, `\$@`) MUST use backslash escapes so they
are written literally and evaluated at runtime when the dispatcher runs. This matches the
existing pattern in lines 197-209 of the current install.sh.

Use the Edit tool to replace only the dispatcher heredoc body — from the line after
`cat > "$FORGE_BIN" <<SHEOF` up to (and including) the closing `SHEOF`.

Step 3 — Update the success message after the dispatcher install.

The current line:
```bash
success "forge command installed → $FORGE_BIN"
```

Update the usage section displayed in the info lines to mention build and improve:
```bash
success "forge command installed → $FORGE_BIN"
info "  forge build     → runs the autonomous build loop"
info "  forge improve   → runs the improve loop"
info "  forge update    → pull latest and rebuild"
info "  forge uninstall → remove forge from this machine"
```

Step 4 — Verify the dispatcher script is syntactically valid bash:
```
bash -n /Users/dkay/code/forge/install.sh
```
Should exit 0 (syntax check only — does not run the installer).

Step 5 — Verify the dispatcher text contains the new routing:
```
grep -q "cli/index.js" /Users/dkay/code/forge/install.sh && echo "routing present"
```

Step 6 — Manually write the updated dispatcher to a temp file and test it:
```bash
FORGE_DIR="/Users/dkay/code/forge"
TEMP_DISPATCHER="$(mktemp)"
cat > "$TEMP_DISPATCHER" <<SHEOF
#!/usr/bin/env bash
FORGE_DIR="$FORGE_DIR"
case "\${1:-}" in
  build)
    shift
    exec node "\$FORGE_DIR/server/dist/cli/index.js" build "\$@"
    ;;
  improve)
    shift
    exec node "\$FORGE_DIR/server/dist/cli/index.js" improve "\$@"
    ;;
  update)    exec "\$FORGE_DIR/update.sh" ;;
  uninstall) exec "\$FORGE_DIR/uninstall.sh" ;;
  *)
    echo "forge — AI development workflow"
    ;;
esac
SHEOF
chmod +x "$TEMP_DISPATCHER"
"$TEMP_DISPATCHER" 2>&1 | grep -q "forge" && echo "dispatcher smoke test passed"
rm "$TEMP_DISPATCHER"
```
    </action>
    <verify>bash -n /Users/dkay/code/forge/install.sh && grep -q "cli/index.js" /Users/dkay/code/forge/install.sh && echo "install.sh valid and contains CLI routing"</verify>
    <done>install.sh passes bash -n syntax check AND contains 'cli/index.js' routing for build and improve</done>
  </task>
</tasks>

<verification>bash -n /Users/dkay/code/forge/install.sh && grep -c "cli/index.js" /Users/dkay/code/forge/install.sh | grep -qv "^0$" && echo "Dispatcher routing verified"</verification>
<success_criteria>
[REQ-001]: `forge build` (dispatched via ~/.local/bin/forge → node server/dist/cli/index.js build) invokes runBuild() in the current project directory. Missing plans dir produces a clear error from runBuild(). No autonomous tasks produces a clear message.
[REQ-007]: `forge improve [files...]` (dispatched via ~/.local/bin/forge → node server/dist/cli/index.js improve [files...]) invokes runImproveCommand() with the remaining args as scope. `forge improve` with no args reads last-build.json.
</success_criteria>
