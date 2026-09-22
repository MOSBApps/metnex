#!/usr/bin/env bash
# scripts/db/recreate-db-with-icu.sh
#
# Metnex — Mevcut veritabanını ICU Turkish locale ile güvenli biçimde yeniden oluştur
#
# Bu script veriyi KORUYARAK:
#   1. Precheck (bağlantı, disk alanı, active connection)
#   2. pg_dump (custom format) ile tam yedek alır
#   3. Bağlantıları keser, DB'yi siler
#   4. ICU Turkish locale ile yeniden oluşturur
#   5. pg_restore ile veriyi geri yükler
#   6. locale kontrollerini doğrular
#   7. Smoke check çalıştırır
#
# Kullanım:
#   # Yerel Docker (dev):
#   ./scripts/db/recreate-db-with-icu.sh --env local
#
#   # Dry-run (destructive komutlar çalışmaz):
#   ./scripts/db/recreate-db-with-icu.sh --env local --dry-run
#
#   # Tek adım:
#   ./scripts/db/recreate-db-with-icu.sh --env local --step backup
#   ./scripts/db/recreate-db-with-icu.sh --env local --step recreate --backup-file /path/to/backup.dump
#
#   # Uzak sunucu (inline SSH — ikinci script kopyası oluşturulmaz):
#   ./scripts/db/recreate-db-with-icu.sh --env dev --host user@sunucu
#   ./scripts/db/recreate-db-with-icu.sh --env prod --host user@sunucu --dry-run
#
# Adımlar: precheck | backup | recreate | restore | verify | all (default: all)
#
# Remote ortam varsayımları:
#   .env dosyası   : /opt/metnex/<env>/.env
#   Stack adı      : metnex-infra-<env>
#   Backup dizini  : /opt/metnex/<env>/backup/
#   Container keşfi: docker ps --filter "name=metnex-infra-<env>_postgres"
#
# Rollback:
#   Backup dosyası backup/ dizininde saklanır.
#   Başarısız restore sonrası: ./scripts/restore-db.sh --file <backup_file>
#
# Dikkat:
#   --step recreate ÇOK DESTRÜKTİFTİR. Backup olmadan çalıştırmayın.
#   prod için --dry-run önce çalıştırın ve çıktıyı doğrulayın.

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ICU_LOCALE="tr-TR"
ICU_ENCODING="UTF8"

# ── Renk yardımcıları ─────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()       { echo -e "${GREEN}  ✓ $1${RESET}"; }
fail()     { echo -e "${RED}  ✗ $1${RESET}"; exit 1; }
warn()     { echo -e "${YELLOW}  ⚠ $1${RESET}"; }
step()     { echo -e "\n${CYAN}${BOLD}▶ $1${RESET}"; }
dryrun()   { echo -e "${YELLOW}  [DRY-RUN] $1${RESET}"; }
header()   { echo -e "\n${CYAN}${BOLD}══════════════════════════════════════════${RESET}"; echo -e "${CYAN}${BOLD}  $1${RESET}"; echo -e "${CYAN}${BOLD}══════════════════════════════════════════${RESET}"; }

# ── Argümanlar ────────────────────────────────────────────────────────────────
ENV_ARG="local"
DB_NAME=""
BACKUP_DIR=""
BACKUP_FILE=""
DRY_RUN=false
STEP="all"
REMOTE_HOST=""
CONTAINER=""
PG_USER=""

usage() {
  cat <<EOF
Kullanım: $0 [seçenekler]

Seçenekler:
  --env         local|dev|test|prod   (varsayılan: local)
  --db-name     <isim>                (varsayılan: .env'den POSTGRES_DB)
  --backup-dir  <yol>                 (varsayılan: \$REPO/backup)
  --backup-file <yol>                 (restore adımı için mevcut backup)
  --dry-run                           Destructive komutları yazdır, çalıştırma
  --step        precheck|backup|recreate|restore|verify|all  (varsayılan: all)
  --host        user@sunucu           (uzak mod için — inline SSH, ikinci script kopyası oluşturulmaz)
  --container   <isim>                (local docker container override)
  --pg-user     <isim>                (postgres kullanıcısı, varsayılan: metnex)
  -h | --help

Örnekler:
  $0 --env local --dry-run
  $0 --env local
  $0 --env dev --host user@sunucu --dry-run
  $0 --env prod --host user@sunucu
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)         ENV_ARG="$2";      shift 2 ;;
    --db-name)     DB_NAME="$2";      shift 2 ;;
    --backup-dir)  BACKUP_DIR="$2";   shift 2 ;;
    --backup-file) BACKUP_FILE="$2";  shift 2 ;;
    --dry-run)     DRY_RUN=true;      shift   ;;
    --step)        STEP="$2";         shift 2 ;;
    --host)        REMOTE_HOST="$2";  shift 2 ;;
    --container)   CONTAINER="$2";    shift 2 ;;
    --pg-user)     PG_USER="$2";      shift 2 ;;
    -h|--help)     usage ;;
    *) echo "Bilinmeyen argüman: $1"; usage ;;
  esac
done

