#!/usr/bin/env bash
set -euo pipefail

# ─── Forge Installer ──────────────────────────────────────────────────────────
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/daresthedevil/forge/main/install.sh | bash
#   OR: git clone https://github.com/daresthedevil/forge ~/.forge && ~/.forge/install.sh
#   OR: ~/.forge/install.sh --local   (install to ./.claude/ instead of ~/.claude/)
#   OR: ~/.forge/install.sh --update  (called by `forge update`)

FORGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCOPE="global"
IS_UPDATE=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --local)   SCOPE="local" ;;
    --update)  IS_UPDATE=true ;;
  esac
done

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}[forge]${RESET} $*"; }
success() { echo -e "${GREEN}[forge]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[forge]${RESET} $*"; }
error()   { echo -e "${RED}[forge]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

# ─── Prerequisites ────────────────────────────────────────────────────────────
header "Checking prerequisites..."

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "Required command not found: $1"
    error "Install $1 and try again."
    exit 1
  fi
  success "$1 found ($(command -v "$1"))"
}

check_cmd node
check_cmd git
check_cmd pnpm

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  error "Node.js >= 20 required. Found: $NODE_VERSION"
  exit 1
fi
success "Node.js $NODE_VERSION (>= 20 required)"

# ─── Target directory ─────────────────────────────────────────────────────────
if [ "$SCOPE" = "global" ]; then
  CLAUDE_DIR="$HOME/.claude"
else
  CLAUDE_DIR="$(pwd)/.claude"
fi

header "Installing to: $CLAUDE_DIR"
mkdir -p "$CLAUDE_DIR"/{commands,agents,workflows/forge,skills}

# ─── Build MCP server ─────────────────────────────────────────────────────────
header "Building MCP tools server..."
cd "$FORGE_DIR/server"
pnpm install --silent
pnpm --silent build
success "MCP server built → $FORGE_DIR/server/dist/index.js"
cd "$FORGE_DIR"

# ─── Backup local modifications before overwriting ────────────────────────────
backup_if_modified() {
  local src="$1" dst="$2"
  if [ -f "$dst" ] && ! diff -q "$src" "$dst" &>/dev/null; then
    local backup_dir="$HOME/.forge-custom"
    mkdir -p "$backup_dir"
    local backup="$backup_dir/$(basename "$dst").$(date +%Y%m%d%H%M%S).bak"
    cp "$dst" "$backup"
    warn "Backed up modified $(basename "$dst") → $backup"
  fi
}

# ─── Install commands ─────────────────────────────────────────────────────────
header "Installing commands..."
mkdir -p "$CLAUDE_DIR/commands/forge"
for f in "$FORGE_DIR/commands/forge/"*.md; do
  dst="$CLAUDE_DIR/commands/forge/$(basename "$f")"
  backup_if_modified "$f" "$dst"
  cp "$f" "$dst"
done
success "$(ls "$FORGE_DIR/commands/forge/" | wc -l | tr -d ' ') commands installed"

# ─── Install agents ───────────────────────────────────────────────────────────
header "Installing agents..."
for f in "$FORGE_DIR/agents/"*.md; do
  dst="$CLAUDE_DIR/agents/$(basename "$f")"
  backup_if_modified "$f" "$dst"
  cp "$f" "$dst"
done
success "$(ls "$FORGE_DIR/agents/" | wc -l | tr -d ' ') agents installed"

# ─── Install workflows ────────────────────────────────────────────────────────
header "Installing workflows..."
mkdir -p "$CLAUDE_DIR/workflows/forge"
for f in "$FORGE_DIR/workflows/forge/"*.md; do
  dst="$CLAUDE_DIR/workflows/forge/$(basename "$f")"
  backup_if_modified "$f" "$dst"
  cp "$f" "$dst"
done
success "$(ls "$FORGE_DIR/workflows/forge/" | wc -l | tr -d ' ') workflows installed"

# ─── Configure MCP servers ────────────────────────────────────────────────────
header "Configuring MCP servers..."

MCP_CONFIG="$CLAUDE_DIR/settings.local.json"
SERVER_DIST="$FORGE_DIR/server/dist/index.js"

