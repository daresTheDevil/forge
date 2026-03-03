# Forge — Infrastructure Topology

**Generated**: 2026-03-02T22:00:00Z

## MCP Server Wiring

**Transport**: stdio (stdin/stdout JSON-RPC)
**Server name**: `forge-tools`
**Launch command** (after install): `node ~/.local/bin/../ [FORGE_DIR]/server/dist/index.js`
**Config location**: `~/.claude/settings.local.json` (key: `mcpServers["forge-tools"]`)

The server is registered as:
```json
{
  "forge-tools": {
    "command": "node",
    "args": ["[FORGE_DIR]/server/dist/index.js"],
    "env": {}
  }
}
```

Claude Code starts the MCP server process on session init. All communication is over stdio; no network ports are opened.

## CLI Dispatcher

**Installed path**: `~/.local/bin/forge`
**Invocations**:
- `forge build`   → `node [FORGE_DIR]/server/dist/cli/index.js build`
- `forge improve` → `node [FORGE_DIR]/server/dist/cli/index.js improve [files...]`
- `forge update`  → `[FORGE_DIR]/update.sh`
- `forge uninstall` → `[FORGE_DIR]/uninstall.sh`

The dispatcher is a generated bash script baked at install time with a shell-safe `printf %q` representation of `FORGE_DIR`. It does not shell out to `pnpm` — it calls `node` directly on the compiled `dist/cli/index.js`.

## Install Destinations

| Asset type | Source | Destination |
|---|---|---|
| Slash commands | `commands/forge/*.md` | `~/.claude/commands/forge/*.md` |
| Agents | `agents/*.md` | `~/.claude/agents/*.md` |
| Workflows | `workflows/forge/*.md` | `~/.claude/workflows/forge/*.md` |
| MCP config | merged at install | `~/.claude/settings.local.json` |
| User config | initialized once | `~/.forge/config.json` |
| CLI dispatcher | generated at install | `~/.local/bin/forge` |
| Version marker | git tag or "dev" | `~/.forge/version` |
| Server binary | compiled from source | `[FORGE_DIR]/server/dist/index.js` |
| CLI binary | compiled from source | `[FORGE_DIR]/server/dist/cli/index.js` |
| Custom backups | modified files on update | `~/.forge-custom/[filename].[timestamp].bak` |

**Local-scope install** (`install.sh --local`): all `~/.claude/` destinations redirect to `./.claude/` in the current working directory.

## Project-Level Runtime State (`.forge/`)

Created inside each project that uses forge. Not installed by the installer — created by workflows at runtime.

| Path | Purpose |
|---|---|
| `.forge/config.json` | Per-project settings: gates, compliance prefix, concurrency |
| `.forge/plans/` | Plan markdown files consumed by `forge build` |
| `.forge/specs/` | Spec documents produced by `/forge:spec` |
| `.forge/state/current.md` | Current session/build state |
| `.forge/state/sessions/` | Per-session state snapshots |
| `.forge/state/BLOCKER.md` | Written when build loop encounters an unrecoverable failure |
| `.forge/handoffs/` | Session handoff documents |
| `.forge/discuss/` | Discussion artifacts from `/forge:discuss` |
| `.forge/instincts/` | Learned patterns from `/forge:learn` |
| `.forge/skills/` | Project-specific skill files |
| `.forge/logs/` | Operational logs |
| `.forge/map/` | This directory — generated project maps |
| `.forge/compliance/audit-trail.md` | Append-only compliance audit log |
| `.forge/compliance/change-requests/` | CR documents (Gate 1 + Gate 2 review) |
| `.forge/compliance/deployment-logs/` | Deployment records (Gate 3) |
| `.forge/compliance/security-audits/` | Security audit reports |
| `.forge/compliance/incidents/` | Incident response records |

## Build Loop Data Flow

```
forge build
  └─ dist/cli/index.js
       └─ runBuild()
            ├─ parsePlanFiles(.forge/plans/)
            ├─ groupByWave()           → ordered execution waves
            ├─ for each wave:
            │    └─ spawnClaude()      → claude subprocess (stream-json output)
            │         └─ TaskPrompt + plan tasks
            ├─ attachDisplay() + createTui()  → alternate-screen TUI
            ├─ on success: runImprove()       → auto improve pass
            └─ on blocker: writeBlocker(.forge/state/BLOCKER.md)
```

## MCP Tool Counts (39 tools total)

| Module | File | Tool count |
|---|---|---|
| git | `server/src/tools/git.ts` | 10 |
| docker | `server/src/tools/docker.ts` | 9 |
| k8s | `server/src/tools/k8s.ts` | 9 |
| pnpm | `server/src/tools/pnpm.ts` | 5 |
| compliance | `server/src/tools/compliance.ts` | 6 |
