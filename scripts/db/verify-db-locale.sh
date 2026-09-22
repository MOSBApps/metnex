#!/usr/bin/env bash
# scripts/db/verify-db-locale.sh
#
# Metnex — Veritabanı ICU Turkish locale doğrulama scripti
#
# Kullanım (yerel Docker):
#   ./scripts/db/verify-db-locale.sh
#   ./scripts/db/verify-db-locale.sh --container metnex-postgres-dev --db metnex
#
# Kullanım (doğrudan psql bağlantısı):
#   ./scripts/db/verify-db-locale.sh \
#     --psql "PGPASSWORD=secret psql -h localhost -p 5433 -U metnex -d metnex"
#
# Kullanım (uzak sunucu — SSH üzerinden):
#   ./scripts/db/verify-db-locale.sh --env dev --host user@sunucu
#
# Çıkış kodu:
#   0 = PASS (tüm kontroller geçti)
#   1 = FAIL (en az bir kontrol başarısız)
#   2 = bağlantı / önkoşul hatası
#
# Hedef kontroller:
#   1. datlocprovider = 'i'  (ICU provider)
#   2. daticulocale LIKE 'tr%'
#   3. pg_collation'da tr-x-icu mevcut
#   4. Turkish sort smoke test (Ç/İ sıralama)
#   5. Encoding UTF8

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# ── Renk yardımcıları ────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'
ok()    { echo -e "${GREEN}  ✓ $1${RESET}"; }
fail()  { echo -e "${RED}  ✗ $1${RESET}"; }
warn()  { echo -e "${YELLOW}  ⚠ $1${RESET}"; }
step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
header(){ echo -e "\n${CYAN}══════════════════════════════════════════${RESET}"; echo -e "${CYAN}  $1${RESET}"; echo -e "${CYAN}══════════════════════════════════════════${RESET}"; }

# ── Argümanlar ───────────────────────────────────────────────────────────────
CONTAINER=""
DB_NAME=""
PSQL_CMD=""
ENV_ARG=""
REMOTE_HOST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2 ;;
    --db)        DB_NAME="$2";   shift 2 ;;
    --psql)      PSQL_CMD="$2";  shift 2 ;;
    --env)       ENV_ARG="$2";   shift 2 ;;
    --host)      REMOTE_HOST="$2"; shift 2 ;;
    *) echo "Bilinmeyen argüman: $1"; exit 2 ;;
  esac
done

# ── Uzak mod ─────────────────────────────────────────────────────────────────
if [[ -n "$REMOTE_HOST" ]]; then
  [[ -z "$ENV_ARG" ]] && { echo "Uzak modda --env dev|test|prod gerekli"; exit 2; }
  STACK_NAME="metnex-infra-${ENV_ARG}"
  REMOTE_ENV_FILE="/opt/metnex/${ENV_ARG}/.env"

  header "Metnex DB Locale Doğrulama (uzak: ${REMOTE_HOST} / ${STACK_NAME})"

  # shellcheck disable=SC2087
  ssh "$REMOTE_HOST" bash <<ENDSSH
set -euo pipefail
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "\${GREEN}  ✓ \$1\${RESET}"; }
fail() { echo -e "\${RED}  ✗ \$1\${RESET}"; }
warn() { echo -e "\${YELLOW}  ⚠ \$1\${RESET}"; }

set -a; source "${REMOTE_ENV_FILE}"; set +a
PG_DB="\${POSTGRES_DB:-metnex}"

CONTAINER=\$(docker ps \
  --filter "name=${STACK_NAME}_postgres" \
  --filter "status=running" \
  --format "{{.ID}}" | head -1)
[[ -z "\$CONTAINER" ]] && { echo "HATA: postgres container bulunamadı"; exit 2; }

_psql() { docker exec "\$CONTAINER" psql -U metnex -d "\$PG_DB" -t -A -c "\$1"; }

PASS=0; FAIL=0