# Use node to merge MCP config — reads the file itself to avoid bash heredoc quoting issues
node --input-type=module <<EOF
import { readFileSync, writeFileSync, existsSync } from 'fs';

let existing = {};
const configPath = '${MCP_CONFIG}';
if (existsSync(configPath)) {
  try { existing = JSON.parse(readFileSync(configPath, 'utf8')); } catch (_) {}
}

const mcpServers = existing.mcpServers || {};

// Our custom tools server
mcpServers['forge-tools'] = {
  command: 'node',
  args: ['${SERVER_DIST}'],
  env: {}
};

// Nuxt framework docs (official, first-party)
mcpServers['nuxt-docs'] = {
  command: 'npx',
  args: ['-y', 'mcp-remote', 'https://mcp.nuxt.com/']
};

// Nuxt UI components (official, first-party)
mcpServers['nuxt-ui'] = {
  command: 'npx',
  args: ['-y', 'mcp-remote', 'https://ui.nuxt.com/mcp']
};

// Context7 for TailwindCSS and general library docs
mcpServers['context7'] = {
  command: 'npx',
  args: ['-y', '@upstash/context7-mcp']
};

const config = { ...existing, mcpServers };
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log('MCP config written');
EOF

success "4 MCP servers configured in $MCP_CONFIG"
info "  forge-tools  → $(basename "$SERVER_DIST") (git, docker, k8s, pnpm)"
info "  nuxt-docs    → https://mcp.nuxt.com/ (Nuxt framework docs)"
info "  nuxt-ui      → https://ui.nuxt.com/mcp (Nuxt UI components)"
info "  context7     → @upstash/context7-mcp (TailwindCSS + general docs)"

# ─── Install forge user config ────────────────────────────────────────────────
header "Initializing user config..."
FORGE_CONFIG="$HOME/.forge/config.json"
if [ ! -f "$FORGE_CONFIG" ]; then
  mkdir -p "$HOME/.forge"
  cat > "$FORGE_CONFIG" <<'JSONEOF'
{
  "model_profile": "balanced",
  "github_username": ""
}
JSONEOF
  success "Created $FORGE_CONFIG"
else
  info "User config already exists: $FORGE_CONFIG"
fi

# ─── Install forge dispatcher ─────────────────────────────────────────────────
header "Installing forge command..."
FORGE_BIN="$HOME/.local/bin/forge"
mkdir -p "$HOME/.local/bin"

# Produce a shell-safe (printf %q) representation of FORGE_DIR so that paths
# containing spaces, quotes, or special characters are correctly baked in.
FORGE_DIR_SAFE=$(printf '%q' "$FORGE_DIR")

cat > "$FORGE_BIN" <<SHEOF
#!/usr/bin/env bash
# forge — dispatcher for forge commands
# Installed from: $FORGE_DIR_SAFE
FORGE_DIR=$FORGE_DIR_SAFE

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
SHEOF
chmod +x "$FORGE_BIN"
success "forge command installed → $FORGE_BIN"
info "  forge build     → runs the autonomous build loop"
info "  forge improve   → runs the improve loop"
info "  forge update    → pull latest and rebuild"
info "  forge uninstall → remove forge from this machine"

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  warn "~/.local/bin is not in your PATH."
  warn "Add this to your ~/.zshrc or ~/.bashrc:"
  warn '  export PATH="$HOME/.local/bin:$PATH"'
fi

# ─── Write version marker for statusline ──────────────────────────────────────
FORGE_VERSION_TAG=$(git -C "$FORGE_DIR" describe --tags --abbrev=0 2>/dev/null || echo "dev")
mkdir -p "$HOME/.forge"
echo "$FORGE_VERSION_TAG" > "$HOME/.forge/version"

# ─── Done ─────────────────────────────────────────────────────────────────────
header "Installation complete!"
echo ""
if [ "$IS_UPDATE" = true ]; then
  success "Forge updated successfully."
else
  success "Forge installed successfully."
  echo ""
  echo -e "  ${BOLD}Next steps:${RESET}"
  echo "  1. Open Claude Code in any project directory"
  echo "  2. Run /forge:map to initialize the project"
  echo "  3. Run /forge:help to see all available commands"
fi
echo ""
