#!/usr/bin/env bash
# dev.sh — Metnex local development bootstrap
#
# Yapılanlar:
#   1. Çakışmasız port tespiti — mevcut .env portları yeniden doğrulanır
#   2. Docker infra başlatma (postgres + redis + minio)
#   3. Jasper renderer image build + compose ile başlatma + healthcheck bekleme
#   4. Uygulama .env dosyalarını doğru portlarla yazma
#      - apps/api/.env       → PORT, DATABASE_URL, REDIS_URL, REPORT_RENDER_*, geliştirme CSV fixture değişkenleri ...
#      - apps/web/.env.local → PORT, NEXT_PUBLIC_API_URL
#   5. Geliştirici için URL özeti
#
# Kullanım:
#   ./dev.sh
#   ./dev.sh --stop
#   ./dev.sh --status
#   ./dev.sh --force-renderer-rebuild   # jasper-renderer image'ını zaten mevcut olsa da yeniden build eder

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
ok()     { echo -e "${GREEN}✓ $1${RESET}"; }
warn()   { echo -e "${YELLOW}⚠ $1${RESET}"; }
fail()   { echo -e "${RED}✗ $1${RESET}"; exit 1; }
info()   { echo -e "  ${CYAN}$1${RESET}"; }
header() { echo -e "\n${BOLD}$1${RESET}"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$REPO_ROOT/infra/docker"
INFRA_ENV="$INFRA_DIR/.env"
INFRA_ENV_EXAMPLE="$INFRA_DIR/.env.example"
API_ENV="$REPO_ROOT/apps/api/.env"
WEB_ENV_LOCAL="$REPO_ROOT/apps/web/.env.local"
PROJECT_DEFAULTS="$REPO_ROOT/.project-defaults"

# TASK-027.73-R3 — development CSV fixture environment (yalnız local apps/api/.env için)
# shellcheck source=scripts/dev-fixture-env.sh
source "$REPO_ROOT/scripts/dev-fixture-env.sh"

POSTGRES_CONTAINER="metnex-postgres-dev"
REDIS_CONTAINER="metnex-redis-dev"
MINIO_CONTAINER="metnex-minio-dev"
JASPER_RENDERER_CONTAINER="metnex-jasper-renderer-dev"
JASPER_RENDERER_IMAGE="metnex-jasper-renderer:dev"

DEV_PORT_BASE=6500
if [[ -f "$PROJECT_DEFAULTS" ]]; then
  # shellcheck source=/dev/null
  source "$PROJECT_DEFAULTS"
fi

if ! [[ "$DEV_PORT_BASE" =~ ^[0-9]+$ ]]; then
  fail ".project-defaults içindeki DEV_PORT_BASE sayısal olmalı"
fi

DEFAULT_WEB_PORT=$DEV_PORT_BASE
DEFAULT_API_PORT=$((DEV_PORT_BASE + 1))
DEFAULT_POSTGRES_PORT=$((DEV_PORT_BASE + 2))
DEFAULT_REDIS_PORT=$((DEV_PORT_BASE + 3))
DEFAULT_MINIO_API_PORT=$((DEV_PORT_BASE + 4))
DEFAULT_MINIO_CONSOLE_PORT=$((DEV_PORT_BASE + 5))
DEFAULT_JASPER_RENDERER_PORT=$((DEV_PORT_BASE + 6))

MODE="start"
FORCE_RENDERER_REBUILD=false
for arg in "$@"; do
  case "$arg" in
    --stop) MODE="stop" ;;
    --status) MODE="status" ;;
    --force-renderer-rebuild) FORCE_RENDERER_REBUILD=true ;;
  esac
done

check_docker() {
  if ! command -v docker &>/dev/null; then
    fail "Docker bulunamadı. Docker Desktop veya Docker Engine + Compose plugin kurun."
  fi
  if ! docker info &>/dev/null 2>&1; then
    fail "Docker daemon çalışmıyor. Docker Desktop/Engine servisini başlatın."
  fi
}