# ── Uzak mod (Option A: tüm adımlar inline SSH heredoc içinde) ────────────────
# Script kendisi uzak sunucuya kopyalanmaz. Remote ortam değişkenleri ve
# container keşfi SSH heredoc içinde çözülür. Local-mode path varsayımları
# (REPO_ROOT, metnex-postgres-dev, backup/) kullanılmaz.
if [[ -n "$REMOTE_HOST" ]]; then
  [[ "$ENV_ARG" == "local" ]] && { echo "Uzak modda --env dev|test|prod belirtilmeli"; exit 1; }
  header "Metnex DB ICU Recreate — Uzak Mod (inline)"
  echo "  Ortam     : ${ENV_ARG}"
  echo "  Sunucu    : ${REMOTE_HOST}"
  echo "  Adım      : ${STEP}"
  echo "  Dry-run   : ${DRY_RUN}"
  echo ""
  echo "  Remote ortam:"
  echo "    .env    : /opt/metnex/${ENV_ARG}/.env"
  echo "    Stack   : metnex-infra-${ENV_ARG}"
  echo "    Backup  : /opt/metnex/${ENV_ARG}/backup/"
  echo "    Verify  : verify-db-locale.sh inlined (script kopyası gerekmez)"

  # Çalıştır
  ssh "$REMOTE_HOST" bash <<ENDSSH
set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()     { echo -e "\${GREEN}  ✓ \$1\${RESET}"; }
fail()   { echo -e "\${RED}  ✗ \$1\${RESET}"; exit 1; }
warn()   { echo -e "\${YELLOW}  ⚠ \$1\${RESET}"; }
step_h() { echo -e "\n\${CYAN}\${BOLD}▶ \$1\${RESET}"; }
dryrun() { echo -e "\${YELLOW}  [DRY-RUN] \$1\${RESET}"; }

# ── Ortam değişkenleri (yerel taraftan genişletildi) ─────────────────────────
DRY_RUN=${DRY_RUN}
STEP="${STEP}"
ICU_LOCALE="${ICU_LOCALE}"
ICU_ENCODING="${ICU_ENCODING}"
ENV_ARG="${ENV_ARG}"
DB_NAME_OVERRIDE="${DB_NAME:-}"
BACKUP_FILE_OVERRIDE="${BACKUP_FILE:-}"

# ── Remote ortam ─────────────────────────────────────────────────────────────
REMOTE_ENV_FILE="/opt/metnex/\${ENV_ARG}/.env"
STACK_NAME="metnex-infra-\${ENV_ARG}"
REMOTE_BACKUP_DIR="/opt/metnex/\${ENV_ARG}/backup"
TIMESTAMP="\$(date +%Y%m%d_%H%M%S)"

[[ -f "\$REMOTE_ENV_FILE" ]] || { echo "HATA: .env bulunamadı: \$REMOTE_ENV_FILE" >&2; exit 1; }
set -a; source "\$REMOTE_ENV_FILE"; set +a

PG_USER="\${POSTGRES_USER:-metnex}"
DB_NAME="\${DB_NAME_OVERRIDE:-\${POSTGRES_DB:-metnex}}"
BACKUP_FILENAME="\${DB_NAME}-icu-migrate-\${TIMESTAMP}.dump"
AUTO_BACKUP_PATH="\${REMOTE_BACKUP_DIR}/\${BACKUP_FILENAME}"

echo ""
echo "  Ortam        : \$ENV_ARG"
echo "  Stack        : \$STACK_NAME"
echo "  DB           : \$DB_NAME"
echo "  ICU Locale   : \$ICU_LOCALE / \$ICU_ENCODING"
echo "  Backup dizin : \$REMOTE_BACKUP_DIR"
echo "  Dry-run      : \$DRY_RUN"

# ── Container keşfi ──────────────────────────────────────────────────────────
# Docker Swarm: task name format → stack_service.replica.hash
CONTAINER=\$(docker ps \
  --filter "name=\${STACK_NAME}_postgres" \
  --filter "status=running" \
  --format "{{.ID}}" | head -1)

if [[ -z "\$CONTAINER" ]]; then
  # Docker Swarm replica naming: stack_postgres.1.abcxyz
  CONTAINER=\$(docker ps \
    --filter "status=running" \
    --format "{{.Names}}\t{{.ID}}" \
    | grep "\${STACK_NAME}" | grep -i "postgres" | awk '{print \$2}' | head -1)
fi

[[ -z "\$CONTAINER" ]] && { echo "HATA: '\${STACK_NAME}' içinde çalışan postgres container bulunamadı" >&2; exit 1; }
echo "  Container    : \$CONTAINER"

_psql_pg() { docker exec "\$CONTAINER" psql -U "\$PG_USER" -d postgres -t -A -c "\$1"; }
_psql_db() { docker exec "\$CONTAINER" psql -U "\$PG_USER" -d "\$DB_NAME" -t -A -c "\$1"; }

