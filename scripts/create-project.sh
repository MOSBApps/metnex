#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") --name "Project Name" --slug project-slug [--out /abs/path] [--app-language tr-TR] [--db-collation tr-x-icu] [--db-locale-provider icu] [--port-base 7500]

Options:
  --name                Human-readable project name (example: "Risk Fabric")
  --slug                Lowercase slug used in paths/images/domains (example: riskfabric)
  --out                 Target directory for generated project (default: ../<slug>)
  --app-language        Primary product language / locale (example: tr-TR, fr-FR, en-US)
  --db-collation        Database collation to document as the default sorting rule (example: tr-x-icu)
  --db-locale-provider  Database locale provider strategy (example: icu, libc)
  --port-base           Starting port for local stack block (web=base, api=base+1, postgres=base+2, redis=base+3, minio=base+4)
USAGE
}

PROJECT_NAME=""
PROJECT_SLUG=""
OUT_DIR=""
APP_LANGUAGE=""
DB_COLLATION=""
DB_LOCALE_PROVIDER=""
PORT_BASE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      PROJECT_NAME="${2:-}"
      shift 2
      ;;
    --slug)
      PROJECT_SLUG="${2:-}"
      shift 2
      ;;
    --out)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --app-language)
      APP_LANGUAGE="${2:-}"
      shift 2
      ;;
    --db-collation)
      DB_COLLATION="${2:-}"
      shift 2
      ;;
    --db-locale-provider)
      DB_LOCALE_PROVIDER="${2:-}"
      shift 2
      ;;
    --port-base)
      PORT_BASE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_NAME" || -z "$PROJECT_SLUG" ]]; then
  echo "Error: --name and --slug are required." >&2
  usage
  exit 1
fi

if [[ ! "$PROJECT_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Error: --slug must match ^[a-z0-9][a-z0-9-]*$" >&2
  exit 1
fi

suggest_collation() {
  local lang="$1"
  case "$lang" in
    tr*|TR*) echo "tr-x-icu" ;;
    fr*|FR*) echo "fr-x-icu" ;;
    de*|DE*) echo "de-x-icu" ;;
    es*|ES*) echo "es-x-icu" ;;
    it*|IT*) echo "it-x-icu" ;;
    *) echo "en-x-icu" ;;
  esac
}

prompt_with_default() {
  local var_name="$1"
  local prompt_text="$2"
  local default_value="$3"
  local current_value="${!var_name:-}"

  if [[ -n "$current_value" ]]; then
    return 0
  fi

  if [[ ! -t 0 ]]; then
    echo "Error: ${prompt_text} must be provided via command line in non-interactive mode." >&2
    exit 1
  fi

  read -r -p "${prompt_text} [${default_value}]: " current_value
  current_value="${current_value:-$default_value}"
  printf -v "$var_name" '%s' "$current_value"
}

prompt_with_default APP_LANGUAGE "Primary product language / locale" "en-US"
prompt_with_default DB_LOCALE_PROVIDER "Database locale provider" "icu"
prompt_with_default DB_COLLATION "Database collation" "$(suggest_collation "$APP_LANGUAGE")"
prompt_with_default PORT_BASE "Local development starting port" "7500"

if [[ ! "$PORT_BASE" =~ ^[0-9]+$ ]]; then
  echo "Error: --port-base must be numeric." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKELETON_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

normalize_output_path() {
  local path="$1"

  if command -v cygpath >/dev/null 2>&1; then
    case "$path" in
      [A-Za-z]:/*|[A-Za-z]:\\*|\\\\*)
        cygpath -u "$path"
        return 0
        ;;
    esac
  fi

  printf '%s\n' "$path"
}

if [[ -z "$OUT_DIR" ]]; then
  OUT_DIR="$(cd "$SKELETON_ROOT/.." && pwd)/$PROJECT_SLUG"
else
  OUT_DIR="$(normalize_output_path "$OUT_DIR")"
fi

if [[ -e "$OUT_DIR" ]]; then
  echo "Error: target already exists: $OUT_DIR" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

copy_skeleton() {
  if ! command -v tar >/dev/null 2>&1; then
    echo "Error: tar is required to copy the skeleton." >&2
    exit 1
  fi

  (
    cd "$SKELETON_ROOT"
    tar \
      --exclude='./.git' \
      --exclude='*/.git' \
      --exclude='./node_modules' \
      --exclude='*/node_modules' \
      --exclude='./.turbo' \
      --exclude='*/.turbo' \
      --exclude='./dist' \
      --exclude='*/dist' \
      --exclude='./coverage' \
      --exclude='*/coverage' \
      --exclude='./.next' \
      --exclude='*/.next' \
      --exclude='./backup' \
      --exclude='*/backup' \
      --exclude='./.env' \
      --exclude='*/.env' \
      --exclude='./.env.local' \
      --exclude='*/.env.local' \
      --exclude='./infra/docker/.env' \
      -cf - .
  ) | (
    cd "$OUT_DIR"
    tar -xf -
  )
}