is_port_in_use() {
  nc -z 127.0.0.1 "$1" 2>/dev/null
}

find_free_port() {
  local port=$1
  while is_port_in_use "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

is_our_api() {
  local port=$1
  curl -sf --max-time 2 "http://localhost:${port}/api/v1/health" >/dev/null 2>&1
}

is_our_web() {
  local port=$1
  curl -sf --max-time 2 "http://localhost:${port}/api/health" >/dev/null 2>&1
}

container_host_port() {
  docker port "$1" "$2" 2>/dev/null \
    | grep '0.0.0.0\|127.0.0.1' | head -1 | cut -d: -f2 | tr -d ' '
}

is_container_running() {
  docker inspect --format '{{.State.Status}}' "$1" 2>/dev/null | grep -q "^running$"
}

select_app_port() {
  local env_file="$1"
  local var_name="$2"
  local default_port="$3"
  local service_type="$4"
  local candidate=""

  if [[ -f "$env_file" ]] && grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
    candidate="$(grep "^${var_name}=" "$env_file" | head -1 | cut -d= -f2 | tr -d ' ')"
  fi

  if [[ -n "$candidate" ]] && ! [[ "$candidate" =~ ^[0-9]+$ ]]; then
    warn "$(echo "$service_type" | tr '[:lower:]' '[:upper:]') .env içindeki port geçersiz ('$candidate')"
    candidate=""
  fi

  if [[ -z "$candidate" ]]; then
    local chosen
    chosen="$(find_free_port "$default_port")"
    info "$(echo "$service_type" | tr '[:lower:]' '[:upper:]') için boş port seçildi: $chosen" >&2
    echo "$chosen"
    return
  fi

  if ! is_port_in_use "$candidate"; then
    info "$(echo "$service_type" | tr '[:lower:]' '[:upper:]') port $candidate mevcut .env'den alındı" >&2
    echo "$candidate"
    return
  fi

  local is_ours=false
  if [[ "$service_type" == "api" ]] && is_our_api "$candidate"; then
    is_ours=true
  elif [[ "$service_type" == "web" ]] && is_our_web "$candidate"; then
    is_ours=true
  fi

  if [[ "$is_ours" == "true" ]]; then
    info "$(echo "$service_type" | tr '[:lower:]' '[:upper:]') zaten bu portta çalışıyor → $candidate" >&2
    echo "$candidate"
  else
    local chosen
    chosen="$(find_free_port "$default_port")"
    warn "$(echo "$service_type" | tr '[:lower:]' '[:upper:]') portu $candidate başka proses tarafından kullanılıyor → $chosen" >&2
    echo "$chosen"
  fi
}

if [[ "$MODE" == "stop" ]]; then
  check_docker
  header "Metnex local infra durduruluyor..."
  cd "$INFRA_DIR"
  if docker compose -f docker-compose.dev.yml ps -q 2>/dev/null | grep -q .; then
    docker compose -f docker-compose.dev.yml down
    ok "İnfra durduruldu."
  else
    warn "Çalışan infra servisi bulunamadı."
  fi
  exit 0
fi

if [[ "$MODE" == "status" ]]; then
  check_docker
  header "Metnex local servis durumu"
  echo ""

  if is_container_running "$POSTGRES_CONTAINER"; then
    pg_port="$(container_host_port "$POSTGRES_CONTAINER" 5432)"
    ok "PostgreSQL çalışıyor → 127.0.0.1:${pg_port:-?}"
  else
    warn "PostgreSQL durdurulmuş"
  fi

  if is_container_running "$REDIS_CONTAINER"; then
    rd_port="$(container_host_port "$REDIS_CONTAINER" 6379)"
    ok "Redis çalışıyor → 127.0.0.1:${rd_port:-?}"
  else
    warn "Redis durdurulmuş"
  fi

  if is_container_running "$MINIO_CONTAINER"; then
    minio_port="$(container_host_port "$MINIO_CONTAINER" 9001)"
    ok "MinIO Console çalışıyor → 127.0.0.1:${minio_port:-?}"
  else
    warn "MinIO durdurulmuş"
  fi

  if is_container_running "$JASPER_RENDERER_CONTAINER"; then
    renderer_port="$(container_host_port "$JASPER_RENDERER_CONTAINER" 8088)"
    if [[ -n "$renderer_port" ]] && curl -sf --max-time 2 "http://127.0.0.1:${renderer_port}/health" >/dev/null 2>&1; then
      ok "Jasper renderer çalışıyor → http://127.0.0.1:${renderer_port} (healthy)"
    else
      warn "Jasper renderer çalışıyor ama healthcheck başarısız → 127.0.0.1:${renderer_port:-?}"
    fi
  else
    warn "Jasper renderer durdurulmuş"
  fi

  if [[ -f "$API_ENV" ]]; then
    api_port="$(grep '^PORT=' "$API_ENV" 2>/dev/null | cut -d= -f2 | tr -d ' ')"
    if [[ -n "$api_port" ]] && is_port_in_use "$api_port"; then
      if is_our_api "$api_port"; then
        ok "API çalışıyor → http://localhost:${api_port}"
      else
        warn "API port $api_port başka proses tarafından kullanılıyor"
      fi
    else
      info "API hazır → http://localhost:${api_port:-?} (henüz başlatılmamış)"
    fi
  else
    warn "API .env bulunamadı (./dev.sh çalıştırın)"
  fi

  if [[ -f "$WEB_ENV_LOCAL" ]]; then
    web_port="$(grep '^PORT=' "$WEB_ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ')"
    api_url="$(grep '^NEXT_PUBLIC_API_URL=' "$WEB_ENV_LOCAL" 2>/dev/null | cut -d= -f2 | tr -d ' ')"
    if [[ -n "$web_port" ]] && is_port_in_use "$web_port"; then
      if is_our_web "$web_port"; then
        ok "Web çalışıyor → http://localhost:${web_port}"
      else
        warn "Web port $web_port başka proses tarafından kullanılıyor"
      fi
    else
      info "Web hazır → http://localhost:${web_port:-?} (API: $api_url)"
    fi
  elif [[ -d "$REPO_ROOT/apps/web" ]]; then
    warn "Web .env.local bulunamadı (./dev.sh çalıştırın)"
  else
    info "apps/web henüz oluşturulmamış"
  fi

  echo ""
  exit 0
fi

check_docker

header "▶ Metnex local development başlatılıyor..."

if [[ ! -f "$INFRA_ENV" ]]; then
  if [[ -f "$INFRA_ENV_EXAMPLE" ]]; then
    cp "$INFRA_ENV_EXAMPLE" "$INFRA_ENV"
    warn "infra/docker/.env .example'dan oluşturuldu. Şifreleri güncelleyin: $INFRA_ENV"
  else
    cat > "$INFRA_ENV" <<'ENVEOF'
POSTGRES_USER=metnex
POSTGRES_PASSWORD=metnex_dev_2026
POSTGRES_DB=metnex
REDIS_PASSWORD=redis_dev_2026
MINIO_ROOT_USER=metnex
MINIO_ROOT_PASSWORD=minio_dev_2026
ENVEOF
    warn "infra/docker/.env varsayılan değerlerle oluşturuldu. Şifreleri güncelleyin."
  fi
fi

# shellcheck source=/dev/null
source "$INFRA_ENV"
POSTGRES_USER="${POSTGRES_USER:-metnex}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-metnex_dev_2026}"
POSTGRES_DB="${POSTGRES_DB:-metnex}"
REDIS_PASSWORD="${REDIS_PASSWORD:-redis_dev_2026}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-metnex}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minio_dev_2026}"

header "▶ Port tespiti..."
info "Port bloğu başlangıcı: $DEV_PORT_BASE"

if is_container_running "$POSTGRES_CONTAINER"; then
  POSTGRES_LOCAL_PORT="$(container_host_port "$POSTGRES_CONTAINER" 5432)"
  if [[ -z "$POSTGRES_LOCAL_PORT" ]]; then
    POSTGRES_LOCAL_PORT="$(find_free_port "$DEFAULT_POSTGRES_PORT")"
    info "PostgreSQL container çalışıyor ama port alınamadı → $POSTGRES_LOCAL_PORT seçildi"
  else
    info "PostgreSQL zaten çalışıyor → port $POSTGRES_LOCAL_PORT"
  fi
  POSTGRES_ALREADY_RUNNING=true
else
  POSTGRES_LOCAL_PORT="$(find_free_port "$DEFAULT_POSTGRES_PORT")"
  info "PostgreSQL için boş port seçildi: $POSTGRES_LOCAL_PORT"
  POSTGRES_ALREADY_RUNNING=false
fi

if is_container_running "$REDIS_CONTAINER"; then
  REDIS_LOCAL_PORT="$(container_host_port "$REDIS_CONTAINER" 6379)"
  if [[ -z "$REDIS_LOCAL_PORT" ]]; then
    REDIS_LOCAL_PORT="$(find_free_port "$DEFAULT_REDIS_PORT")"
    info "Redis container çalışıyor ama port alınamadı → $REDIS_LOCAL_PORT seçildi"
  else
    info "Redis zaten çalışıyor → port $REDIS_LOCAL_PORT"
  fi
  REDIS_ALREADY_RUNNING=true
else
  REDIS_LOCAL_PORT="$(find_free_port "$DEFAULT_REDIS_PORT")"
  info "Redis için boş port seçildi: $REDIS_LOCAL_PORT"
  REDIS_ALREADY_RUNNING=false
fi

if is_container_running "$MINIO_CONTAINER"; then
  MINIO_API_PORT="$(container_host_port "$MINIO_CONTAINER" 9000)"
  MINIO_CONSOLE_PORT="$(container_host_port "$MINIO_CONTAINER" 9001)"
  if [[ -z "$MINIO_API_PORT" ]]; then
    MINIO_API_PORT="$(find_free_port "$DEFAULT_MINIO_API_PORT")"
    info "MinIO API portu alınamadı → $MINIO_API_PORT seçildi"
  else
    info "MinIO API zaten çalışıyor → port $MINIO_API_PORT"
  fi
  if [[ -z "$MINIO_CONSOLE_PORT" ]]; then
    MINIO_CONSOLE_PORT="$(find_free_port "$DEFAULT_MINIO_CONSOLE_PORT")"
    info "MinIO container çalışıyor ama port alınamadı → $MINIO_CONSOLE_PORT seçildi"
  else
    info "MinIO zaten çalışıyor → port $MINIO_CONSOLE_PORT"
  fi
  MINIO_ALREADY_RUNNING=true
else
  MINIO_API_PORT="$(find_free_port "$DEFAULT_MINIO_API_PORT")"
  info "MinIO API için boş port seçildi: $MINIO_API_PORT"
  MINIO_CONSOLE_PORT="$(find_free_port "$DEFAULT_MINIO_CONSOLE_PORT")"
  info "MinIO için boş port seçildi: $MINIO_CONSOLE_PORT"
  MINIO_ALREADY_RUNNING=false
fi

API_PORT="$(select_app_port "$API_ENV" "PORT" "$DEFAULT_API_PORT" "api")"
WEB_PORT="$(select_app_port "$WEB_ENV_LOCAL" "PORT" "$DEFAULT_WEB_PORT" "web")"

ok "Port tespiti tamamlandı"

header "▶ Docker infra servisleri..."
cd "$INFRA_DIR"

if [[ "$POSTGRES_ALREADY_RUNNING" == "true" && "$REDIS_ALREADY_RUNNING" == "true" && "$MINIO_ALREADY_RUNNING" == "true" ]]; then
  ok "Postgres + Redis + MinIO zaten çalışıyor, yeniden başlatılmıyor."
else
  # Yalnızca infra servisleri — jasper-renderer kendi image build/healthcheck akışıyla ayrıca
  # yönetilir (aşağıda), burada dahil edilmez.
  POSTGRES_LOCAL_PORT="$POSTGRES_LOCAL_PORT" \
  REDIS_LOCAL_PORT="$REDIS_LOCAL_PORT" \
  MINIO_API_PORT="$MINIO_API_PORT" \
  MINIO_CONSOLE_PORT="$MINIO_CONSOLE_PORT" \
  docker compose -f docker-compose.dev.yml up -d postgres redis minio
  ok "Docker infra servisleri başlatıldı"
fi

header "▶ PostgreSQL sağlık kontrolü..."
MAX_RETRIES=20
for i in $(seq 1 "$MAX_RETRIES"); do
  if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -q 2>/dev/null; then
    ok "PostgreSQL hazır"
    break
  fi
  if [[ "$i" -eq "$MAX_RETRIES" ]]; then
    fail "PostgreSQL $MAX_RETRIES deneme sonrasında hazır değil."
  fi
  printf "."
  sleep 2
done

header "▶ Jasper renderer..."

# Port: reuse the already-running container's published port if there is one, otherwise pick a
# free port starting at the project's DEV_PORT_BASE-derived default (same pattern as postgres/
# redis/minio above).
if is_container_running "$JASPER_RENDERER_CONTAINER"; then
  JASPER_RENDERER_LOCAL_PORT="$(container_host_port "$JASPER_RENDERER_CONTAINER" 8088)"
  if [[ -z "$JASPER_RENDERER_LOCAL_PORT" ]]; then
    JASPER_RENDERER_LOCAL_PORT="$(find_free_port "$DEFAULT_JASPER_RENDERER_PORT")"
    info "Jasper renderer container çalışıyor ama port alınamadı → $JASPER_RENDERER_LOCAL_PORT seçildi"
  else
    info "Jasper renderer zaten çalışıyor → port $JASPER_RENDERER_LOCAL_PORT"
  fi
  JASPER_RENDERER_ALREADY_RUNNING=true
else
  JASPER_RENDERER_LOCAL_PORT="$(find_free_port "$DEFAULT_JASPER_RENDERER_PORT")"
  info "Jasper renderer için boş port seçildi: $JASPER_RENDERER_LOCAL_PORT"
  JASPER_RENDERER_ALREADY_RUNNING=false
fi

# Internal token: reuse whatever is already in infra/docker/.env so re-running dev.sh doesn't
# rotate a token apps/api/.env already trusts; generate one on first run only.
if grep -q "^REPORT_RENDER_INTERNAL_TOKEN=" "$INFRA_ENV" 2>/dev/null; then
  REPORT_RENDER_INTERNAL_TOKEN="$(grep '^REPORT_RENDER_INTERNAL_TOKEN=' "$INFRA_ENV" | head -1 | cut -d= -f2- | tr -d ' ')"
fi
if [[ -z "${REPORT_RENDER_INTERNAL_TOKEN:-}" ]]; then
  if command -v openssl &>/dev/null; then
    REPORT_RENDER_INTERNAL_TOKEN="$(openssl rand -hex 24)"
  else
    REPORT_RENDER_INTERNAL_TOKEN="dev-$(date +%s)-$$-$RANDOM"
  fi
  if grep -q "^REPORT_RENDER_INTERNAL_TOKEN=" "$INFRA_ENV" 2>/dev/null; then
    sed -i.bak "s|^REPORT_RENDER_INTERNAL_TOKEN=.*|REPORT_RENDER_INTERNAL_TOKEN=${REPORT_RENDER_INTERNAL_TOKEN}|" "$INFRA_ENV" && rm -f "${INFRA_ENV}.bak"
  else
    { echo ""; echo "# Jasper renderer internal token — otomatik üretildi: ./dev.sh"; echo "REPORT_RENDER_INTERNAL_TOKEN=${REPORT_RENDER_INTERNAL_TOKEN}"; } >> "$INFRA_ENV"
  fi
  info "REPORT_RENDER_INTERNAL_TOKEN üretildi ve infra/docker/.env'e yazıldı"
fi

# Build: only when the image is missing or --force-renderer-rebuild was passed. Renderer'ın
# zaten çalışıyor olması tek başına rebuild'i tetiklemez.
if [[ "$FORCE_RENDERER_REBUILD" == "true" ]] || ! docker image inspect "$JASPER_RENDERER_IMAGE" &>/dev/null; then
  info "Jasper renderer image build ediliyor: $JASPER_RENDERER_IMAGE"
  if ! docker build -f "$REPO_ROOT/services/jasper-renderer/Dockerfile" -t "$JASPER_RENDERER_IMAGE" "$REPO_ROOT"; then
    fail "Jasper renderer image build edilemedi"
  fi
  ok "Jasper renderer image build edildi"
else
  ok "Jasper renderer image mevcut, yeniden build edilmiyor ($JASPER_RENDERER_IMAGE) — zorlamak için: ./dev.sh --force-renderer-rebuild"
fi

if [[ "$JASPER_RENDERER_ALREADY_RUNNING" == "true" && "$FORCE_RENDERER_REBUILD" == "false" ]]; then
  ok "Jasper renderer container zaten çalışıyor, yeniden başlatılmıyor."
else
  JASPER_RENDERER_LOCAL_PORT="$JASPER_RENDERER_LOCAL_PORT" \
  REPORT_RENDER_INTERNAL_TOKEN="$REPORT_RENDER_INTERNAL_TOKEN" \
  docker compose -f docker-compose.dev.yml up -d jasper-renderer
  ok "Jasper renderer container başlatıldı"
fi

header "▶ Jasper renderer sağlık kontrolü..."
JASPER_RENDERER_HEALTHY=false
MAX_RETRIES=20
for i in $(seq 1 "$MAX_RETRIES"); do
  if curl -sf --max-time 2 "http://127.0.0.1:${JASPER_RENDERER_LOCAL_PORT}/health" >/dev/null 2>&1; then
    ok "Jasper renderer hazır"
    JASPER_RENDERER_HEALTHY=true
    break
  fi
  printf "."
  sleep 2
done
if [[ "$JASPER_RENDERER_HEALTHY" != "true" ]]; then
  fail "Jasper renderer $MAX_RETRIES deneme sonrasında healthcheck geçmedi (http://127.0.0.1:${JASPER_RENDERER_LOCAL_PORT}/health). 'docker logs $JASPER_RENDERER_CONTAINER' ile inceleyin."
fi

write_api_env() {
  mkdir -p "$(dirname "$API_ENV")"
  cat > "$API_ENV" <<APIENV
# Metnex API — local development environment
# Otomatik üretildi: ./dev.sh

NODE_ENV=development
PORT=${API_PORT}

DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_LOCAL_PORT}/${POSTGRES_DB}
REDIS_URL=redis://:${REDIS_PASSWORD}@127.0.0.1:${REDIS_LOCAL_PORT}
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=${MINIO_API_PORT}
MINIO_ACCESS_KEY=${MINIO_ROOT_USER}
MINIO_SECRET_KEY=${MINIO_ROOT_PASSWORD}
MINIO_BUCKET=metnex-dev
MINIO_USE_SSL=false

JWT_SECRET=dev-only-not-for-production-min-64-chars-padding-padding-padding-xx
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN_DAYS=7

ALLOWED_ORIGINS=http://localhost:${WEB_PORT}

SYSTEM_ADMIN_EMAIL=admin@example.com
SYSTEM_ADMIN_PASSWORD=StrongPass1!
SYSTEM_ADMIN_DISPLAY_NAME=System Administrator
SYSTEM_ROOT_TENANT_NAME=Platform
SYSTEM_ROOT_TENANT_SLUG=platform

REPORT_RENDER_ENDPOINT=http://127.0.0.1:${JASPER_RENDERER_LOCAL_PORT}/render
REPORT_RENDER_INTERNAL_TOKEN=${REPORT_RENDER_INTERNAL_TOKEN}
REPORT_RENDER_TIMEOUT_MS=15000

# Geliştirme CSV fixture (yalnız local development; production yapılandırmasına EKLENMEZ)
# REPORTING_DEV_FIXTURES=false ile kapatılır; geçersiz saat dilimi düzeltilmez, API analiz yapmaz.
REPORTING_DEV_FIXTURES=${DEV_FIXTURE_FLAG}
REPORTING_DEV_FIXTURE_SOURCE_TIMEZONE=${DEV_FIXTURE_TZ}
# Registry'siz geliştirme veri kapsamı (yalnız SCADA CSV fixture API'si; guard zincirini geçemez, registry/tenant yazmaz).
REPORTING_DEV_FIXTURE_SCOPE_BRIDGE=${DEV_FIXTURE_BRIDGE}
APIENV
}