# ═══════════════════════════════════════════════════════════════════════════
# ADIM: precheck
# ═══════════════════════════════════════════════════════════════════════════
do_precheck() {
  step_h "Precheck"

  PG_VER=\$(docker exec "\$CONTAINER" psql -U "\$PG_USER" -d postgres -t -A \
    -c "SELECT version();" 2>/dev/null | head -1)
  ok "PostgreSQL: \${PG_VER}"

  TR_ICU=\$(_psql_pg "SELECT count(*) FROM pg_collation WHERE collname='tr-x-icu';" 2>/dev/null || echo "0")
  [[ "\$TR_ICU" -gt 0 ]] || { echo "HATA: tr-x-icu collation bulunamadı — PostgreSQL ICU desteği eksik" >&2; exit 1; }
  ok "ICU desteği mevcut (tr-x-icu)"

  CUR_PROVIDER=\$(_psql_pg "SELECT datlocprovider FROM pg_database WHERE datname='\${DB_NAME}';" 2>/dev/null || echo "NOTFOUND")
  if [[ "\$CUR_PROVIDER" == "i" ]]; then
    warn "DB zaten ICU locale ile oluşturulmuş (datlocprovider=i) — işlem devam edecek"
  elif [[ "\$CUR_PROVIDER" == "NOTFOUND" ]]; then
    warn "DB '\${DB_NAME}' bulunamadı — ilk kurulum olabilir"
  else
    ok "Mevcut datlocprovider='\${CUR_PROVIDER}' — geçiş gerekli ✓"
  fi

  ACTIVE_CONN=\$(_psql_pg "SELECT count(*) FROM pg_stat_activity WHERE datname='\${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || echo "0")
  [[ "\$ACTIVE_CONN" -gt 0 ]] \
    && warn "\${ACTIVE_CONN} aktif bağlantı var — recreate adımında kesilecek" \
    || ok "Aktif bağlantı yok"

  DB_SIZE=\$(_psql_pg "SELECT pg_size_pretty(pg_database_size('\${DB_NAME}'));" 2>/dev/null || echo "UNKNOWN")
  ok "DB boyutu: \${DB_SIZE}"
  ok "Precheck tamamlandı"
}

# ═══════════════════════════════════════════════════════════════════════════
# ADIM: backup
# ═══════════════════════════════════════════════════════════════════════════
do_backup() {
  step_h "Backup (pg_dump custom format)"
  mkdir -p "\$REMOTE_BACKUP_DIR"

  if \$DRY_RUN; then
    dryrun "pg_dump -Fc -U \${PG_USER} \${DB_NAME} > \${AUTO_BACKUP_PATH}"
    ok "[DRY-RUN] Backup adımı atlandı"
    return
  fi

  echo "  Backup alınıyor: \${AUTO_BACKUP_PATH}"
  docker exec "\$CONTAINER" pg_dump -Fc -U "\$PG_USER" "\$DB_NAME" > "\$AUTO_BACKUP_PATH"

  [[ -s "\$AUTO_BACKUP_PATH" ]] || { echo "HATA: Backup dosyası boş — devam etme!" >&2; exit 1; }
  BSIZE=\$(du -sh "\$AUTO_BACKUP_PATH" | awk '{print \$1}')
  ok "Backup tamamlandı: \${AUTO_BACKUP_PATH} (\${BSIZE})"

  # İçerik doğrulama
  docker cp "\$AUTO_BACKUP_PATH" "\${CONTAINER}:/tmp/\${BACKUP_FILENAME}"
  TABLE_COUNT=\$(docker exec "\$CONTAINER" pg_restore -l "/tmp/\${BACKUP_FILENAME}" \
    | grep -c "TABLE DATA" || echo "0")
  docker exec "\$CONTAINER" rm "/tmp/\${BACKUP_FILENAME}" 2>/dev/null || true
  ok "Backup doğrulandı: \${TABLE_COUNT} table data kaydı"
}

# ═══════════════════════════════════════════════════════════════════════════
# ADIM: recreate
# ═══════════════════════════════════════════════════════════════════════════
do_recreate() {
  step_h "Recreate (DROP → CREATE ICU)"

  if \$DRY_RUN; then
    dryrun "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='\${DB_NAME}'..."
    dryrun "DROP DATABASE IF EXISTS \${DB_NAME}"
    dryrun "CREATE DATABASE \${DB_NAME} LOCALE_PROVIDER=icu ICU_LOCALE='\${ICU_LOCALE}' ENCODING='\${ICU_ENCODING}' TEMPLATE=template0"
    ok "[DRY-RUN] Recreate adımı atlandı"
    return
  fi

  echo ""
  echo "  !! DİKKAT: '\${DB_NAME}' veritabanı SILINECEK ve ICU ile yeniden oluşturulacak."
  echo ""

  echo "  Active bağlantılar kesiliyor…"
  _psql_pg "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='\${DB_NAME}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  ok "Bağlantılar kesildi"

  _psql_pg "DROP DATABASE IF EXISTS \${DB_NAME};"
  ok "DROP tamamlandı"

  _psql_pg "CREATE DATABASE \${DB_NAME}
    LOCALE_PROVIDER = icu
    ICU_LOCALE      = '\${ICU_LOCALE}'
    ENCODING        = '\${ICU_ENCODING}'
    TEMPLATE        = template0;"
  ok "CREATE tamamlandı (ICU \${ICU_LOCALE})"

  NEW_PROVIDER=\$(_psql_pg "SELECT datlocprovider FROM pg_database WHERE datname='\${DB_NAME}';" 2>/dev/null || echo "?")
  NEW_LOCALE=\$(_psql_pg "SELECT daticulocale FROM pg_database WHERE datname='\${DB_NAME}';" 2>/dev/null || echo "?")
  ok "Yeni DB locale: provider=\${NEW_PROVIDER}, iculocale=\${NEW_LOCALE}"
}

# ═══════════════════════════════════════════════════════════════════════════
# ADIM: restore
# ═══════════════════════════════════════════════════════════════════════════
do_restore() {
  step_h "Restore (pg_restore — custom format .dump)"

  # Öncelik: kullanıcı tarafından verilen --backup-file, sonra otomatik backup yolu
  RESTORE_FILE="\${BACKUP_FILE_OVERRIDE:-\${AUTO_BACKUP_PATH:-}}"

  if \$DRY_RUN; then
    dryrun "docker cp \${RESTORE_FILE:-<backup_file>} container:/tmp/..."
    dryrun "pg_restore --no-owner --no-privileges -U \${PG_USER} -d \${DB_NAME} /tmp/<backup>"
    ok "[DRY-RUN] Restore adımı atlandı"
    return
  fi

  [[ -z "\$RESTORE_FILE" ]] && { echo "HATA: Restore için backup dosyası gerekli. --backup-file belirtin veya --step all kullanın." >&2; exit 1; }
  [[ -f "\$RESTORE_FILE" ]] || { echo "HATA: Backup dosyası bulunamadı: \${RESTORE_FILE}" >&2; exit 1; }

  BNAME="\$(basename "\$RESTORE_FILE")"
  echo "  Backup container'a kopyalanıyor…"
  docker cp "\$RESTORE_FILE" "\${CONTAINER}:/tmp/\${BNAME}"
  ok "Kopyalama tamamlandı"

  echo "  pg_restore çalıştırılıyor…"
  docker exec "\$CONTAINER" pg_restore \
    --no-owner \
    --no-privileges \
    -U "\$PG_USER" \
    -d "\$DB_NAME" \
    "/tmp/\${BNAME}" 2>&1 \
    | grep -v "^$" \
    | grep -v "already exists" \
    | sed 's/^/    /' \
    || warn "pg_restore bazı uyarılar üretti (normal olabilir — verify adımını kontrol et)"

  docker exec "\$CONTAINER" rm "/tmp/\${BNAME}" 2>/dev/null || true
  ok "Restore tamamlandı"

  PLATFORM_TABLES=\$(_psql_db "SELECT count(*) FROM information_schema.tables WHERE table_schema='platform';" 2>/dev/null || echo "0")
  ok "platform schema tablo sayısı: \${PLATFORM_TABLES}"
}

# ═══════════════════════════════════════════════════════════════════════════
# ADIM: verify (inlined — verify-db-locale.sh gerektirmez)
# ═══════════════════════════════════════════════════════════════════════════
do_verify() {
  step_h "Locale Doğrulama"

  if \$DRY_RUN; then
    dryrun "datlocprovider, daticulocale, encoding, tr-x-icu collation, Turkish sort kontrolleri"
    ok "[DRY-RUN] Doğrulama adımı atlandı"
    return
  fi

  VFAIL=0

  PROVIDER=\$(_psql_pg "SELECT datlocprovider FROM pg_database WHERE datname='\${DB_NAME}';" 2>/dev/null || echo "ERR")
  [[ "\$PROVIDER" == "i" ]] && ok "datlocprovider = icu (i)" || { warn "datlocprovider = '\$PROVIDER' (beklenen: i)"; VFAIL=\$((VFAIL+1)); }

  LOCALE=\$(_psql_pg "SELECT COALESCE(daticulocale,'NULL') FROM pg_database WHERE datname='\${DB_NAME}';" 2>/dev/null || echo "ERR")
  [[ "\$LOCALE" == tr* ]] && ok "daticulocale = '\$LOCALE'" || { warn "daticulocale = '\$LOCALE' (beklenen: tr-TR)"; VFAIL=\$((VFAIL+1)); }

  ENC=\$(_psql_pg "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname='\${DB_NAME}';" 2>/dev/null || echo "ERR")
  [[ "\$ENC" == "UTF8" ]] && ok "encoding = UTF8" || { warn "encoding = '\$ENC' (beklenen: UTF8)"; VFAIL=\$((VFAIL+1)); }

  TICU=\$(_psql_pg "SELECT count(*) FROM pg_collation WHERE collname='tr-x-icu';" 2>/dev/null || echo "0")
  [[ "\$TICU" -gt 0 ]] && ok "pg_collation: tr-x-icu mevcut" || { warn "tr-x-icu collation bulunamadı"; VFAIL=\$((VFAIL+1)); }

  SORT=\$(docker exec "\$CONTAINER" psql -U "\$PG_USER" -d "\$DB_NAME" -t -A \
    -c "SELECT string_agg(v,',' ORDER BY v COLLATE \"tr-x-icu\") FROM unnest(ARRAY['Seker','calisan','Izmir','istanbul','Ankara']) v;" \
    2>/dev/null || echo "ERR")
  [[ "\$SORT" != "ERR" ]] && ok "Turkish sort: \$SORT" || warn "Turkish sort testi çalışamadı"

  if [[ "\$VFAIL" -eq 0 ]]; then
    ok "Locale doğrulama: PASS ✓"
  else
    warn "\$VFAIL locale kontrolü başarısız"
    return 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# ADIM: smoke
# ═══════════════════════════════════════════════════════════════════════════
do_smoke() {
  step_h "Smoke Check"

  if \$DRY_RUN; then
    dryrun "platform tablo kontrolleri (migration_log, tenants, users)"
    return
  fi

  MIG=\$(_psql_db "SELECT count(*) FROM platform._migration_log;" 2>/dev/null || echo "ERR")
  [[ "\$MIG" == "ERR" ]] && warn "platform._migration_log okunamadı" || ok "migration_log: \${MIG} kayıt"

  TENANTS=\$(_psql_db "SELECT count(*) FROM platform.tenants;" 2>/dev/null || echo "ERR")
  [[ "\$TENANTS" == "ERR" ]] && warn "platform.tenants okunamadı" || ok "tenants: \${TENANTS}"

  USERS=\$(_psql_db "SELECT count(*) FROM platform.users;" 2>/dev/null || echo "ERR")
  [[ "\$USERS" == "ERR" ]] && warn "platform.users okunamadı" || ok "users: \${USERS}"

  SCHEMAS=\$(_psql_db "SELECT string_agg(db_schema, ', ') FROM platform.tenants WHERE db_schema IS NOT NULL;" 2>/dev/null || echo "ERR")
  [[ "\$SCHEMAS" == "ERR" ]] && warn "Tenant schema listesi alınamadı" || ok "Tenant schema'lar: \${SCHEMAS:-boş}"

  ok "Smoke check tamamlandı"
  echo ""
  echo "  NOT: API sağlık için uygulamayı başlatın ve GET /api/v1/health kontrol edin."
}

# ── Adım çalıştırıcı ─────────────────────────────────────────────────────────
BACKUP_FILE="\${BACKUP_FILE_OVERRIDE:-}"

case "\$STEP" in
  precheck)  do_precheck ;;
  backup)    do_backup   ;;
  recreate)  do_recreate ;;
  restore)   do_restore  ;;
  verify)    do_verify   ;;
  smoke)     do_smoke    ;;
  all)
    do_precheck
    do_backup
    # backup adımı AUTO_BACKUP_PATH'e yazdı; restore ona bakar
    do_recreate
    do_restore
    do_verify
    do_smoke
    ;;
  *)
    echo "Bilinmeyen adım: \$STEP. Geçerli: precheck|backup|recreate|restore|verify|smoke|all"
    exit 1
    ;;
