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
BEFORE=$(git rev-parse HEAD)
BEFORE_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "unversioned")
info "Current version: $BEFORE_TAG"
info "Pulling latest from origin/main..."
git pull origin main
AFTER=$(git rev-parse HEAD)
AFTER_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "unversioned")

if [ "$BEFORE" = "$AFTER" ]; then
  success "Already up to date. ($BEFORE_TAG)"
else
  if [ "$BEFORE_TAG" != "$AFTER_TAG" ]; then
    success "Updated: $BEFORE_TAG → $AFTER_TAG"
  else
    success "Updated: $BEFORE_TAG (tip updated, no new version tag)"
  fi
  info "Changes:"
  git log --oneline "$BEFORE".."$AFTER"
fi

# Re-run installer in update mode
exec "$FORGE_DIR/install.sh" --update