header "▶ Uygulama .env dosyaları yazılıyor..."

# Fixture değişkenleri MEVCUT .env yazılmadan ÖNCE çözülür (kullanıcının önceki değeri korunur).
if ! resolve_dev_fixture_env "$API_ENV"; then
  fail "Geliştirme CSV fixture değişkenleri güvenli değil; düzeltip tekrar çalıştırın."
fi
write_api_env
ok "apps/api/.env yazıldı (PORT=${API_PORT}, REPORT_RENDER_ENDPOINT=http://127.0.0.1:${JASPER_RENDERER_LOCAL_PORT}/render)"
while IFS= read -r line; do info "$line"; done < <(dev_fixture_status_message)

if [[ -d "$REPO_ROOT/apps/web" ]]; then
  mkdir -p "$(dirname "$WEB_ENV_LOCAL")"
  cat > "$WEB_ENV_LOCAL" <<WEBENV
# Metnex Web — local development environment
# Otomatik üretildi: ./dev.sh

PORT=${WEB_PORT}
NEXT_PUBLIC_API_URL=http://localhost:${API_PORT}
JWT_SECRET=dev-only-not-for-production-min-64-chars-padding-padding-padding-xx
WEBENV
  ok "apps/web/.env.local yazıldı (PORT=${WEB_PORT}, API=http://localhost:${API_PORT})"