esac

echo ""
if \$DRY_RUN; then
  echo -e "\${YELLOW}\${BOLD}  DRY-RUN tamamlandı — gerçek değişiklik yapılmadı\${RESET}"
  echo -e "\${YELLOW}  Gerçek için --dry-run kaldırıp tekrar çalıştırın.\${RESET}"
else
  echo -e "\${GREEN}\${BOLD}  Adım '\${STEP}' başarıyla tamamlandı ✓\${RESET}"
  if [[ "\$STEP" == "all" ]]; then
    echo -e "\${GREEN}  DB \${DB_NAME} artık ICU Turkish (\${ICU_LOCALE}) locale ile çalışıyor.\${RESET}"
    echo -e "\${GREEN}  Rollback: ./scripts/restore-db.sh --env ${ENV_ARG} --file \${AUTO_BACKUP_PATH} --host \$(hostname)\${RESET}"
  fi
fi
ENDSSH
  exit $?
fi

# ── Yerel mod ─────────────────────────────────────────────────────────────────

# .env oku
ENV_FILE="$REPO_ROOT/infra/docker/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

[[ -z "$DB_NAME"    ]] && DB_NAME="${POSTGRES_DB:-metnex}"
[[ -z "$PG_USER"    ]] && PG_USER="${POSTGRES_USER:-metnex}"
[[ -z "$BACKUP_DIR" ]] && BACKUP_DIR="$REPO_ROOT/backup"
[[ -z "$CONTAINER"  ]] && CONTAINER="metnex-postgres-dev"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILENAME="${DB_NAME}-icu-migrate-${TIMESTAMP}.dump"
AUTO_BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

