#!/usr/bin/env bash
# backup-db.sh — Local PostgreSQL veritabanı yedeği

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/backup"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${RESET}" >&2; }
fail() { echo -e "${RED}✗ $1${RESET}" >&2; exit 1; }
info() { echo -e "  ${CYAN}$1${RESET}" >&2; }
step() { echo -e "${YELLOW}▶ $1${RESET}" >&2; }

ENV="local"
LABEL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    *) fail "Bilinmeyen argüman: $1" ;;
  esac
done

[[ "$ENV" != "local" ]] && fail "Bu script yalnızca lokal ortamı destekler (--env local)"

DOCKER_BIN="$(command -v docker 2>/dev/null || true)"
if [[ ! -x "$DOCKER_BIN" ]]; then
  for c in /usr/local/bin/docker \
            "/Applications/Docker.app/Contents/Resources/bin/docker" \
            /opt/homebrew/bin/docker; do
    [[ -x "$c" ]] && DOCKER_BIN="$c" && break
  done
fi
[[ -x "$DOCKER_BIN" ]] || fail "Docker bulunamadı"

CONTAINER="metnex-postgres-dev"
"$DOCKER_BIN" ps --filter "name=${CONTAINER}" --filter "status=running" \
  --format "{{.Names}}" | grep -q "^${CONTAINER}$" \
  || fail "${CONTAINER} çalışmıyor. Önce './dev.sh' ile infrayı başlatın."

INFRA_ENV="$REPO_ROOT/infra/docker/.env"
PG_USER="metnex"
PG_DB="metnex"
if [[ -f "$INFRA_ENV" ]]; then
  set -a; source "$INFRA_ENV"; set +a
  PG_USER="${POSTGRES_USER:-metnex}"
  PG_DB="${POSTGRES_DB:-metnex}"
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
if [[ -n "$LABEL" ]]; then
  FILENAME="${ENV}-${PG_DB}-${TIMESTAMP}-${LABEL}.dump"
else
  FILENAME="${ENV}-${PG_DB}-${TIMESTAMP}.dump"
fi
BACKUP_PATH="$BACKUP_DIR/$FILENAME"

mkdir -p "$BACKUP_DIR"

step "DB yedeği alınıyor: ${PG_DB} → backup/${FILENAME}"

"$DOCKER_BIN" exec "${CONTAINER}" \
  pg_dump \
    --username="${PG_USER}" \
    --dbname="${PG_DB}" \
    --format=custom \
    --no-owner \
    --no-privileges \
  > "$BACKUP_PATH"

[[ -s "$BACKUP_PATH" ]] || fail "Backup dosyası oluşturulamadı veya boş: $BACKUP_PATH"

SIZE="$(du -sh "$BACKUP_PATH" | cut -f1)"
ok "Yedek alındı: backup/${FILENAME} (${SIZE})"
echo "$BACKUP_PATH"
