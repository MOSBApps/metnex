#!/usr/bin/env bash
# restore-db.sh — Veritabanı yedeğini hedef ortama yükler
#
# Kullanım:
#   # Lokal geliştirici DB'ye (metnex-postgres-dev container)
#   ./scripts/restore-db.sh --file backup/db-20260304_123456-abc.dump
#
#   # Uzak sunucudaki dev stack'e (SSH üzerinden)
#   ./scripts/restore-db.sh --env dev --file backup/db-20260304_123456-abc.dump --host user@sunucu
#
#   # Uzak sunucudaki prod stack'e
#   ./scripts/restore-db.sh --env prod --file backup/db-20260304_123456-abc.dump --host user@sunucu
#
# Desteklenen backup formatları:
#   .dump   — pg_dump -Fc (custom format, yeni standart)
#   .sql.gz — pg_dump | gzip (eski legacy format, hâlâ desteklenir)
#   Yanlış format verilirse script açık hata verir.
#
# Gereksinimler (uzak mod): ssh, scp — sunucuda docker yetkisi olan kullanıcı
# Gereksinimler (yerel mod): docker çalışıyor olmalı

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Renk yardımcıları ────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }
fail() { echo -e "${RED}✗ $1${RESET}"; exit 1; }
step() { echo -e "\n${YELLOW}▶ $1${RESET}"; }

# ── Argümanlar ───────────────────────────────────────────────────────────────
ENV="local"   # local | dev | test | prod
BACKUP_FILE=""
REMOTE_HOST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)   ENV="$2";         shift 2 ;;
    --file)  BACKUP_FILE="$2"; shift 2 ;;
    --host)  REMOTE_HOST="$2"; shift 2 ;;
    *) fail "Bilinmeyen argüman: $1" ;;
  esac
done

[[ -z "$BACKUP_FILE" ]] && fail "--file gerekli (örn: backup/db-20260304.dump)"