echo "Copying skeleton files..."
copy_skeleton

rm -f "$OUT_DIR/.github/.DS_Store" "$OUT_DIR/docs/.DS_Store"

if [[ -f "$OUT_DIR/apps/api/.env.example" && ! -f "$OUT_DIR/apps/api/.env" ]]; then
  cp "$OUT_DIR/apps/api/.env.example" "$OUT_DIR/apps/api/.env"
fi

if [[ -f "$OUT_DIR/apps/web/.env.example" && ! -f "$OUT_DIR/apps/web/.env.local" ]]; then
  cp "$OUT_DIR/apps/web/.env.example" "$OUT_DIR/apps/web/.env.local"
fi

PROJECT_UPPER="$(printf '%s' "$PROJECT_SLUG" | tr '[:lower:]-' '[:upper:]_')"

replace_all() {
  local pattern="$1"
  local replacement="$2"

  while IFS= read -r -d '' file; do
    if grep -Iq . "$file" && PATTERN="$pattern" perl -0ne '$found = 1 if /$ENV{PATTERN}/; END { exit($found ? 0 : 1) }' "$file"; then
      PATTERN="$pattern" REPLACEMENT="$replacement" perl -0pi -e 's/$ENV{PATTERN}/$ENV{REPLACEMENT}/g' "$file"
    fi
  done < <(
    find "$OUT_DIR" \
      \( -type d \( -name '.git' -o -name 'node_modules' -o -name '.turbo' -o -name 'dist' -o -name 'coverage' -o -name '.next' -o -name 'backup' \) -prune \) \
      -o -type f -print0
  )
}

rename_paths() {
  find "$OUT_DIR" -depth \( -name '*openmas*' -o -name '*OPENMAS*' -o -name '*PROJECT*' \) | while IFS= read -r path; do
    base="$(basename "$path")"
    dir="$(dirname "$path")"
    new_base="$base"
    new_base="${new_base//openmas/$PROJECT_SLUG}"
    new_base="${new_base//OPENMAS/$PROJECT_UPPER}"
    new_base="${new_base//PROJECT/$PROJECT_UPPER}"
    if [[ "$new_base" != "$base" ]]; then
      mv "$path" "$dir/$new_base"
    fi
  done
}

# Placeholder replacements (preferred)
echo "Applying project placeholders..."
replace_all '\{\{PROJECT_NAME\}\}' "$PROJECT_NAME"
replace_all '\{\{PROJECT_SLUG\}\}' "$PROJECT_SLUG"
replace_all '\{\{PROJECT_SLUG_UPPER\}\}' "$PROJECT_UPPER"
replace_all '\{\{APP_LANGUAGE\}\}' "$APP_LANGUAGE"
replace_all '\{\{DB_COLLATION\}\}' "$DB_COLLATION"
replace_all '\{\{DB_LOCALE_PROVIDER\}\}' "$DB_LOCALE_PROVIDER"

# Backward compatibility for older skeleton content
replace_all 'openmas' "$PROJECT_SLUG"
replace_all 'OPENMAS' "$PROJECT_UPPER"
replace_all 'OPENMAS' "$PROJECT_UPPER"

# Path/file-name replacements
echo "Renaming project paths..."
rename_paths

if [[ -f "$OUT_DIR/.project-defaults" ]]; then
  perl -0pi -e "s/^DEV_PORT_BASE=.*/DEV_PORT_BASE=$PORT_BASE/m" "$OUT_DIR/.project-defaults"
fi

cat <<DONE

Project generated successfully.
  Name: $PROJECT_NAME
  Slug: $PROJECT_SLUG
  Path: $OUT_DIR
  App language: $APP_LANGUAGE
  DB locale provider: $DB_LOCALE_PROVIDER
  DB collation: $DB_COLLATION
  Local port base: $PORT_BASE

Next steps:
  cd "$OUT_DIR"
  git init
  pnpm install
  docker compose -f infra/docker/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm dev
DONE
