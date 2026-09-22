#!/usr/bin/env bash
# setup-hooks.sh — Metnex git hook kurulumu

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/scripts/hooks"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }
info() { echo -e "  ${CYAN}$1${RESET}"; }

echo -e "\n▶ Metnex git hook kurulumu\n"

git -C "$REPO_ROOT" config core.hooksPath scripts/hooks
ok "core.hooksPath = scripts/hooks"

chmod +x "$HOOKS_DIR"/*
ok "scripts/hooks/* → çalıştırılabilir"

chmod +x "$REPO_ROOT/scripts/backup-db.sh"
ok "scripts/backup-db.sh → çalıştırılabilir"

echo ""
info "Kurulum tamamlandı. Her git commit öncesi DB yedeği otomatik alınacak."
info "Yedekler: backup/ dizinine yazılır"
info "Geri yükleme: ./scripts/restore-db.sh --file backup/<dosya>"
echo ""