# Göreceli yolu mutlak yola çevir
[[ "$BACKUP_FILE" != /* ]] && BACKUP_FILE="$REPO_ROOT/$BACKUP_FILE"
[[ -f "$BACKUP_FILE" ]] || fail "Yedek dosyası bulunamadı: $BACKUP_FILE"

BASENAME="$(basename "$BACKUP_FILE")"

# ── Backup format algılama ───────────────────────────────────────────────────
# .dump  → pg_dump -Fc custom format  → pg_restore doğrudan
# .sql.gz → pg_dump plain SQL gzip    → gunzip | psql (legacy)
case "$BASENAME" in
  *.dump)
    BACKUP_FMT="dump"
    ;;
  *.sql.gz)
    BACKUP_FMT="sqlgz"
    ;;
  *)
    fail "Bilinmeyen backup formatı: '${BASENAME}'\nDesteklenen: .dump (pg_dump -Fc), .sql.gz (eski format)"
    ;;
esac

# ── Yerel mod (local geliştirici makinesi) ───────────────────────────────────
if [[ "$ENV" == "local" && -z "$REMOTE_HOST" ]]; then
  # Docker binary bul
  DOCKER_BIN="$(command -v docker 2>/dev/null || true)"
  if [[ ! -x "$DOCKER_BIN" ]]; then
    for c in /usr/local/bin/docker "/Applications/Docker.app/Contents/Resources/bin/docker" /opt/homebrew/bin/docker; do
      [[ -x "$c" ]] && DOCKER_BIN="$c" && break
    done
  fi
  [[ -x "$DOCKER_BIN" ]] || fail "Docker bulunamadı"

  CONTAINER="metnex-postgres-dev"
  "$DOCKER_BIN" ps --filter "name=${CONTAINER}" --filter "status=running" \
    --format "{{.Names}}" | grep -q "^${CONTAINER}$" \
    || fail "${CONTAINER} çalışmıyor"

  # .env'den bağlantı bilgilerini oku
  ENV_FILE="$REPO_ROOT/infra/docker/.env"
  [[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }
  PG_USER="${POSTGRES_USER:-metnex}"
  PG_DB="${POSTGRES_DB:-metnex}"

  step "Yerel DB'ye restore: ${CONTAINER} / ${PG_DB} (format: ${BACKUP_FMT})"

  "$DOCKER_BIN" cp "$BACKUP_FILE" "${CONTAINER}:/tmp/${BASENAME}"
  ok "Yedek kopyalandı"

  # Bağlantıları kes
  "$DOCKER_BIN" exec "${CONTAINER}" psql -U "${PG_USER}" -d postgres -t -A \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${PG_DB}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true

  # ICU Turkish locale ile yeniden oluştur (DEC-0006 — DB-level ICU Turkish zorunlu)
  "$DOCKER_BIN" exec "${CONTAINER}" psql -U "${PG_USER}" -d postgres \
    -c "DROP DATABASE IF EXISTS ${PG_DB};"
  "$DOCKER_BIN" exec "${CONTAINER}" psql -U "${PG_USER}" -d postgres \
    -c "CREATE DATABASE ${PG_DB} LOCALE_PROVIDER=icu ICU_LOCALE='tr-TR' ENCODING='UTF8' TEMPLATE=template0;"
  ok "DB yeniden oluşturuldu (ICU tr-TR)"

  # Restore — format'a göre
  if [[ "$BACKUP_FMT" == "dump" ]]; then
    # Custom format: pg_restore doğrudan dosyayı okur
    "$DOCKER_BIN" exec "${CONTAINER}" pg_restore \
      --no-owner \
      --no-privileges \
      -U "${PG_USER}" \
      -d "${PG_DB}" \
      "/tmp/${BASENAME}" 2>&1 \
      | grep -v "^$" | grep -v "already exists" || true
  else
    # Legacy .sql.gz: gunzip ile aç, psql ile yükle
    "$DOCKER_BIN" exec "${CONTAINER}" bash -c \
      "gunzip -c /tmp/${BASENAME} | psql -U ${PG_USER} -d ${PG_DB}"
  fi

  "$DOCKER_BIN" exec "${CONTAINER}" rm "/tmp/${BASENAME}" 2>/dev/null || true
  ok "Restore tamamlandı → ${PG_DB}"
  exit 0
fi

# ── Uzak mod (Swarm sunucusu) ────────────────────────────────────────────────
[[ -z "$REMOTE_HOST" ]] && fail "Uzak mod için --host gerekli (örn: user@sunucu)"
[[ "$ENV" == "local" ]] && fail "Uzak modda --env dev|test|prod belirtilmeli"

REMOTE_BACKUP="/tmp/metnex-restore-${BASENAME}"
STACK_NAME="metnex-infra-${ENV}"
ENV_FILE="/opt/metnex/${ENV}/.env"

step "Yedek sunucuya aktarılıyor → ${REMOTE_HOST}:${REMOTE_BACKUP}"
scp "$BACKUP_FILE" "${REMOTE_HOST}:${REMOTE_BACKUP}"
ok "SCP tamamlandı"

step "Sunucuda restore başlatılıyor (${STACK_NAME}, format: ${BACKUP_FMT})"
# shellcheck disable=SC2087
ssh "$REMOTE_HOST" bash <<ENDSSH
set -euo pipefail

# .env'den bağlantı bilgilerini oku
[[ -f "${ENV_FILE}" ]] || { echo "HATA: .env bulunamadı: ${ENV_FILE}" >&2; exit 1; }
set -a; source "${ENV_FILE}"; set +a

PG_USER="\${POSTGRES_USER:-metnex}"
PG_DB="\${POSTGRES_DB:-metnex}"

# Postgres container'ı bul (Swarm task adından bağımsız)
CONTAINER=\$(docker ps \
  --filter "name=${STACK_NAME}_postgres" \
  --filter "status=running" \
  --format "{{.ID}}" | head -1)

if [[ -z "\$CONTAINER" ]]; then
  echo "HATA: ${STACK_NAME} içinde çalışan postgres container bulunamadı" >&2
  exit 1
fi

echo "Postgres container: \$CONTAINER"

# Backup format
BASENAME_="${BASENAME}"
BACKUP_FMT_="${BACKUP_FMT}"

# Yedek dosyasını container'a kopyala
docker cp "${REMOTE_BACKUP}" "\${CONTAINER}:/tmp/${BASENAME}"

# Bağlantıları kes
docker exec "\$CONTAINER" psql -U "\$PG_USER" -d postgres -t -A \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='\$PG_DB' AND pid <> pg_backend_pid();" \
  >/dev/null 2>&1 || true

# ICU Turkish locale ile yeniden oluştur (DEC-0006)
docker exec "\$CONTAINER" psql -U "\$PG_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \$PG_DB;"
docker exec "\$CONTAINER" psql -U "\$PG_USER" -d postgres \
  -c "CREATE DATABASE \$PG_DB LOCALE_PROVIDER=icu ICU_LOCALE='tr-TR' ENCODING='UTF8' TEMPLATE=template0;"
echo "DB yeniden oluşturuldu (ICU tr-TR)"

# Restore — format'a göre
if [[ "\$BACKUP_FMT_" == "dump" ]]; then
  # Custom format: pg_restore doğrudan dosyayı okur
  docker exec "\$CONTAINER" pg_restore \
    --no-owner \
    --no-privileges \
    -U "\$PG_USER" \
    -d "\$PG_DB" \
    "/tmp/${BASENAME}" 2>&1 \
    | grep -v "^$" | grep -v "already exists" || true
else
  # Legacy .sql.gz: gunzip ile aç, psql ile yükle
  docker exec "\$CONTAINER" bash -c \
    "gunzip -c /tmp/${BASENAME} | psql -U \$PG_USER -d \$PG_DB"
fi

docker exec "\$CONTAINER" rm "/tmp/${BASENAME}" 2>/dev/null || true

# Geçici dosyayı temizle
rm -f "${REMOTE_BACKUP}"

echo "Restore tamamlandı: \$PG_DB @ ${STACK_NAME}"
ENDSSH

ok "Uzak restore tamamlandı → ${ENV} / ${STACK_NAME}"