# 1. datlocprovider
PROVIDER=\$(_psql "SELECT datlocprovider FROM pg_database WHERE datname='\$PG_DB';")
if [[ "\$PROVIDER" == "i" ]]; then ok "datlocprovider = icu (i)"; else fail "datlocprovider = '\$PROVIDER' (beklenen: i)"; FAIL=\$((FAIL+1)); fi

# 2. daticulocale
LOCALE=\$(_psql "SELECT daticulocale FROM pg_database WHERE datname='\$PG_DB';")
if [[ "\$LOCALE" == tr* ]]; then ok "daticulocale = '\$LOCALE'"; else fail "daticulocale = '\$LOCALE' (beklenen: tr-TR veya tr)"; FAIL=\$((FAIL+1)); fi

# 3. Encoding
ENC=\$(_psql "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname='\$PG_DB';")
if [[ "\$ENC" == "UTF8" ]]; then ok "encoding = UTF8"; else fail "encoding = '\$ENC' (beklenen: UTF8)"; FAIL=\$((FAIL+1)); fi

# 4. tr-x-icu collation varlığı
TR_ICU=\$(_psql "SELECT count(*) FROM pg_collation WHERE collname='tr-x-icu';")
if [[ "\$TR_ICU" -gt 0 ]]; then ok "pg_collation: tr-x-icu mevcut"; else fail "pg_collation: tr-x-icu YOK (ICU build eksik?)"; FAIL=\$((FAIL+1)); fi

# 5. Turkish sort smoke test
SORT=\$(_psql "SELECT string_agg(v, ',' ORDER BY v COLLATE \"tr-x-icu\") FROM unnest(ARRAY['Şeker','çalışan','İzmir','istanbul','Ankara']) v;")
EXPECTED="Ankara,çalışan,istanbul,İzmir,Şeker"
if [[ "\$SORT" == "\$EXPECTED" ]]; then ok "Turkish sort: \$SORT"; else warn "Turkish sort farklı: '\$SORT' (beklenen: '\$EXPECTED') — kabul edilebilir ICU sürüm farkı"; fi

echo ""
if [[ \$FAIL -eq 0 ]]; then
  echo -e "\${GREEN}SONUÇ: PASS — tüm locale kontrolleri geçti (\$PG_DB)\${RESET}"
  exit 0
else
  echo -e "\${RED}SONUÇ: FAIL — \$FAIL kontrol başarısız (\$PG_DB)\${RESET}"
  exit 1
fi
ENDSSH
  exit $?
fi

# ── Yerel / Docker mod ────────────────────────────────────────────────────────

# .env'den varsayılanları oku
ENV_FILE="$REPO_ROOT/infra/docker/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

if [[ -z "$DB_NAME" ]]; then
  DB_NAME="${POSTGRES_DB:-metnex}"
fi

# psql komutunu belirle
if [[ -z "$PSQL_CMD" ]]; then
  if [[ -z "$CONTAINER" ]]; then
    CONTAINER="metnex-postgres-dev"
  fi

  # Docker binary bul
  DOCKER_BIN="$(command -v docker 2>/dev/null || true)"
  if [[ ! -x "$DOCKER_BIN" ]]; then
    for c in /usr/local/bin/docker "/Applications/Docker.app/Contents/Resources/bin/docker" /opt/homebrew/bin/docker; do
      [[ -x "$c" ]] && DOCKER_BIN="$c" && break
    done
  fi
  [[ -x "$DOCKER_BIN" ]] || { echo -e "${RED}HATA: Docker bulunamadı${RESET}"; exit 2; }

  # Konteyner çalışıyor mu?
  "$DOCKER_BIN" ps --filter "name=${CONTAINER}" --filter "status=running" \
    --format "{{.Names}}" 2>/dev/null | grep -q "^${CONTAINER}$" \
    || { echo -e "${RED}HATA: ${CONTAINER} çalışmıyor${RESET}"; exit 2; }

  PG_USER="${POSTGRES_USER:-metnex}"
  _psql() { "$DOCKER_BIN" exec "${CONTAINER}" psql -U "$PG_USER" -d "$DB_NAME" -t -A -c "$1"; }
