#!/usr/bin/env bash
set -euo pipefail

FORGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${BLUE}[forge]${RESET} $*"; }
success() { echo -e "${GREEN}[forge]${RESET} $*"; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }

header "Updating forge..."

# Pull latest
cd "$FORGE_DIR"
info "Pulling latest from origin/main..."
BEFORE=$(git rev-parse HEAD)
git pull origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  info "Already up to date."
else
  info "Changes since last update:"
  git log --oneline "$BEFORE".."$AFTER"
fi

# Re-run installer in update mode
exec "$FORGE_DIR/install.sh" --update
