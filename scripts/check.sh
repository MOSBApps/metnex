#!/usr/bin/env bash
# check.sh — CI/CD öncesi yerel doğrulama
# Sırasıyla: audit → typecheck → lint → test → build → docker build (api + web)
# Hata oluştuğunda durur; başarıda yeşil özet gösterir.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Renk yardımcıları ────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }
fail() { echo -e "${RED}✗ $1${RESET}"; exit 1; }
step() { echo -e "\n${YELLOW}▶ $1${RESET}"; }

# ── Docker binary bul ────────────────────────────────────────────────────────
DOCKER_BIN="$(command -v docker 2>/dev/null || true)"
if [[ ! -x "$DOCKER_BIN" ]]; then
  for candidate in \
    /usr/local/bin/docker \
    "/Applications/Docker.app/Contents/Resources/bin/docker" \
    /opt/homebrew/bin/docker; do
    if [[ -x "$candidate" ]]; then DOCKER_BIN="$candidate"; break; fi
  done
fi

# ── Argüman ayrıştırma ───────────────────────────────────────────────────────
SKIP_DOCKER=false
for arg in "$@"; do
  [[ "$arg" == "--skip-docker" ]] && SKIP_DOCKER=true
done

if [[ -z "$DOCKER_BIN" ]]; then
  echo -e "${YELLOW}⚠ Docker bulunamadı — Docker build adımı atlanacak${RESET}"
  SKIP_DOCKER=true
fi

# ────────────────────────────────────────────────────────────────────────────
# 1. Bağımlılık güvenlik taraması
# ────────────────────────────────────────────────────────────────────────────
step "pnpm audit (high+critical)"
pnpm audit --audit-level=high || fail "Yüksek/kritik güvenlik açığı bulundu"
ok "audit"

# ────────────────────────────────────────────────────────────────────────────
# 2. TypeScript derleme kontrolü
# ────────────────────────────────────────────────────────────────────────────
step "typecheck"
pnpm run typecheck || fail "TypeScript hatası"
ok "typecheck"

# ────────────────────────────────────────────────────────────────────────────
# 3. Lint
# ────────────────────────────────────────────────────────────────────────────
step "lint"
pnpm run lint || fail "Lint hatası"
ok "lint"

# ────────────────────────────────────────────────────────────────────────────
# 4. Test
# ────────────────────────────────────────────────────────────────────────────
step "test"
pnpm run test || fail "Test hatası"
ok "test"

# ────────────────────────────────────────────────────────────────────────────
# 5. Next.js / NestJS build (Turborepo)
# ────────────────────────────────────────────────────────────────────────────
step "pnpm build"
pnpm run build || fail "Build hatası"
ok "build"

# ────────────────────────────────────────────────────────────────────────────
# 6. Docker build — CI/CD ile birebir aynı komutlar
# ────────────────────────────────────────────────────────────────────────────
if [[ "$SKIP_DOCKER" == true ]]; then
  echo -e "${YELLOW}⚠ Docker build atlandı (--skip-docker veya Docker yok)${RESET}"
else
  step "Docker build — API"
  "$DOCKER_BIN" build \
    --file apps/api/Dockerfile \
    --tag metnex-api:check-local \
    . || fail "API Docker build hatası"
  ok "Docker API"

  step "Docker build — Web"
  "$DOCKER_BIN" build \
    --file apps/web/Dockerfile \
    --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
    --tag metnex-web:check-local \
    . || fail "Web Docker build hatası"
  ok "Docker Web"

  # Geçici test imajlarını temizle
  "$DOCKER_BIN" rmi metnex-api:check-local metnex-web:check-local 2>/dev/null || true
fi

# ────────────────────────────────────────────────────────────────────────────
# Özet
# ────────────────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}  Tüm kontroller geçti — push için hazır ✓${RESET}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
