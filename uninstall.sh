#!/usr/bin/env bash
set -euo pipefail

FORGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
BOLD='\033[1m'; RESET='\033[0m'

warn()    { echo -e "${YELLOW}[forge]${RESET} $*"; }
success() { echo -e "${GREEN}[forge]${RESET} $*"; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

header "Uninstalling forge..."
echo ""
warn "This will remove:"
warn "  ~/.claude/commands/forge/"
warn "  ~/.claude/agents/forge-*.md"
warn "  ~/.claude/workflows/forge/"
warn "  ~/.local/bin/forge"
warn "  MCP server entries from ~/.claude/settings.local.json"
echo ""
warn "This will NOT remove:"
warn "  ~/.forge/config.json (your preferences)"
warn "  ~/.forge-custom/ (your backed-up customizations)"
warn "  $FORGE_DIR (the forge source)"
warn "  Any project .forge/ directories (your compliance artifacts)"
echo ""
read -rp "Continue? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

header "Removing..."

# Commands
rm -rf "$HOME/.claude/commands/forge"
success "Removed commands"

# Agents
for f in "$HOME/.claude/agents/forge-"*.md; do
  [ -f "$f" ] && rm "$f"
done
success "Removed agents"

# Workflows
rm -rf "$HOME/.claude/workflows/forge"
success "Removed workflows"

# Dispatcher
[ -f "$HOME/.local/bin/forge" ] && rm "$HOME/.local/bin/forge"
success "Removed forge command"

# MCP config entries
MCP_CONFIG="$HOME/.claude/settings.local.json"
if [ -f "$MCP_CONFIG" ]; then
  node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'fs';
const path = process.env.HOME + '/.claude/settings.local.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
const servers = config.mcpServers || {};
delete servers['forge-tools'];
delete servers['nuxt-docs'];
delete servers['nuxt-ui'];
delete servers['context7'];
config.mcpServers = servers;
writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
EOF
  success "Removed MCP server entries"
fi

header "Forge uninstalled."
echo ""
echo "To reinstall: cd $FORGE_DIR && ./install.sh"
echo "To remove source: rm -rf $FORGE_DIR"