else
  info "apps/web henüz oluşturulmamış — web .env.local atlandı"
fi

header "▶ Drizzle migration..."
if ! command -v pnpm &>/dev/null; then
  warn "pnpm bulunamadı; Drizzle generate/migrate atlandı"
else
  (
    cd "$REPO_ROOT"
    pnpm --filter api db:generate
    pnpm --filter api db:migrate
  )
  ok "Drizzle migration'lar uygulandı"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}  Metnex local development ortamı hazır ✓${RESET}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "${BOLD}İnfra servisleri:${RESET}"
echo -e "  PostgreSQL       →  127.0.0.1:${POSTGRES_LOCAL_PORT}"
echo -e "  Redis            →  127.0.0.1:${REDIS_LOCAL_PORT}"
echo -e "  MinIO API        →  127.0.0.1:${MINIO_API_PORT}"
echo -e "  MinIO UI         →  127.0.0.1:${MINIO_CONSOLE_PORT}"
echo -e "  Jasper renderer  →  http://127.0.0.1:${JASPER_RENDERER_LOCAL_PORT}  (health: ${GREEN}healthy ✓${RESET})"
echo ""
echo -e "${BOLD}Uygulama URL'leri (pnpm dev ile ayağa kalkar):${RESET}"
echo -e "  API         →  http://localhost:${API_PORT}   (apps/api/.env)"
echo -e "  Web         →  http://localhost:${WEB_PORT}   (apps/web/.env.local)"
echo ""
echo -e "${BOLD}Sonraki adım:${RESET}"
echo -e "  ${CYAN}pnpm dev${RESET}"
echo ""
echo -e "Durdurmak için:  ${YELLOW}./dev.sh --stop${RESET}"
echo -e "Durum görüntüle: ${YELLOW}./dev.sh --status${RESET}"
echo ""