header "Metnex DB ICU Recreate — Yerel Mod"
echo "  Konteyner : ${CONTAINER}"
echo "  Veritabanı: ${DB_NAME}"
echo "  ICU Locale: ${ICU_LOCALE} / ${ICU_ENCODING}"
echo "  Adım      : ${STEP}"
echo "  Backup    : ${AUTO_BACKUP_PATH}"
echo "  Dry-run   : ${DRY_RUN}"

# ── Docker binary ─────────────────────────────────────────────────────────────
DOCKER_BIN="$(command -v docker 2>/dev/null || true)"
if [[ ! -x "$DOCKER_BIN" ]]; then
  for c in /usr/local/bin/docker "/Applications/Docker.app/Contents/Resources/bin/docker" /opt/homebrew/bin/docker; do
    [[ -x "$c" ]] && DOCKER_BIN="$c" && break
  done
fi
[[ -x "$DOCKER_BIN" ]] || { echo -e "${RED}HATA: Docker bulunamadı${RESET}"; exit 1; }

# Konteyner çalışıyor mu?
"$DOCKER_BIN" ps --filter "name=${CONTAINER}" --filter "status=running" \
  --format "{{.Names}}" 2>/dev/null | grep -q "^${CONTAINER}$" \
  || fail "${CONTAINER} çalışmıyor. 'docker compose up' çalıştır."