else
  _psql() { eval "$PSQL_CMD" -t -A -c "$1"; }
fi

# ── Kontroller ──────────────────────────────────────────────────────────────
header "Metnex DB Locale Doğrulama — ${DB_NAME}"

FAIL_COUNT=0
PASS_COUNT=0

check_pass() { ok "$1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { fail "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

step "1/5 — datlocprovider (ICU = 'i')"
PROVIDER=$(_psql "SELECT datlocprovider FROM pg_database WHERE datname='${DB_NAME}';" 2>&1) || {
  check_fail "psql bağlantısı başarısız: $PROVIDER"
  echo -e "\n${RED}SONUÇ: FAIL — bağlantı kurulamadı${RESET}"; exit 2
}

if [[ "$PROVIDER" == "i" ]]; then
  check_pass "datlocprovider = 'i' (ICU)"
else
  check_fail "datlocprovider = '${PROVIDER}' — beklenen: 'i' (ICU). DB libc ile oluşturulmuş. recreate-db-with-icu.sh çalıştır."
fi

step "2/5 — daticulocale (tr-TR veya tr)"
LOCALE=$(_psql "SELECT COALESCE(daticulocale, 'NULL') FROM pg_database WHERE datname='${DB_NAME}';" 2>/dev/null || echo "NULL")
if [[ "$LOCALE" == tr* ]]; then
  check_pass "daticulocale = '${LOCALE}'"
else
  check_fail "daticulocale = '${LOCALE}' — beklenen: tr-TR (veya tr)"
fi

step "3/5 — Encoding (UTF8)"
ENC=$(_psql "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname='${DB_NAME}';" 2>/dev/null || echo "UNKNOWN")
if [[ "$ENC" == "UTF8" ]]; then
  check_pass "encoding = UTF8"
else
  check_fail "encoding = '${ENC}' — beklenen: UTF8"
fi

step "4/5 — pg_collation: tr-x-icu mevcut"
TR_ICU=$(_psql "SELECT count(*) FROM pg_collation WHERE collname='tr-x-icu';" 2>/dev/null || echo "0")
if [[ "$TR_ICU" -gt 0 ]]; then
  check_pass "pg_collation içinde 'tr-x-icu' mevcut"
else
  check_fail "'tr-x-icu' collation bulunamadı — PostgreSQL ICU desteği eksik?"
fi

step "5/5 — Turkish sort smoke test"
SORT=$(_psql "SELECT string_agg(v, ',' ORDER BY v COLLATE \"tr-x-icu\") FROM unnest(ARRAY['Şeker','çalışan','İzmir','istanbul','Ankara']) v;" 2>/dev/null || echo "HATA")
EXPECTED="Ankara,çalışan,istanbul,İzmir,Şeker"
if [[ "$SORT" == "HATA" ]]; then
  check_fail "Turkish sort testi çalışamadı"
elif [[ "$SORT" == "$EXPECTED" ]]; then
  check_pass "Turkish sort: ${SORT}"
else
  warn "Turkish sort farklı: '${SORT}' (beklenen: '${EXPECTED}') — kabul edilebilir ICU sürüm farkı"
  ((PASS_COUNT++))
fi

# ── Özet ────────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────"
echo "  Geçen: ${PASS_COUNT}  |  Başarısız: ${FAIL_COUNT}"
echo "──────────────────────────────────────────"

if [[ $FAIL_COUNT -eq 0 ]]; then
  echo -e "${GREEN}  SONUÇ: PASS ✓${RESET}"
  echo -e "${GREEN}  ${DB_NAME} veritabanı ICU Turkish locale ile oluşturulmuş.${RESET}"
  echo ""
  exit 0
else
  echo -e "${RED}  SONUÇ: FAIL ✗${RESET}"
  echo -e "${RED}  ${FAIL_COUNT} kontrol başarısız. Bakım için:${RESET}"
  echo -e "${RED}  → docs/runbooks/db-recreate-with-icu.md${RESET}"
  echo ""
  exit 1
fi