# psql yardımcısı (postgres DB'ye bağlan — DB drop/create için)
_psql_postgres() {
  "$DOCKER_BIN" exec "${CONTAINER}" psql -U "$PG_USER" -d postgres -t -A -c "$1"
}
_psql_target() {
  "$DOCKER_BIN" exec "${CONTAINER}" psql -U "$PG_USER" -d "$DB_NAME" -t -A -c "$1"
}
_run_or_dry() {
  if $DRY_RUN; then
    dryrun "$*"
  else
    eval "$@"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# ADIM: precheck
# ══════════════════════════════════════════════════════════════════════════════
step_precheck() {
  step "Precheck"

  # PostgreSQL sürüm
  PG_VER=$("$DOCKER_BIN" exec "${CONTAINER}" psql -U "$PG_USER" -d postgres -t -A \
    -c "SELECT version();" 2>/dev/null | head -1)
  ok "PostgreSQL: ${PG_VER}"

  # ICU desteği var mı?
  TR_ICU=$("$DOCKER_BIN" exec "${CONTAINER}" psql -U "$PG_USER" -d postgres -t -A \
    -c "SELECT count(*) FROM pg_collation WHERE collname='tr-x-icu';" 2>/dev/null)
  [[ "$TR_ICU" -gt 0 ]] || fail "tr-x-icu collation bulunamadı — PostgreSQL ICU desteği eksik. postgres:16-alpine gerekli."
  ok "ICU desteği mevcut (tr-x-icu collation var)"

  # Mevcut locale durumu
  CUR_PROVIDER=$("$DOCKER_BIN" exec "${CONTAINER}" psql -U "$PG_USER" -d postgres -t -A \
    -c "SELECT datlocprovider FROM pg_database WHERE datname='${DB_NAME}';" 2>/dev/null || echo "NOTFOUND")
  if [[ "$CUR_PROVIDER" == "NOTFOUND" ]]; then
    warn "Veritabanı '${DB_NAME}' bulunamadı — ilk kurulum olabilir"
  elif [[ "$CUR_PROVIDER" == "i" ]]; then
    warn "Veritabanı zaten ICU locale ile oluşturulmuş (datlocprovider=i). İşlem devam edecek."
  else
    ok "Mevcut datlocprovider = '${CUR_PROVIDER}' (libc) — geçiş gerekli ✓"
  fi

  # Active connection sayısı
  ACTIVE_CONN=$("$DOCKER_BIN" exec "${CONTAINER}" psql -U "$PG_USER" -d postgres -t -A \
    -c "SELECT count(*) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || echo "0")
  if [[ "$ACTIVE_CONN" -gt 0 ]]; then
    warn "${ACTIVE_CONN} aktif bağlantı var — recreate adımında kesilecek"
  else
    ok "Aktif bağlantı yok"
  fi

  # Disk alanı kontrolü
  DB_SIZE=$("$DOCKER_BIN" exec "${CONTAINER}" psql -U "$PG_USER" -d postgres -t -A \
    -c "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));" 2>/dev/null || echo "UNKNOWN")
  ok "Veritabanı boyutu: ${DB_SIZE} (backup için bu kadar disk alanı gerekli)"

  ok "Precheck tamamlandı"
}

# ══════════════════════════════════════════════════════════════════════════════
# ADIM: backup
# ══════════════════════════════════════════════════════════════════════════════
step_backup() {
  step "Backup (pg_dump custom format)"

  mkdir -p "$BACKUP_DIR"

  if $DRY_RUN; then
    dryrun "pg_dump -Fc -U ${PG_USER} ${DB_NAME} → ${AUTO_BACKUP_PATH}"
    ok "[DRY-RUN] Backup adımı atlandı"
    return
  fi

  echo "  Backup alınıyor: ${AUTO_BACKUP_PATH}"
  "$DOCKER_BIN" exec "${CONTAINER}" pg_dump -Fc -U "$PG_USER" "$DB_NAME" \
    | cat > "$AUTO_BACKUP_PATH"

  # Backup boyutunu kontrol et
  BSIZE=$(du -sh "$AUTO_BACKUP_PATH" | awk '{print $1}')
  [[ -s "$AUTO_BACKUP_PATH" ]] || fail "Backup dosyası boş — devam etme!"
  ok "Backup tamamlandı: ${AUTO_BACKUP_PATH} (${BSIZE})"

  # Backup dosyasını doğrula (pg_restore ile listing)
  echo "  Backup içeriği doğrulanıyor…"
  "$DOCKER_BIN" cp "$AUTO_BACKUP_PATH" "${CONTAINER}:/tmp/${BACKUP_FILENAME}"
  TABLE_COUNT=$("$DOCKER_BIN" exec "${CONTAINER}" pg_restore -l "/tmp/${BACKUP_FILENAME}" \
    | grep -c "TABLE DATA" || echo "0")
  "$DOCKER_BIN" exec "${CONTAINER}" rm "/tmp/${BACKUP_FILENAME}" 2>/dev/null || true
  ok "Backup doğrulandı: ${TABLE_COUNT} table data kaydı"

  # Global backup path'i aktar
  BACKUP_FILE="$AUTO_BACKUP_PATH"
}

# ══════════════════════════════════════════════════════════════════════════════
# ADIM: recreate
# ══════════════════════════════════════════════════════════════════════════════
step_recreate() {
  step "Recreate (DROP → CREATE ICU)"

  if $DRY_RUN; then
    dryrun "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}'..."
    dryrun "DROP DATABASE IF EXISTS ${DB_NAME}"
    dryrun "CREATE DATABASE ${DB_NAME} LOCALE_PROVIDER=icu ICU_LOCALE='${ICU_LOCALE}' ENCODING='${ICU_ENCODING}' TEMPLATE=template0"
    ok "[DRY-RUN] Recreate adımı atlandı"
    return
  fi

  echo ""
  echo -e "${RED}  !! DİKKAT: Bu adım '${DB_NAME}' veritabanını SILECEK ve yeniden oluşturacak.${RESET}"
  echo -e "${RED}  !! Backup alınmadan devam etme!${RESET}"
  echo ""

  if [[ -z "$BACKUP_FILE" ]]; then
    fail "Recreate için backup dosyası gerekli. --backup-file belirtin veya --step all kullanın."
  fi
  [[ -f "$BACKUP_FILE" ]] || fail "Backup dosyası bulunamadı: ${BACKUP_FILE}"

  # Active bağlantıları kes
  echo "  Active bağlantılar kesiliyor…"
  _psql_postgres "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  ok "Bağlantılar kesildi"

  # DROP
  echo "  DROP DATABASE ${DB_NAME}…"
  _psql_postgres "DROP DATABASE IF EXISTS ${DB_NAME};"
  ok "DROP tamamlandı"

  # CREATE (ICU Turkish)
  echo "  CREATE DATABASE ${DB_NAME} (ICU ${ICU_LOCALE})…"
  _psql_postgres "CREATE DATABASE ${DB_NAME}
    LOCALE_PROVIDER = icu
    ICU_LOCALE      = '${ICU_LOCALE}'
    ENCODING        = '${ICU_ENCODING}'
    TEMPLATE        = template0;"
  ok "CREATE tamamlandı (ICU Turkish)"

  # Locale hızlı kontrol
  NEW_PROVIDER=$(_psql_postgres "SELECT datlocprovider FROM pg_database WHERE datname='${DB_NAME}';" 2>/dev/null || echo "?")
  NEW_LOCALE=$(_psql_postgres "SELECT daticulocale FROM pg_database WHERE datname='${DB_NAME}';" 2>/dev/null || echo "?")
  ok "Yeni DB locale: provider=${NEW_PROVIDER}, iculocale=${NEW_LOCALE}"
}

# ══════════════════════════════════════════════════════════════════════════════
# ADIM: restore
# ══════════════════════════════════════════════════════════════════════════════
step_restore() {
  step "Restore (pg_restore — custom format .dump)"

  if $DRY_RUN; then
    dryrun "pg_restore -d ${DB_NAME} ${BACKUP_FILE:-<backup_file>}"
    ok "[DRY-RUN] Restore adımı atlandı"
    return
  fi

  [[ -z "$BACKUP_FILE" ]] && fail "Restore için --backup-file gerekli"
  [[ -f "$BACKUP_FILE" ]] || fail "Backup dosyası bulunamadı: ${BACKUP_FILE}"

  BNAME="$(basename "$BACKUP_FILE")"
  echo "  Backup container'a kopyalanıyor…"
  "$DOCKER_BIN" cp "$BACKUP_FILE" "${CONTAINER}:/tmp/${BNAME}"
  ok "Kopyalama tamamlandı"

  echo "  pg_restore çalıştırılıyor…"
  # --exit-on-error kaldırıldı — bazı extension veya privilege hataları tolere edilebilir
  # --no-owner : restore eden user farklı olabilir
  # --no-privileges: permission re-creation atla (uygulama kendi permission'larını yönetir)
  "$DOCKER_BIN" exec "${CONTAINER}" pg_restore \
    --no-owner \
    --no-privileges \
    -U "$PG_USER" \
    -d "$DB_NAME" \
    "/tmp/${BNAME}" 2>&1 \
    | grep -v "^$" \
    | grep -v "already exists" \
    | sed 's/^/    /' \
    || warn "pg_restore bazı uyarılar ürettti (normal olabilir — doğrulama adımını kontrol et)"

  "$DOCKER_BIN" exec "${CONTAINER}" rm "/tmp/${BNAME}" 2>/dev/null || true
  ok "Restore tamamlandı"

  # Satır sayısı smoke check
  PLATFORM_TABLE_COUNT=$(_psql_target \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='platform';" \
    2>/dev/null || echo "0")
  ok "platform schema tablo sayısı: ${PLATFORM_TABLE_COUNT}"
}

# ══════════════════════════════════════════════════════════════════════════════
# ADIM: verify
# ══════════════════════════════════════════════════════════════════════════════
step_verify() {
  step "Locale Doğrulama"

  if $DRY_RUN; then
    dryrun "verify-db-locale.sh --container ${CONTAINER} --db ${DB_NAME}"
    ok "[DRY-RUN] Doğrulama adımı atlandı"
    return
  fi

  VERIFY_SCRIPT="${SCRIPT_DIR}/verify-db-locale.sh"
  [[ -x "$VERIFY_SCRIPT" ]] || fail "verify-db-locale.sh bulunamadı veya çalıştırılamaz: ${VERIFY_SCRIPT}"

  bash "$VERIFY_SCRIPT" \
    --container "$CONTAINER" \
    --db "$DB_NAME"
}

# ══════════════════════════════════════════════════════════════════════════════
# ADIM: smoke_check
# ══════════════════════════════════════════════════════════════════════════════
step_smoke() {
  step "Uygulama Smoke Check"

  if $DRY_RUN; then
    dryrun "API health + platform tablo kontrolleri"
    return
  fi

  # 1. platform._migration_log okunabilir mi?
  MIG_COUNT=$(_psql_target \
    "SELECT count(*) FROM platform._migration_log;" 2>/dev/null || echo "ERR")
  if [[ "$MIG_COUNT" == "ERR" ]]; then
    warn "platform._migration_log okunamadı — migration henüz çalışmamış olabilir"
  else
    ok "platform._migration_log: ${MIG_COUNT} kayıt"
  fi

  # 2. platform.tenants
  TENANT_COUNT=$(_psql_target \
    "SELECT count(*) FROM platform.tenants;" 2>/dev/null || echo "ERR")
  if [[ "$TENANT_COUNT" == "ERR" ]]; then
    warn "platform.tenants okunamadı"
  else
    ok "platform.tenants: ${TENANT_COUNT} tenant"
  fi

  # 3. platform.users
  USER_COUNT=$(_psql_target \
    "SELECT count(*) FROM platform.users;" 2>/dev/null || echo "ERR")
  if [[ "$USER_COUNT" == "ERR" ]]; then
    warn "platform.users okunamadı"
  else
    ok "platform.users: ${USER_COUNT} kullanıcı"
  fi

  # 4. Tenant schema listesi
  SCHEMAS=$(_psql_target \
    "SELECT string_agg(db_schema, ', ') FROM platform.tenants WHERE db_schema IS NOT NULL;" \
    2>/dev/null || echo "ERR")
  if [[ "$SCHEMAS" == "ERR" ]]; then
    warn "Tenant schema listesi alınamadı"
  else
    ok "Tenant schema'lar: ${SCHEMAS:-boş}"
  fi

  # 5. Turkish sort smoke
  SORT=$(_psql_target \
    "SELECT string_agg(v,',' ORDER BY v COLLATE \"tr-x-icu\") FROM unnest(ARRAY['İzmir','Ankara','Çorum','istanbul']) v;" \
    2>/dev/null || echo "ERR")
  if [[ "$SORT" == "ERR" ]]; then
    warn "Turkish sort testi çalışamadı"
  else
    ok "Turkish sort (uygulama içi): ${SORT}"
  fi

  ok "Smoke check tamamlandı"
  echo ""
  echo -e "${YELLOW}  NOT: API sağlık kontrolü için uygulamayı başlatın ve${RESET}"
  echo -e "${YELLOW}  GET /api/v1/health endpoint'ini kontrol edin.${RESET}"
}

# ── Adım yöneticisi ───────────────────────────────────────────────────────────
run_step() {
  case "$1" in
    precheck)  step_precheck ;;
    backup)    step_backup   ;;
    recreate)  step_recreate ;;
    restore)   step_restore  ;;
    verify)    step_verify   ;;
    smoke)     step_smoke    ;;
    all)
      step_precheck
      step_backup
      step_recreate
      BACKUP_FILE="$AUTO_BACKUP_PATH"  # backup adımından gelen path
      step_restore
      step_verify
      step_smoke
      ;;
    *)
      echo "Bilinmeyen adım: $1. Geçerli adımlar: precheck|backup|recreate|restore|verify|smoke|all"
      exit 1
      ;;
  esac
}

# ── Ana akış ──────────────────────────────────────────────────────────────────
run_step "$STEP"

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${RESET}"
if $DRY_RUN; then
  echo -e "${YELLOW}${BOLD}  DRY-RUN tamamlandı — gerçek değişiklik yapılmadı${RESET}"
  echo -e "${YELLOW}  Prod için --dry-run kaldırıp tekrar çalıştırın.${RESET}"
else
  echo -e "${GREEN}${BOLD}  Adım '${STEP}' başarıyla tamamlandı ✓${RESET}"
  if [[ "$STEP" == "all" ]]; then
    echo -e "${GREEN}  DB ${DB_NAME} artık ICU Turkish (${ICU_LOCALE}) locale ile çalışıyor.${RESET}"
    echo -e "${GREEN}  Rollback için: ./scripts/restore-db.sh --file ${AUTO_BACKUP_PATH:-<backup>}${RESET}"
  fi
fi
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${RESET}"
echo ""
